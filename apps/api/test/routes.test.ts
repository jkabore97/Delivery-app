import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapDataDto, OrderDto, Paginated, RouteDto } from '@yaar/shared';
import type { LatLngTuple } from '../src/lib/geo';
import { straightRoute, type RouteResult } from '../src/providers/routing';
import { estimateEtaMinutes } from '../src/services/serializers';
import { HANDOVER_ALLOWANCE_S, ROUTE_STATE_SELECT } from '../src/services/routes';
import {
  call,
  createDriver,
  createStore,
  createTestApp,
  FakeRoutingProvider,
  login,
  loginStaff,
  P,
  resetDb,
  T0,
  type TestApp,
} from './helpers';

const fake = new FakeRoutingProvider();
let t: TestApp;
/** Libère un calcul retenu par `fake.gate` (aussi entre deux tests, pour ne laisser aucune tâche en attente). */
let releaseGate: () => void = () => undefined;

beforeAll(async () => {
  t = await createTestApp({}, { routing: fake });
});
afterAll(async () => {
  await t.app.close();
  await t.prisma.$disconnect();
});
beforeEach(async () => {
  releaseGate();
  await t.ctx.work.settled();
  await resetDb(t.prisma);
  t.clock.set(T0);
  fake.calls.length = 0;
  fake.gate = null;
  fake.respond = null;
  t.ctx.realtime.emitted.length = 0;
});

const pickup = P.centre;
const dropoff = P.zogona;
const parcel = { type: 'PARCEL', vehicleType: 'MOTO', pickup: { ...pickup, address: 'A' }, dropoff: { ...dropoff, address: 'B' } };
const near = { lat: 12.37, lng: -1.526 }; // ~0,2 km du retrait
const farther = { lat: 12.38, lng: -1.53 }; // ~1,3 km
/** Coordonnées à 6 décimales (comme un GPS ; aller-retour exact par JSON et PostgreSQL). */
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
/** Décalage vers l'est de `m` mètres (à cette latitude). */
const east = (p: { lat: number; lng: number }, m: number) => ({ lat: p.lat, lng: r6(p.lng + m / 108_800) });
const between = (a: { lat: number; lng: number }, b: { lat: number; lng: number }, f: number) => ({
  lat: r6(a.lat + (b.lat - a.lat) * f),
  lng: r6(a.lng + (b.lng - a.lng) * f),
});

function line(from: { lat: number; lng: number }, to: { lat: number; lng: number }, n = 10): LatLngTuple[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const p = between(from, to, i / n);
    return [p.lat, p.lng] as LatLngTuple;
  });
}

async function assignedOrder(driverPos = near) {
  const client = await login(t.app, 'CLIENT');
  const driver = await createDriver(t, 'MOTO', driverPos);
  const o = (await call(t.app, 'POST', '/orders', client.accessToken, parcel)).json<OrderDto>();
  const offer = await t.prisma.dispatchOffer.findFirstOrThrow({ where: { orderId: o.id } });
  const accepted = await call(t.app, 'POST', `/driver/offers/${offer.id}/accept`, driver.accessToken, {});
  expect(accepted.statusCode).toBe(200);
  await t.ctx.work.settled();
  return { client, driver, id: o.id, accepted: accepted.json<OrderDto>() };
}

const ping = (token: string, body: Record<string, number>) => call(t.app, 'POST', '/driver/location', token, body);
const dbRoute = (id: string) =>
  t.prisma.order.findUniqueOrThrow({
    where: { id },
    select: {
      routeTarget: true,
      routeComputedAt: true,
      routeOriginLat: true,
      routeOriginLng: true,
      routeAttemptAt: true,
      routePoints: true,
      routeSource: true,
      deliveryLegDurationS: true,
      updatedAt: true,
    },
  });

describe('calcul de l’itinéraire aux changements de statut', () => {
  it('affectation : itinéraire vers le retrait depuis la position du livreur, durée retrait → livraison mise en cache', async () => {
    const { accepted, id } = await assignedOrder();
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls).toEqual(
      expect.arrayContaining([
        { from: near, to: { lat: pickup.lat, lng: pickup.lng }, vehicleType: 'MOTO' },
        { from: { lat: pickup.lat, lng: pickup.lng }, to: { lat: dropoff.lat, lng: dropoff.lng }, vehicleType: 'MOTO' },
      ]),
    );
    // La réponse d'acceptation contient déjà l'itinéraire (calcul dans le budget de la requête).
    expect(accepted.route).toMatchObject({ target: 'PICKUP', source: 'osrm', computedAt: T0.toISOString() });
    expect(accepted.route!.points).toHaveLength(11);
    expect(accepted.route!.points[0]).toEqual([near.lat, near.lng]);
    const row = await dbRoute(id);
    expect(row).toMatchObject({ routeTarget: 'PICKUP', routeOriginLat: near.lat, routeOriginLng: near.lng, routeSource: 'osrm' });
    expect(row.deliveryLegDurationS).toBe(straightRoute(pickup, dropoff, 'MOTO').durationS);
  });

  it('retrait : vers le destinataire depuis la position récente du livreur, sinon depuis le point de retrait', async () => {
    const a = await assignedOrder();
    fake.calls.length = 0;
    const at = east(pickup, 10);
    expect((await ping(a.driver.accessToken, at)).statusCode).toBe(204);
    await t.ctx.work.settled();
    fake.calls.length = 0;
    const picked = await call(t.app, 'POST', `/orders/${a.id}/pickup`, a.driver.accessToken, {});
    await t.ctx.work.settled();
    expect(picked.json<OrderDto>().route).toMatchObject({ target: 'DROPOFF' });
    expect(fake.calls).toEqual([{ from: at, to: { lat: dropoff.lat, lng: dropoff.lng }, vehicleType: 'MOTO' }]);

    // Position de plus de 2 min : départ = point de retrait.
    const b = await assignedOrder(farther);
    fake.calls.length = 0;
    t.clock.advance(3 * 60_000);
    await call(t.app, 'POST', `/orders/${b.id}/pickup`, b.driver.accessToken, {});
    await t.ctx.work.settled();
    expect(fake.calls).toEqual([{ from: { lat: pickup.lat, lng: pickup.lng }, to: { lat: dropoff.lat, lng: dropoff.lng }, vehicleType: 'MOTO' }]);
  });

  it('livraison : itinéraire et position de départ effacés ; durée retrait → livraison conservée', async () => {
    const a = await assignedOrder();
    await call(t.app, 'POST', `/orders/${a.id}/pickup`, a.driver.accessToken, {});
    await t.ctx.work.settled();
    const code = (await t.prisma.order.findUniqueOrThrow({ where: { id: a.id } })).deliveryCode;
    expect((await call(t.app, 'POST', `/orders/${a.id}/deliver`, a.driver.accessToken, { code })).statusCode).toBe(200);
    const row = await dbRoute(a.id);
    expect(row).toMatchObject({ routeTarget: null, routePoints: null, routeOriginLat: null, routeComputedAt: null, routeAttemptAt: null });
    expect(row.deliveryLegDurationS).toBeGreaterThan(0);
  });
});

describe('recalcul aux positions GPS (horloge injectée)', () => {
  it('sur l’itinéraire et récent : rien ; hors itinéraire (> 120 m) : recalcul, jamais plus d’une fois par 30 s', async () => {
    const a = await assignedOrder(farther);
    const before = await dbRoute(a.id);
    fake.calls.length = 0;
    // Sur le tracé (à mi-chemin) : aucun appel.
    t.clock.advance(5_000);
    await ping(a.driver.accessToken, between(farther, pickup, 0.5));
    // Écart de 60 m : toujours sur l'itinéraire.
    t.clock.advance(5_000);
    await ping(a.driver.accessToken, east(between(farther, pickup, 0.6), 60));
    await t.ctx.work.settled();
    expect(fake.calls).toHaveLength(0);

    // 300 m hors du tracé, 10 s après le calcul : limité (30 s).
    const off = east(between(farther, pickup, 0.6), 300);
    await ping(a.driver.accessToken, off);
    await t.ctx.work.settled();
    expect(fake.calls).toHaveLength(0);

    t.clock.set(new Date(T0.getTime() + 30_000));
    await ping(a.driver.accessToken, off);
    await t.ctx.work.settled();
    expect(fake.calls).toEqual([{ from: off, to: { lat: pickup.lat, lng: pickup.lng }, vehicleType: 'MOTO' }]);
    const after = await dbRoute(a.id);
    expect(after.routeComputedAt).toEqual(new Date(T0.getTime() + 30_000));
    expect(after).toMatchObject({ routeOriginLat: off.lat, routeTarget: 'PICKUP' });
    // Écriture en SQL brut : updatedAt (changements métier, updatedSince) ne bouge pas.
    expect(after.updatedAt).toEqual(before.updatedAt);

    // Encore hors itinéraire juste après : pas de nouvel appel avant 30 s.
    const further = east(off, 400);
    t.clock.advance(10_000);
    await ping(a.driver.accessToken, further);
    await t.ctx.work.settled();
    expect(fake.calls).toHaveLength(1);
    t.clock.advance(20_000);
    await ping(a.driver.accessToken, further);
    await t.ctx.work.settled();
    expect(fake.calls).toHaveLength(2);
  });

  it('itinéraire de plus de 3 min : recalculé à la position suivante, même sur le tracé', async () => {
    const a = await assignedOrder(farther);
    fake.calls.length = 0;
    t.clock.advance(3 * 60_000);
    await ping(a.driver.accessToken, between(farther, pickup, 0.3));
    await t.ctx.work.settled();
    expect(fake.calls).toHaveLength(0);
    t.clock.advance(1_000);
    await ping(a.driver.accessToken, between(farther, pickup, 0.3));
    await t.ctx.work.settled();
    expect(fake.calls).toHaveLength(1);
  });

  it('cible différente du statut (écriture perdue) : recalcul pour l’étape en cours', async () => {
    const a = await assignedOrder();
    await call(t.app, 'POST', `/orders/${a.id}/pickup`, a.driver.accessToken, {});
    await t.ctx.work.settled();
    // Simule un itinéraire resté sur l'étape précédente, tentative ancienne.
    await t.prisma.$executeRaw`UPDATE "Order" SET "routeTarget" = 'PICKUP', "routeAttemptAt" = NULL WHERE "id" = ${a.id}`;
    const asClient = (await call(t.app, 'GET', `/orders/${a.id}`, a.client.accessToken)).json<OrderDto>();
    expect(asClient.route).toBeNull(); // jamais l'itinéraire d'une autre étape
    fake.calls.length = 0;
    await ping(a.driver.accessToken, east(pickup, 20));
    await t.ctx.work.settled();
    expect(fake.calls).toEqual([{ from: east(pickup, 20), to: { lat: dropoff.lat, lng: dropoff.lng }, vehicleType: 'MOTO' }]);
    expect((await dbRoute(a.id)).routeTarget).toBe('DROPOFF');
  });

  it('la réponse à une position n’attend pas le service d’itinéraire', async () => {
    const a = await assignedOrder(farther);
    fake.gate = new Promise<void>((r) => (releaseGate = r));
    fake.calls.length = 0;
    t.clock.advance(31_000);
    const off = east(between(farther, pickup, 0.5), 500);
    const res = await ping(a.driver.accessToken, off);
    expect(res.statusCode).toBe(204); // répondu alors que le service d'itinéraire n'a pas encore répondu
    await vi.waitFor(() => expect(fake.calls).toHaveLength(1));
    expect((await dbRoute(a.id)).routeOriginLng).toBe(farther.lng);
    releaseGate();
    await t.ctx.work.settled();
    // Position de départ enregistrée à 5 décimales (≈ 1 m).
    expect((await dbRoute(a.id)).routeOriginLng).toBe(Math.round(off.lng * 1e5) / 1e5);
  });

  it('deux instances : une seule tentative de calcul (verrou routeAttemptAt conditionnel)', async () => {
    const fake2 = new FakeRoutingProvider();
    const other = await createTestApp({}, { clock: t.clock, routing: fake2 });
    try {
      const a = await assignedOrder(farther);
      fake.calls.length = 0;
      t.clock.advance(31_000);
      const off = east(between(farther, pickup, 0.5), 500);
      // Les deux instances lisent le même état, puis tentent de prendre la main en même temps.
      const state = await t.prisma.order.findUniqueOrThrow({ where: { id: a.id }, select: ROUTE_STATE_SELECT });
      const reasons = await Promise.all([t.ctx.routes.onDriverPing(state, off), other.ctx.routes.onDriverPing(state, off)]);
      expect(reasons).toEqual(['off_route', 'off_route']);
      await Promise.all([t.ctx.work.settled(), other.ctx.work.settled()]);
      expect(fake.calls.length + fake2.calls.length).toBe(1);
      // Et par HTTP sur les deux instances : toujours un seul appel par fenêtre de 30 s.
      t.clock.advance(31_000);
      const far2 = east(off, 600);
      await Promise.all([ping(a.driver.accessToken, far2), call(other.app, 'POST', '/driver/location', a.driver.accessToken, far2)]);
      await Promise.all([t.ctx.work.settled(), other.ctx.work.settled()]);
      expect(fake.calls.length + fake2.calls.length).toBe(2);
    } finally {
      await other.app.close();
      await other.prisma.$disconnect();
    }
  });
});

describe('visibilité de l’itinéraire et ETA', () => {
  it('client, livreur et console pendant ASSIGNED / PICKED_UP ; vendeur, autre client, avant et après : non', async () => {
    const { seller, storeId, productIds } = await createStore(t, pickup);
    const client = await login(t.app, 'CLIENT');
    const otherClient = await login(t.app, 'CLIENT');
    const staff = await loginStaff(t);
    const driver = await createDriver(t, 'MOTO', near);
    const o = (
      await call(t.app, 'POST', '/orders', client.accessToken, {
        type: 'FOOD', storeId, vehicleType: 'MOTO', items: [{ productId: productIds[0], quantity: 1 }], dropoff: { ...dropoff, address: 'B' },
      })
    ).json<OrderDto>();
    await call(t.app, 'POST', `/orders/${o.id}/accept`, seller.accessToken, {});
    await call(t.app, 'POST', `/orders/${o.id}/ready`, seller.accessToken, {});
    const get = async (token: string) => (await call(t.app, 'GET', `/orders/${o.id}`, token)).json<OrderDto>();
    expect((await get(client.accessToken)).route).toBeNull(); // SEARCHING_DRIVER

    const offer = await t.prisma.dispatchOffer.findFirstOrThrow({ where: { orderId: o.id } });
    await call(t.app, 'POST', `/driver/offers/${offer.id}/accept`, driver.accessToken, {});
    await t.ctx.work.settled();
    const forClient = await get(client.accessToken);
    expect(forClient.route?.target).toBe('PICKUP');
    expect((await get(driver.accessToken)).route?.target).toBe('PICKUP');
    expect((await get(staff.accessToken)).route?.target).toBe('PICKUP');
    const forSeller = await get(seller.accessToken);
    expect(forSeller.route).toBeNull();
    expect(forSeller.driver?.lastLocation).not.toBeNull(); // position et ETA, sans le tracé
    expect(forSeller.etaMinutes).toBeGreaterThan(0);
    expect((await call(t.app, 'GET', `/orders/${o.id}`, otherClient.accessToken)).statusCode).toBe(404);
    // Listes : pas de tracé (charge utile), l'ETA reste.
    const list = (await call(t.app, 'GET', '/orders', client.accessToken)).json<Paginated<OrderDto>>();
    expect(list.items[0]!.route).toBeNull();
    expect(list.items[0]!.etaMinutes).toBeGreaterThan(0);

    await call(t.app, 'POST', `/orders/${o.id}/pickup`, driver.accessToken, {});
    await t.ctx.work.settled();
    expect((await get(client.accessToken)).route?.target).toBe('DROPOFF');
    expect((await get(seller.accessToken)).route).toBeNull();
    const code = (await t.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).deliveryCode;
    await call(t.app, 'POST', `/orders/${o.id}/deliver`, driver.accessToken, { code });
    for (const tok of [client.accessToken, driver.accessToken, staff.accessToken]) expect((await get(tok)).route).toBeNull();
  });

  it('ETA = part restante × durée (+ 2 min de remise + retrait → livraison pendant ASSIGNED) ; repli sans itinéraire', async () => {
    // Durées imposées : 1 200 s vers le retrait, 600 s retrait → livraison, 900 s vers le destinataire.
    fake.respond = (from, to, vt): RouteResult => {
      const toPickup = to.lat === pickup.lat && to.lng === pickup.lng;
      const fromPickup = from.lat === pickup.lat && from.lng === pickup.lng;
      return { points: line(from, to), distanceM: 1000, durationS: toPickup ? 1200 : fromPickup ? 600 : 900, source: 'osrm' };
    };
    const a = await assignedOrder(farther);
    const eta = async () => (await call(t.app, 'GET', `/orders/${a.id}`, a.client.accessToken)).json<OrderDto>().etaMinutes;
    expect(HANDOVER_ALLOWANCE_S).toBe(120);
    expect(await eta()).toBe(Math.ceil((1200 + 120 + 600) / 60)); // 32
    await ping(a.driver.accessToken, between(farther, pickup, 0.5));
    expect(await eta()).toBe(Math.ceil((600 + 120 + 600) / 60)); // 22
    const atPickup = east(pickup, 30); // au retrait (30 m de la fin du tracé : pas de recalcul)
    await ping(a.driver.accessToken, atPickup);
    await call(t.app, 'POST', `/orders/${a.id}/pickup`, a.driver.accessToken, {});
    await t.ctx.work.settled();
    expect(await eta()).toBe(15); // 900 s vers le destinataire
    await ping(a.driver.accessToken, between(atPickup, dropoff, 1 / 3));
    expect(await eta()).toBe(10);
    await t.ctx.work.settled();

    // Sans itinéraire en cache : estimation précédente (vol d'oiseau × 1,3 à la vitesse moyenne).
    await t.prisma.$executeRaw`UPDATE "Order" SET "routeTarget" = NULL WHERE "id" = ${a.id}`;
    const row = await t.prisma.order.findUniqueOrThrow({ where: { id: a.id } });
    const profile = await t.prisma.driverProfile.findUniqueOrThrow({ where: { userId: a.driver.user.id } });
    expect(await eta()).toBe(estimateEtaMinutes(row, profile));
  });
});

describe('cap du livreur', () => {
  it('cap du téléphone ou calculé, exposé au client (lastLocation.heading) et dans driver.location', async () => {
    const a = await assignedOrder();
    const heading = async () => (await call(t.app, 'GET', `/orders/${a.id}`, a.client.accessToken)).json<OrderDto>().driver?.lastLocation?.heading;
    expect(await heading()).toBeNull();
    await ping(a.driver.accessToken, { ...near, heading: 271.4, speed: 5 });
    expect(await heading()).toBe(271);
    const north = { lat: near.lat + 30 / 111_000, lng: near.lng };
    await ping(a.driver.accessToken, north); // sans cap : calculé (30 m vers le nord)
    expect(await heading()).toBe(0);
    await ping(a.driver.accessToken, { lat: north.lat + 5 / 111_000, lng: north.lng, heading: 180, speed: 0 });
    expect(await heading()).toBe(0); // à l'arrêt, < 15 m : conservé
    const events = t.ctx.realtime.emitted.filter((e) => e.event === 'driver.location').map((e) => (e.payload as { heading: number | null }).heading);
    expect(events).toEqual([271, 0, 0]);
    await t.ctx.work.settled();
  });

  it('effacé avec la position quand le livreur passe hors ligne', async () => {
    const d = await createDriver(t, 'BIKE', near);
    await ping(d.accessToken, { ...near, heading: 45, speed: 3 });
    expect((await t.prisma.driverProfile.findUniqueOrThrow({ where: { userId: d.user.id } })).lastHeading).toBe(45);
    await call(t.app, 'PATCH', '/driver/availability', d.accessToken, { online: false });
    expect(await t.prisma.driverProfile.findUniqueOrThrow({ where: { userId: d.user.id } })).toMatchObject({ lastHeading: null, lastLat: null });
  });
});

describe('carte de la console', () => {
  it('itinéraire en cache et cap des livreurs, sans aucun appel au service d’itinéraire', async () => {
    const a = await assignedOrder();
    await ping(a.driver.accessToken, { ...near, heading: 90, speed: 6 });
    await t.ctx.work.settled();
    const staff = await loginStaff(t);
    const calls = fake.calls.length;
    const map = (await call(t.app, 'GET', '/controller/map', staff.accessToken)).json<MapDataDto>();
    expect(fake.calls.length).toBe(calls);
    const order = map.orders.find((o) => o.id === a.id)!;
    expect(order.route).toMatchObject({ target: 'PICKUP', source: 'osrm' } satisfies Partial<RouteDto>);
    expect(map.drivers.find((d) => d.id === a.driver.user.id)?.heading).toBe(90);
    // Les autres commandes actives n'ont pas d'itinéraire.
    const client = await login(t.app, 'CLIENT');
    await call(t.app, 'POST', '/orders', client.accessToken, parcel);
    const map2 = (await call(t.app, 'GET', '/controller/map', staff.accessToken)).json<MapDataDto>();
    expect(map2.orders.filter((o) => o.route === null)).toHaveLength(1);
  });
});
