import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type {
  AuthResponse,
  ClientToServerEvents,
  DriverLocationEvent,
  MapDataDto,
  OrderDto,
  ServerToClientEvents,
  TrackingDto,
  VehicleType,
} from '@yaar/shared';
import { projectOnPolyline, remainingFraction, type LatLngTuple } from '../src/lib/geo';
import { DEMO_SIMULATED_DRIVER_PHONES } from '../src/services/demo';
import {
  DEMO_MOTION_PAUSE_MS,
  DEMO_MOTION_STEP_MS,
  demoLegFor,
  demoPositionAt,
  type DemoMotionResult,
} from '../src/services/demoMotion';
import { headingForDto } from '../src/services/heading';
import { currentRoute, OFF_ROUTE_THRESHOLD_M, recomputeReason, type CachedRoute } from '../src/services/routes';
import type { DueWorkResult } from '../src/services/work';
import { call, createBusiness, createDriver, createTestApp, FakeRoutingProvider, nextPhone, P, resetDb, type TestApp } from './helpers';

/* ------------------------------ Fonction de position (pure) ------------------------------ */

// Tracé en L : 1 112 m vers le nord, puis 1 086 m vers l'est ; parcouru en 600 s.
const A: LatLngTuple = [12.36, -1.53];
const B: LatLngTuple = [12.37, -1.53];
const C: LatLngTuple = [12.37, -1.52];
const LEG = { points: [A, B, C], durationS: 600 };
const START = Date.UTC(2026, 10, 9, 8, 0, 0);
const at = (s: number) => demoPositionAt(LEG, START, START + s * 1000)!;
const ll = (p: { lat: number; lng: number }) => ({ lat: p.lat, lng: p.lng });

describe('demoPositionAt : position simulée le long d’un tracé', () => {
  it('départ, progression à vitesse constante (au prorata des longueurs), cap du segment parcouru', () => {
    expect(at(0)).toMatchObject({ lat: A[0], lng: A[1], heading: 0, progress: 0, moving: true });
    // Trois quarts du temps = trois quarts de la longueur : sur le second segment (vers l'est).
    const p = at(450);
    expect(p.lat).toBe(12.37);
    expect(p.lng).toBeGreaterThan(-1.53);
    expect(p.lng).toBeLessThan(-1.52);
    expect(p).toMatchObject({ heading: 90, moving: true });
    expect(p.progress).toBeCloseTo(0.75, 6);
    // Sur le tracé, et l'ETA de l'API (part restante × durée) = temps restant du trajet simulé.
    expect(projectOnPolyline(LEG.points, ll(p)).distanceM).toBeLessThan(0.5);
    expect(remainingFraction(LEG.points, ll(p)) * LEG.durationS).toBeCloseTo(150, 0);
    // Vitesse : longueur du tracé / durée (≈ 3,7 m/s).
    expect(p.speedMps).toBeCloseTo(projectOnPolyline(LEG.points, { lat: C[0], lng: C[1] }).totalM / 600, 6);
    // Premier segment : vers le nord.
    expect(at(100)).toMatchObject({ lng: -1.53, heading: 0 });
  });

  it('arrêt de 45 s à l’arrivée (cap du dernier segment), puis retour au départ, en boucle', () => {
    expect(DEMO_MOTION_PAUSE_MS).toBe(45_000);
    for (const s of [600, 620, 644.999])
      expect(at(s), `${s} s`).toEqual({ lat: C[0], lng: C[1], heading: 90, progress: 1, moving: false, speedMps: 0 });
    expect(at(645)).toMatchObject({ lat: A[0], lng: A[1], progress: 0, moving: true, heading: 0 });
    expect(at(645 + 450)).toEqual(at(450));
    expect(at(100 * 645 + 450)).toEqual(at(450));
  });

  it('avant le départ (horloges décalées) : au départ ; même instant = même position (toutes instances)', () => {
    expect(demoPositionAt(LEG, START, START - 5_000)).toEqual(at(0));
    expect(demoPositionAt(LEG, START, START + 123_456)).toEqual(demoPositionAt({ points: [A, B, C], durationS: 600 }, START, START + 123_456));
  });

  it('tracés dégénérés : points en double, un seul point, tracé vide, durée nulle', () => {
    const dup = { points: [A, A, B, B], durationS: 100 };
    expect(demoPositionAt(dup, START, START)).toMatchObject({ lat: A[0], lng: A[1], heading: 0 });
    expect(demoPositionAt(dup, START, START + 50_000)!.lat).toBeCloseTo((A[0] + B[0]) / 2, 6);
    expect(demoPositionAt(dup, START, START + 100_000)).toMatchObject({ lat: B[0], lng: B[1], heading: 0, moving: false });
    expect(demoPositionAt({ points: [A], durationS: 100 }, START, START + 10_000)).toEqual({
      lat: A[0], lng: A[1], heading: null, progress: 1, moving: false, speedMps: 0,
    });
    expect(demoPositionAt({ points: [], durationS: 100 }, START, START)).toBeNull();
    expect(demoPositionAt({ points: [A, B], durationS: 0 }, START, START + 10_000)).toMatchObject({ lat: B[0], moving: false });
  });

  it('durée : celle de l’itinéraire (OSRM ajustée ou ligne droite), sinon longueur à la vitesse moyenne du véhicule', () => {
    expect(demoLegFor({ points: [A, B], durationS: 300 }, 'MOTO').durationS).toBe(300);
    // 1 112 m à 22 km/h (AVERAGE_SPEED_KMH.MOTO) ≈ 182 s.
    expect(demoLegFor({ points: [A, B], durationS: 0 }, 'MOTO').durationS).toBeCloseTo(1111.95 / (22 / 3.6), 0);
    expect(demoLegFor({ points: [A, B], durationS: 0 }, 'BIKE').durationS).toBeCloseTo(1111.95 / (12 / 3.6), 0);
  });
});

/* ------------------------------ Simulation en démonstration (intégration) ------------------------------ */

const DEMO = { DEMO_MODE: 'true', REALTIME_MODE: 'poll', WORK_THROTTLE_MS: '4000', WORK_BUDGET_MS: '10000' };
const [ISSOUF, ABDOUL] = DEMO_SIMULATED_DRIVER_PHONES as [string, string];
const KARIM = '+22673000002';
const pickup = P.centre;
const start = { lat: 12.39, lng: -1.53 }; // ≈ 2,4 km au nord du point de retrait

const fake = new FakeRoutingProvider(20);
let t: TestApp;
let releaseGate: () => void = () => undefined;

beforeAll(async () => {
  t = await createTestApp(DEMO, { routing: fake });
});
afterAll(async () => {
  releaseGate();
  await t.ctx.work.settled();
  await t.app.close();
  await t.prisma.$disconnect();
});
beforeEach(async () => {
  releaseGate();
  await t.ctx.work.settled();
  await resetDb(t.prisma);
  // L'horloge ne recule jamais (le déclenchement paresseux garde l'heure de son dernier essai) : heure ronde suivante,
  // donc alignée sur les pas de 4 s.
  t.clock.set(new Date(Math.ceil((t.clock.now().getTime() + 1) / 3_600_000) * 3_600_000));
  fake.calls.length = 0;
  fake.gate = null;
  t.ctx.realtime.emitted.length = 0;
});

/** Instant du pas de simulation (heure arrondie à 4 s). */
const stepOf = (d: Date) => Math.floor(d.getTime() / DEMO_MOTION_STEP_MS) * DEMO_MOTION_STEP_MS;

/** Livraison d'entreprise affectée au livreur (numéro imposé ou aléatoire) : itinéraire vers le retrait en cache. */
async function assignedDelivery(app: TestApp, phone?: string, vehicleType: VehicleType = 'MOTO', from = start) {
  const { business } = await createBusiness(app, pickup);
  const driver = await createDriver(app, vehicleType, from, phone ? { phone } : {});
  const created = await call(app.app, 'POST', '/business/deliveries', business.accessToken, {
    dropoff: { ...P.ouaga2000, address: 'Ouaga 2000, villa 12' },
    recipientName: 'Mariam Ouédraogo',
    recipientPhone: '76 10 00 03',
    packageDescription: 'Repas',
    vehicleType,
  });
  expect(created.statusCode, created.body).toBe(201);
  const orderId = created.json<OrderDto>().id;
  const offer = await app.prisma.dispatchOffer.findFirstOrThrow({ where: { orderId, status: 'OFFERED' } });
  expect(offer.driverId).toBe(driver.user.id);
  expect((await call(app.app, 'POST', `/driver/offers/${offer.id}/accept`, driver.accessToken, {})).statusCode).toBe(200);
  await app.ctx.work.settled();
  const row = await app.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  const route = currentRoute(row);
  expect(route).toMatchObject({ target: 'PICKUP' });
  return { business, driver, orderId, token: row.trackingToken!, route: route!, vehicleType };
}

const profileOf = (userId: string) => t.prisma.driverProfile.findUniqueOrThrow({ where: { userId } });
const track = async (token: string) => {
  const r = await call(t.app, 'GET', `/track/${token}`);
  expect(r.statusCode).toBe(200);
  return r.json<TrackingDto>();
};
const motion = (r: DueWorkResult): DemoMotionResult | undefined => (r.ran ? r.demoMotion : undefined);
/** Position simulée attendue au pas courant. */
const expected = (route: CachedRoute, vt: VehicleType) =>
  demoPositionAt(demoLegFor(route, vt), route.computedAt.getTime(), stepOf(t.clock.now()))!;

/** Compte de console en démonstration : code demandé, puis code d'accès démo (123456 hors production). */
async function demoStaffToken(app: TestApp = t): Promise<string> {
  const phone = nextPhone();
  await app.prisma.user.create({ data: { phone, role: 'CONTROLLER', name: 'Contrôleur' } });
  await call(app.app, 'POST', '/auth/otp/request', null, { phone });
  return (await call(app.app, 'POST', '/auth/otp/verify', null, { phone, code: '123456' })).json<AuthResponse>().accessToken;
}

describe('DEMO_MODE=true : livreurs de démonstration en course', () => {
  it('le livreur avance sur son itinéraire (suivi, entreprise, console), l’ETA diminue, pause au retrait puis boucle', async () => {
    const a = await assignedDelivery(t, ISSOUF);
    const callsAfterSetup = fake.calls.length;
    const travelMs = a.route.durationS * 1000;
    expect(travelMs).toBeGreaterThan(5 * 60_000);
    const first = await track(a.token);
    expect(first.driver?.lastLocation).toMatchObject({ lat: start.lat, lng: start.lng });
    const eta0 = first.etaMinutes!;

    // Une minute plus tard : un pas de simulation (runDueWork) déplace le livreur sur le tracé.
    t.clock.advance(60_000);
    expect(motion(await t.ctx.work.runDueWork())).toEqual({ moved: 1, realGps: 0, waitingForRoute: 0 });
    const p1 = expected(a.route, 'MOTO');
    expect(p1.progress).toBeCloseTo(60_000 / travelMs, 3);
    const prof1 = await profileOf(a.driver.user.id);
    expect(prof1).toMatchObject({ lastLat: p1.lat, lastLng: p1.lng, lastHeading: p1.heading, lastLocationAt: new Date(stepOf(t.clock.now())) });
    const pos1 = { lat: p1.lat, lng: p1.lng };
    expect(projectOnPolyline(a.route.points, pos1).distanceM).toBeLessThan(1);
    // Sur le tracé et itinéraire récent : aucun recalcul ne serait demandé (jamais « hors itinéraire »).
    const row = await t.prisma.order.findUniqueOrThrow({ where: { id: a.orderId } });
    expect(recomputeReason(row, pos1, t.clock.now())).toBeNull();

    // Lu partout comme une vraie position : suivi public, entreprise, carte de la console ; ETA en baisse.
    const tr1 = await track(a.token);
    expect(tr1.driver?.lastLocation).toMatchObject({ ...pos1, heading: headingForDto(p1.heading) });
    expect(tr1.etaMinutes).toBe(eta0 - 1);
    const forBusiness = (await call(t.app, 'GET', `/orders/${a.orderId}`, a.business.accessToken)).json<OrderDto>();
    expect(forBusiness.driver?.lastLocation).toMatchObject(pos1);
    expect(forBusiness.etaMinutes).toBe(tr1.etaMinutes);
    const map = (await call(t.app, 'GET', '/controller/map', await demoStaffToken())).json<MapDataDto>();
    expect(map.drivers.find((d) => d.id === a.driver.user.id)).toMatchObject({ ...pos1, heading: headingForDto(p1.heading), isBusy: true });
    // Même événement qu'une vraie position (mode socket), sans historique LocationPing ni appel au service d'itinéraire.
    const events = t.ctx.realtime.emitted.filter((e) => e.event === 'driver.location');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      rooms: ['controllers', `order:${a.orderId}`],
      payload: { driverId: a.driver.user.id, ...pos1, orderId: a.orderId, at: new Date(stepOf(t.clock.now())).toISOString() },
    });
    expect(await t.prisma.locationPing.count()).toBe(0);

    // Déclenchement paresseux (mode poll) : la page de suivi elle-même fait avancer le livreur.
    t.clock.advance(60_000);
    const tr2 = await track(a.token);
    const p2 = expected(a.route, 'MOTO');
    expect(tr2.driver?.lastLocation).toMatchObject({ lat: p2.lat, lng: p2.lng });
    expect(p2.progress).toBeGreaterThan(p1.progress);
    expect(tr2.etaMinutes).toBe(eta0 - 2);

    // Arrivée au point de retrait : arrêt (45 s), part restante nulle (ETA = remise + retrait → livraison).
    t.clock.set(new Date(a.route.computedAt.getTime() + travelMs + 8_000));
    expect(motion(await t.ctx.work.runDueWork())?.moved).toBe(1);
    const last = a.route.points[a.route.points.length - 1]!;
    expect(await profileOf(a.driver.user.id)).toMatchObject({ lastLat: last[0], lastLng: last[1] });
    expect(expected(a.route, 'MOTO')).toMatchObject({ moving: false, progress: 1 });
    const legS = row.deliveryLegDurationS!;
    expect((await track(a.token)).etaMinutes).toBe(Math.ceil((120 + legS) / 60));
    t.clock.advance(20_000);
    await t.ctx.work.runDueWork();
    expect(await profileOf(a.driver.user.id)).toMatchObject({ lastLat: last[0], lastLng: last[1] });

    // Après l'arrêt : retour au départ de l'étape, le statut ne change pas.
    t.clock.set(new Date(a.route.computedAt.getTime() + travelMs + DEMO_MOTION_PAUSE_MS + 8_000));
    await t.ctx.work.runDueWork();
    const p3 = expected(a.route, 'MOTO');
    expect(p3.progress).toBeLessThan(0.05);
    expect(await profileOf(a.driver.user.id)).toMatchObject({ lastLat: p3.lat, lastLng: p3.lng });
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: a.orderId } })).status).toBe('ASSIGNED');
    expect(fake.calls).toHaveLength(callsAfterSetup);
    expect(await t.prisma.locationPing.count()).toBe(0);
  });

  it('voiture de démonstration vers le retrait : avance aussi ; un pas au plus par 4 s', async () => {
    const a = await assignedDelivery(t, ABDOUL, 'CAR');
    t.clock.advance(30_000);
    expect(motion(await t.ctx.work.runDueWork())?.moved).toBe(1);
    const p = expected(a.route, 'CAR');
    expect(await profileOf(a.driver.user.id)).toMatchObject({ lastLat: p.lat, lastLng: p.lng });
    // Même pas de 4 s : rien de plus à écrire, même appelé directement.
    t.clock.advance(1_000);
    expect(await t.ctx.demoMotion.step()).toEqual({ moved: 0, realGps: 0, waitingForRoute: 0 });
    t.clock.advance(4_000);
    expect(await t.ctx.demoMotion.step()).toEqual({ moved: 1, realGps: 0, waitingForRoute: 0 });
  });

  it('jamais Karim (+22673000002) ni un autre livreur : seuls les numéros de démonstration bougent', async () => {
    const karim = await assignedDelivery(t, KARIM);
    const other = await assignedDelivery(t);
    const issouf = await assignedDelivery(t, ISSOUF);
    const before = await Promise.all([profileOf(karim.driver.user.id), profileOf(other.driver.user.id)]);
    for (let i = 0; i < 5; i++) {
      t.clock.advance(30_000);
      const m = motion(await t.ctx.work.runDueWork());
      expect(m).toEqual({ moved: 1, realGps: 0, waitingForRoute: 0 });
    }
    expect(await Promise.all([profileOf(karim.driver.user.id), profileOf(other.driver.user.id)])).toEqual(before);
    expect((await profileOf(issouf.driver.user.id)).lastLat).not.toBe(start.lat);
    const moved = new Set(t.ctx.realtime.emitted.filter((e) => e.event === 'driver.location').map((e) => (e.payload as { driverId: string }).driverId));
    expect(moved).toEqual(new Set([issouf.driver.user.id]));
  });

  it('le GPS réel l’emporte : pas de simulation pendant 2 min après une vraie position', async () => {
    const a = await assignedDelivery(t, ISSOUF);
    t.clock.advance(30_000);
    // Vraie position, sur le tracé (pas de recalcul d'itinéraire) ; le cycle déclenché par la requête passe d'abord.
    const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
    const real = { lat: r6(start.lat + (pickup.lat - start.lat) * 0.3), lng: r6(start.lng + (pickup.lng - start.lng) * 0.3) };
    expect((await call(t.app, 'POST', '/driver/location', a.driver.accessToken, { ...real, heading: 170, speed: 6 })).statusCode).toBe(204);
    await t.ctx.work.settled();
    const atPing = await profileOf(a.driver.user.id);
    expect(atPing).toMatchObject({ lastLat: real.lat, lastLng: real.lng, lastHeading: 170 });

    for (const ms of [30_000, 60_000, 29_000]) {
      t.clock.advance(ms);
      expect(motion(await t.ctx.work.runDueWork())).toEqual({ moved: 0, realGps: 1, waitingForRoute: 0 });
      expect(await profileOf(a.driver.user.id)).toMatchObject({ lastLat: real.lat, lastLng: real.lng, lastLocationAt: atPing.lastLocationAt });
    }
    // Plus de 2 min sans position réelle : la simulation reprend, toujours sans écrire de LocationPing.
    t.clock.advance(5_000);
    expect(motion(await t.ctx.work.runDueWork())).toEqual({ moved: 1, realGps: 0, waitingForRoute: 0 });
    const p = expected(a.route, 'MOTO');
    expect(await profileOf(a.driver.user.id)).toMatchObject({ lastLat: p.lat, lastLng: p.lng });
    expect(await t.prisma.locationPing.count()).toBe(1);
  });

  it('deux instances : même position au même pas, écrite une seule fois', async () => {
    const other = await createTestApp(DEMO, { clock: t.clock, routing: new FakeRoutingProvider(20) });
    try {
      const a = await assignedDelivery(t, ISSOUF);
      t.clock.advance(90_000);
      const results = await Promise.all([t.ctx.demoMotion.step(), other.ctx.demoMotion.step()]);
      expect(results.reduce((n, r) => n + (r?.moved ?? 0), 0)).toBe(1);
      const p = expected(a.route, 'MOTO');
      expect(await profileOf(a.driver.user.id)).toMatchObject({ lastLat: p.lat, lastLng: p.lng });
      expect(await other.ctx.demoMotion.step()).toMatchObject({ moved: 0 });
    } finally {
      await other.app.close();
      await other.prisma.$disconnect();
    }
  });

  it('itinéraire absent : calcul demandé au plus une fois par 30 s, puis le livreur avance', async () => {
    const a = await assignedDelivery(t, ISSOUF);
    await t.prisma.$executeRaw`UPDATE "Order" SET "routeTarget" = NULL, "routePoints" = NULL, "routeAttemptAt" = NULL WHERE "id" = ${a.orderId}`;
    const calls = fake.calls.length;
    fake.gate = new Promise<void>((r) => (releaseGate = r));
    t.clock.advance(8_000);
    expect(await t.ctx.demoMotion.step()).toEqual({ moved: 0, realGps: 0, waitingForRoute: 1 });
    await vi.waitFor(() => expect(fake.calls).toHaveLength(calls + 1));
    expect(fake.calls[calls]).toEqual({ from: start, to: { lat: pickup.lat, lng: pickup.lng }, vehicleType: 'MOTO' });
    // Calcul en cours (tentative de moins de 30 s) : aucun nouvel appel au service d'itinéraire.
    for (let i = 0; i < 3; i++) {
      t.clock.advance(4_000);
      expect(await t.ctx.demoMotion.step()).toMatchObject({ moved: 0, waitingForRoute: 1 });
    }
    expect(fake.calls).toHaveLength(calls + 1);
    expect(await profileOf(a.driver.user.id)).toMatchObject({ lastLat: start.lat, lastLng: start.lng });
    fake.gate = null;
    releaseGate();
    await t.ctx.work.settled();
    t.clock.advance(4_000);
    expect(await t.ctx.demoMotion.step()).toEqual({ moved: 1, realGps: 0, waitingForRoute: 0 });
    const route = currentRoute(await t.prisma.order.findUniqueOrThrow({ where: { id: a.orderId } }))!;
    const p = expected(route, 'MOTO');
    expect(p.progress).toBeGreaterThan(0);
    expect(await profileOf(a.driver.user.id)).toMatchObject({ lastLat: p.lat, lastLng: p.lng });
    expect(projectOnPolyline(route.points, { lat: p.lat, lng: p.lng }).distanceM).toBeLessThan(OFF_ROUTE_THRESHOLD_M);
  });

  it('livreur de démonstration sans course ou hors ligne : rien n’est écrit', async () => {
    const free = await createDriver(t, 'MOTO', start, { phone: ISSOUF });
    const busy = await assignedDelivery(t, ABDOUL, 'CAR');
    // Données incohérentes (hors ligne pendant une course) : jamais de position pour un livreur hors ligne.
    await t.prisma.driverProfile.update({ where: { userId: busy.driver.user.id }, data: { isOnline: false } });
    t.clock.advance(60_000);
    expect(await t.ctx.demoMotion.step()).toEqual({ moved: 0, realGps: 0, waitingForRoute: 0 });
    expect(await profileOf(free.user.id)).toMatchObject({ lastLat: start.lat, lastLng: start.lng });
    expect(await profileOf(busy.driver.user.id)).toMatchObject({ lastLat: start.lat, lastLng: start.lng });
  });
});

describe('DEMO_MODE=true en mode socket (développement local)', () => {
  type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
  const once = <T>(c: ClientSocket, event: string) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`délai dépassé : ${event}`)), 5000);
      (c as unknown as { once: (e: string, cb: (p: T) => void) => void }).once(event, (p: T) => {
        clearTimeout(timer);
        resolve(p);
      });
    });

  it('chaque pas émet `driver.location` comme une vraie position : console et abonnés de la commande', async () => {
    const s = await createTestApp({ DEMO_MODE: 'true', REALTIME_MODE: 'socket' }, { clock: t.clock, routing: new FakeRoutingProvider(20) });
    const sockets: ClientSocket[] = [];
    try {
      expect(s.io).not.toBeNull();
      await s.app.listen({ port: 0, host: '127.0.0.1' });
      const url = `http://127.0.0.1:${(s.app.server.address() as AddressInfo).port}`;
      const open = (token: string) => {
        const c: ClientSocket = connect(url, { auth: { token }, transports: ['websocket'], forceNew: true });
        sockets.push(c);
        return c;
      };
      const a = await assignedDelivery(s, ISSOUF);
      const consoleSocket = open(await demoStaffToken(s));
      const businessSocket = open(a.business.accessToken);
      await Promise.all([once(consoleSocket, 'connect'), once(businessSocket, 'connect')]);
      const ack = await new Promise<{ ok: boolean }>((r) => businessSocket.emit('order.subscribe', { orderId: a.orderId }, r));
      expect(ack.ok).toBe(true);
      const received = Promise.all([once<DriverLocationEvent>(consoleSocket, 'driver.location'), once<DriverLocationEvent>(businessSocket, 'driver.location')]);
      t.clock.advance(60_000);
      expect(await s.ctx.demoMotion.step()).toEqual({ moved: 1, realGps: 0, waitingForRoute: 0 });
      const p = expected(a.route, 'MOTO');
      for (const e of await received)
        expect(e).toMatchObject({ driverId: a.driver.user.id, lat: p.lat, lng: p.lng, heading: headingForDto(p.heading), orderId: a.orderId });
    } finally {
      for (const c of sockets) c.disconnect();
      await s.app.close();
      await s.prisma.$disconnect();
    }
  });
});

describe('DEMO_MODE=false', () => {
  it('aucune simulation, même pour les numéros des livreurs de démonstration', async () => {
    const dev = await createTestApp({ ...DEMO, DEMO_MODE: 'false' }, { clock: t.clock, routing: new FakeRoutingProvider(20) });
    try {
      expect(dev.ctx.demoMotion.enabled).toBe(false);
      const a = await assignedDelivery(dev, ISSOUF);
      const before = await profileOf(a.driver.user.id);
      for (let i = 0; i < 3; i++) {
        t.clock.advance(60_000);
        const r = await dev.ctx.work.runDueWork();
        expect(r.ran).toBe(true);
        expect(r).not.toHaveProperty('demoMotion');
      }
      expect(await dev.ctx.demoMotion.step()).toBeNull();
      const tr = (await call(dev.app, 'GET', `/track/${a.token}`)).json<TrackingDto>();
      expect(tr.driver?.lastLocation).toMatchObject({ lat: start.lat, lng: start.lng });
      expect(await profileOf(a.driver.user.id)).toEqual(before);
      expect(dev.ctx.realtime.emitted.filter((e) => e.event === 'driver.location')).toHaveLength(0);
    } finally {
      await dev.app.close();
      await dev.prisma.$disconnect();
    }
  });
});
