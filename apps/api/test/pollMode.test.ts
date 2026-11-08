import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiErrorBody, CronDailyResultDto, OfferDto, OrderDto, Paginated, PublicConfigDto } from '@yaar/shared';
import { loadConfig } from '../src/config';
import { ManualClock } from '../src/lib/clock';
import type { DispatchService, TickResult } from '../src/services/dispatch';
import { BackgroundWork, vercelKeepAlive } from '../src/services/work';
import { call, createDriver, createStore, createTestApp, login, P, resetDb, T0, type TestApp } from './helpers';

const CRON_SECRET = 'cron-secret-for-tests-0123456789';
const POLL = { REALTIME_MODE: 'poll', WORK_THROTTLE_MS: '4000', WORK_BUDGET_MS: '10000', CRON_SECRET };

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp(POLL);
});
afterAll(async () => {
  await t.app.close();
  await t.prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(t.prisma);
});

const parcel = { type: 'PARCEL', vehicleType: 'MOTO', pickup: { ...P.centre, address: 'A' }, dropoff: { ...P.zogona, address: 'B' } };
// Trois livreurs de plus en plus loin du point de retrait (centre).
const near = { lat: 12.3696, lng: -1.5275 };
const mid = { lat: 12.3726, lng: -1.5275 };
const far = { lat: 12.3786, lng: -1.5275 };

async function offersOf(token: string): Promise<OfferDto[]> {
  return (await call(t.app, 'GET', '/driver/offers', token)).json<OfferDto[]>();
}

describe('mode poll (Vercel)', () => {
  it('n’attache pas Socket.IO et expose GET /config', async () => {
    expect(t.io).toBeNull();
    const r = await call(t.app, 'GET', '/config');
    expect(r.statusCode).toBe(200);
    expect(r.json<PublicConfigDto>()).toEqual({ realtime: 'poll', pollIntervalMs: 4000, demoMode: false, otpChannel: 'console' });
    expect((await call(t.app, 'GET', '/socket.io/?EIO=4&transport=polling')).statusCode).toBe(404);
  });

  it('runDueWork : l’offre expire après 30 s et passe au livreur suivant, au plus une fois par fenêtre', async () => {
    const client = await login(t.app, 'CLIENT');
    const d1 = await createDriver(t, 'MOTO', near);
    const d2 = await createDriver(t, 'MOTO', mid);
    const o = (await call(t.app, 'POST', '/orders', client.accessToken, parcel)).json<OrderDto>();
    expect((await offersOf(d1.accessToken))[0]?.orderId).toBe(o.id);

    // Avant l'échéance : rien à faire.
    t.clock.advance(29_000);
    const early = await t.ctx.work.runDueWork();
    expect(early).toEqual({ ran: true, tick: { expired: 0, offered: 0, staleOffline: 0 } });

    // Dans la fenêtre de throttling (4 s) : le cycle n'est pas relancé, même après l'échéance.
    t.clock.advance(1_000);
    expect(await t.ctx.work.runDueWork()).toEqual({ ran: false, reason: 'not_due' });
    expect(await t.prisma.dispatchOffer.count({ where: { orderId: o.id, status: 'OFFERED', driverId: d1.user.id } })).toBe(1);

    t.clock.advance(3_000);
    const due = await t.ctx.work.runDueWork();
    expect(due).toEqual({ ran: true, tick: { expired: 1, offered: 1, staleOffline: 0 } });
    expect(await offersOf(d1.accessToken)).toHaveLength(0);
    expect((await offersOf(d2.accessToken))[0]?.orderId).toBe(o.id);
    // Aucun émetteur Socket.IO : les émissions sont sans effet (journalisées seulement en test).
    expect(t.ctx.realtime.emitted.some((e) => e.event === 'offer.closed')).toBe(true);
  });

  it('les requêtes de suivi déclenchent le cycle (sans setInterval)', async () => {
    const client = await login(t.app, 'CLIENT');
    const d1 = await createDriver(t, 'MOTO', near);
    const d2 = await createDriver(t, 'MOTO', mid);
    const d3 = await createDriver(t, 'MOTO', far);
    const o = (await call(t.app, 'POST', '/orders', client.accessToken, parcel)).json<OrderDto>();
    expect((await offersOf(d1.accessToken))[0]?.orderId).toBe(o.id);

    // d1 ne répond pas ; c'est le sondage de d2 qui fait expirer l'offre et lui propose la course.
    t.clock.advance(31_000);
    expect((await offersOf(d2.accessToken))[0]?.orderId).toBe(o.id);
    expect(await offersOf(d1.accessToken)).toHaveLength(0);

    // Puis d2 non plus : le client qui suit sa commande déclenche le passage à d3.
    t.clock.advance(31_000);
    const seen = await call(t.app, 'GET', `/orders/${o.id}`, client.accessToken);
    expect(seen.json<OrderDto>().status).toBe('SEARCHING_DRIVER');
    expect(await offersOf(d2.accessToken)).toHaveLength(0);
    const o3 = await offersOf(d3.accessToken);
    expect(o3[0]?.orderId).toBe(o.id);

    // d3 accepte : le client voit le livreur, sa position et l'ETA par REST.
    expect((await call(t.app, 'POST', `/driver/offers/${o3[0]!.id}/accept`, d3.accessToken, {})).statusCode).toBe(200);
    const tracked = (await call(t.app, 'GET', `/orders/${o.id}`, client.accessToken)).json<OrderDto>();
    expect(tracked.status).toBe('ASSIGNED');
    expect(tracked.driver?.lastLocation).toMatchObject({ lat: far.lat, lng: far.lng });
    expect(typeof tracked.etaMinutes).toBe('number');
    expect(tracked.updatedAt).toBeTruthy();
  });

  it('deux instances : un seul cycle par fenêtre (bail partagé en base)', async () => {
    const other = await createTestApp(POLL, { clock: t.clock });
    try {
      const results = await Promise.all([t.ctx.work.runDueWork(), other.ctx.work.runDueWork()]);
      expect(results.filter((r) => r.ran)).toHaveLength(1);
      // Juste après : ni l'une ni l'autre (fenêtre de 4 s).
      expect((await t.ctx.work.runDueWork()).ran).toBe(false);
      expect((await other.ctx.work.runDueWork()).ran).toBe(false);
      t.clock.advance(4_000);
      expect((await other.ctx.work.runDueWork()).ran).toBe(true);
    } finally {
      await other.app.close();
      await other.prisma.$disconnect();
    }
  });

  it('la base refuse deux offres ouvertes pour la même commande ou le même livreur', async () => {
    const client = await login(t.app, 'CLIENT');
    const d1 = await createDriver(t, 'MOTO', near);
    const o = (await call(t.app, 'POST', '/orders', client.accessToken, parcel)).json<OrderDto>();
    // d1 a déjà une offre ouverte (pour o) : la seconde commande attend.
    const o2 = (await call(t.app, 'POST', '/orders', client.accessToken, parcel)).json<OrderDto>();
    expect(await t.prisma.dispatchOffer.count({ where: { orderId: o2.id } })).toBe(0);
    const expiresAt = new Date(t.clock.now().getTime() + 30_000);
    // Même livreur (autre instance qui aurait choisi d1 pour o2) : refusé.
    await expect(
      t.prisma.dispatchOffer.create({ data: { orderId: o2.id, driverId: d1.user.id, expiresAt } }),
    ).rejects.toMatchObject({ code: 'P2002' });
    // Même commande, autre livreur : refusé.
    const d2 = await createDriver(t, 'MOTO', mid);
    await expect(
      t.prisma.dispatchOffer.create({ data: { orderId: o.id, driverId: d2.user.id, expiresAt } }),
    ).rejects.toMatchObject({ code: 'P2002' });
    // Le cycle suivant propose o2 à d2.
    t.clock.advance(5_000);
    expect((await offersOf(d2.accessToken))[0]?.orderId).toBe(o2.id);
  });

  it('GET /orders?updatedSince ne renvoie que les commandes modifiées', async () => {
    const client = await login(t.app, 'CLIENT');
    await call(t.app, 'POST', '/orders', client.accessToken, parcel);
    const all = (await call(t.app, 'GET', '/orders', client.accessToken)).json<Paginated<OrderDto>>();
    expect(all.items).toHaveLength(1);
    const since = all.items[0]!.updatedAt!;
    const same = await call(t.app, 'GET', `/orders?updatedSince=${encodeURIComponent(since)}`, client.accessToken);
    expect(same.json<Paginated<OrderDto>>().items).toHaveLength(1);
    const future = new Date(Date.parse(since) + 60_000).toISOString();
    const none = await call(t.app, 'GET', `/orders?updatedSince=${encodeURIComponent(future)}`, client.accessToken);
    expect(none.json<Paginated<OrderDto>>().items).toHaveLength(0);
    const bad = await call(t.app, 'GET', '/orders?updatedSince=hier', client.accessToken);
    expect(bad.statusCode).toBe(400);
  });

  it('updatedSince : marge de 2 s, tri du plus ancien changement au plus récent', async () => {
    const client = await login(t.app, 'CLIENT');
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await call(t.app, 'POST', '/orders', client.accessToken, parcel)).json<OrderDto>().id);
    const cursor = new Date('2026-11-06T12:00:00.000Z');
    const at = (ms: number) => new Date(cursor.getTime() + ms);
    // updatedAt écrits directement : 3 s avant le curseur, 1 s avant, 5 s après.
    const setUpdatedAt = (id: string, d: Date) =>
      t.prisma.$executeRaw`UPDATE "Order" SET "updatedAt" = CAST(${d.toISOString()} AS TIMESTAMP(3)) WHERE "id" = ${id}`;
    await setUpdatedAt(ids[0]!, at(-3000));
    await setUpdatedAt(ids[1]!, at(5000));
    await setUpdatedAt(ids[2]!, at(-1000));
    const r = (
      await call(t.app, 'GET', `/orders?updatedSince=${encodeURIComponent(cursor.toISOString())}`, client.accessToken)
    ).json<Paginated<OrderDto>>();
    // ids[0] (3 s avant) exclu ; ids[2] (1 s avant, dans la marge) puis ids[1].
    expect(r.items.map((o) => o.id)).toEqual([ids[2], ids[1]]);
    expect(r.total).toBe(2);
  });

  it('updatedSince : une commande qui sort des statuts suivis (livrée, annulée) est renvoyée', async () => {
    // Le vendeur suit ses commandes en cours ; l'une est annulée par le client, l'autre livrée.
    const { seller, storeId, productIds } = await createStore(t);
    const client = await login(t.app, 'CLIENT');
    const food = {
      type: 'FOOD',
      vehicleType: 'MOTO',
      storeId,
      items: [{ productId: productIds[0], quantity: 1 }],
      dropoff: { ...P.zogona, address: 'Zogona' },
    };
    const o1 = (await call(t.app, 'POST', '/orders', client.accessToken, food)).json<OrderDto>();
    const o2 = (await call(t.app, 'POST', '/orders', client.accessToken, food)).json<OrderDto>();
    const active = 'PENDING,ACCEPTED,READY,SEARCHING_DRIVER,ASSIGNED,PICKED_UP';
    const first = (await call(t.app, 'GET', `/orders?status=${active}`, seller.accessToken)).json<Paginated<OrderDto>>();
    expect(first.items.map((o) => o.id).sort()).toEqual([o1.id, o2.id].sort());
    const cursor = first.items.map((o) => o.updatedAt!).sort().at(-1)!;

    expect((await call(t.app, 'POST', `/orders/${o1.id}/cancel`, client.accessToken, { reason: 'Erreur' })).statusCode).toBe(200);
    const next = (
      await call(t.app, 'GET', `/orders?status=${active}&updatedSince=${encodeURIComponent(cursor)}`, seller.accessToken)
    ).json<Paginated<OrderDto>>();
    // Le filtre `status` ne s'applique pas avec updatedSince : l'annulation est visible, à retirer de l'écran.
    const changed = next.items.find((o) => o.id === o1.id);
    expect(changed?.status).toBe('CANCELLED');
    // Sans updatedSince, le filtre `status` reste appliqué.
    const filtered = (await call(t.app, 'GET', `/orders?status=${active}`, seller.accessToken)).json<Paginated<OrderDto>>();
    expect(filtered.items.map((o) => o.id)).toEqual([o2.id]);
    // Portée inchangée : un autre client ne voit rien.
    const other = await login(t.app, 'CLIENT');
    const none = (await call(t.app, 'GET', `/orders?updatedSince=${encodeURIComponent(cursor)}`, other.accessToken)).json<Paginated<OrderDto>>();
    expect(none.items).toHaveLength(0);
  });

  it('bail JobLease : créé au premier cycle, jamais d’INSERT en échec, recréé après un TRUNCATE', async () => {
    expect(await t.prisma.jobLease.count()).toBe(0);
    expect((await t.ctx.work.runDueWork()).ran).toBe(true);
    // Écrit comme Prisma écrit ses dates (relu identique par Prisma) ; bail libéré en fin de cycle.
    expect(await t.prisma.jobLease.findUnique({ where: { name: 'dispatch' } })).toEqual({
      name: 'dispatch',
      lastStartedAt: t.clock.now(),
      lockedUntil: t.clock.now(),
    });
    // Cycles non dus : simple refus, sans exception (l'ancien code tentait à chaque fois un INSERT qui
    // échouait en P2002, avec une ERROR dans le journal PostgreSQL).
    for (let i = 0; i < 3; i++) expect(await t.ctx.work.runDueWork()).toEqual({ ran: false, reason: 'not_due' });
    // Bail tenu par une instance (cycle en cours) : refusé même après la fenêtre.
    await t.prisma.jobLease.update({ where: { name: 'dispatch' }, data: { lockedUntil: new Date(t.clock.now().getTime() + 60_000) } });
    t.clock.advance(5_000);
    expect((await t.ctx.work.runDueWork()).ran).toBe(false);
    await t.prisma.$executeRawUnsafe('TRUNCATE "JobLease"');
    expect((await t.ctx.work.runDueWork()).ran).toBe(true);
    expect(await t.prisma.jobLease.count()).toBe(1);
  });

  it('GET /cron/daily exige CRON_SECRET puis purge et lance un cycle', async () => {
    expect((await call(t.app, 'GET', '/cron/daily')).statusCode).toBe(401);
    const wrong = await t.app.inject({ method: 'GET', url: '/cron/daily', headers: { authorization: 'Bearer nope' } });
    expect(wrong.statusCode).toBe(401);
    await t.prisma.locationPing.create({
      data: { driverId: (await createDriver(t, 'MOTO', near)).user.id, lat: 1, lng: 1, createdAt: new Date('2025-01-01T00:00:00Z') },
    });
    const ok = await t.app.inject({ method: 'GET', url: '/cron/daily', headers: { authorization: `Bearer ${CRON_SECRET}` } });
    expect(ok.statusCode).toBe(200);
    const body = ok.json<CronDailyResultDto>();
    expect(body.retention.locationPingsDeleted).toBe(1);
    expect(body.dispatch.ran).toBe(true);
  });
});

describe('configuration de production', () => {
  const prod = {
    ...process.env,
    NODE_ENV: 'production',
    JWT_SECRET: 'x'.repeat(40),
    STORAGE_ENCRYPTION_KEY: 'c'.repeat(64),
    CORS_ORIGINS: 'https://console.yaar.test, https://app.yaar.test',
    OTP_DEV_BYPASS: 'true',
  };

  it('DEMO_MODE active le code 123456 même en production (avec DEMO_STAFF_CODE) ; sinon jamais', () => {
    expect(loadConfig(prod).otpDevBypass).toBe(false);
    expect(loadConfig({ ...prod, DEMO_MODE: 'true', DEMO_STAFF_CODE: '482913' })).toMatchObject({ otpDevBypass: true, demoMode: true });
    expect(() => loadConfig({ ...prod, DEMO_MODE: 'true' })).toThrow(/DEMO_STAFF_CODE/);
    expect(loadConfig(prod).corsOrigins).toEqual(['https://console.yaar.test', 'https://app.yaar.test']);
  });

  it('Vercel : poll et stockage en base par défaut, socket / disque local refusés, production par défaut', () => {
    const { NODE_ENV: _drop, ...noNodeEnv } = prod;
    const v = loadConfig({ ...noNodeEnv, VERCEL: '1', TRUST_PROXY: 'true' });
    expect(v).toMatchObject({ nodeEnv: 'production', realtimeMode: 'poll', storageDriver: 'db', trustProxy: true, onVercel: true });
    expect(() => loadConfig({ ...prod, VERCEL: '1', REALTIME_MODE: 'socket' })).toThrow(/poll/);
    expect(() => loadConfig({ ...prod, VERCEL: '1', STORAGE_DRIVER: 'local' })).toThrow(/db/);
    expect(loadConfig({ ...prod })).toMatchObject({ realtimeMode: 'socket', storageDriver: 'local' });
  });
});

describe('canal OTP WhatsApp (emplacement réservé)', () => {
  it('OTP_PROVIDER=whatsapp refuse proprement l’envoi (non configuré) et ne se combine pas avec DEMO_MODE', async () => {
    expect(() => loadConfig({ ...process.env, ...POLL, DEMO_MODE: 'true', OTP_PROVIDER: 'whatsapp' })).toThrow(
      /DEMO_MODE=true exige OTP_PROVIDER=console/,
    );
    const w = await createTestApp({ ...POLL, OTP_PROVIDER: 'whatsapp' }, { sms: null });
    try {
      const cfg = (await call(w.app, 'GET', '/config')).json<PublicConfigDto>();
      expect(cfg).toMatchObject({ demoMode: false, otpChannel: 'whatsapp' });
      const r = await call(w.app, 'POST', '/auth/otp/request', null, { phone: '+22670111111' });
      expect(r.statusCode).toBe(503);
      expect(r.json<ApiErrorBody>().error.code).toBe('OTP_PROVIDER_UNAVAILABLE');
      // Développement (OTP_DEV_BYPASS) : le code 123456 reste utilisable.
      expect((await call(w.app, 'POST', '/auth/otp/verify', null, { phone: '+22670111111', code: '123456' })).statusCode).toBe(200);
    } finally {
      await w.app.close();
      await w.prisma.$disconnect();
    }
  });
});

describe('kick() : budget de temps et waitUntil', () => {
  function slowWork(keepAlive: (p: Promise<unknown>) => void, budgetMs: number) {
    let finish: (r: TickResult) => void = () => undefined;
    const tick = vi.fn(() => new Promise<TickResult>((resolve) => (finish = resolve)));
    const dispatch = { tick } as unknown as DispatchService;
    const work = new BackgroundWork(t.prisma, new ManualClock(T0), dispatch, { throttleMs: 4000, budgetMs, leaseMs: 30_000 }, () => undefined, keepAlive);
    return { work, tick, finish: (r: TickResult) => finish(r) };
  }

  it('budget dépassé : la requête n’attend plus et le cycle est confié à keepAlive (waitUntil)', async () => {
    const keepAlive = vi.fn();
    const { work, tick, finish } = slowWork(keepAlive, 30);
    const started = Date.now();
    await work.kick();
    expect(Date.now() - started).toBeLessThan(2000);
    await vi.waitFor(() => expect(tick).toHaveBeenCalled());
    expect(keepAlive).toHaveBeenCalledTimes(1);
    const kept = keepAlive.mock.calls[0]![0] as Promise<unknown>;
    let settled = false;
    void kept.then(() => (settled = true));
    await new Promise((r) => setTimeout(r, 20));
    expect(settled).toBe(false);
    finish({ expired: 0, offered: 0, staleOffline: 0 });
    await kept;
    expect(settled).toBe(true);
  });

  it('cycle terminé dans le budget : pas de keepAlive', async () => {
    const keepAlive = vi.fn();
    const tick = vi.fn(async () => ({ expired: 0, offered: 0, staleOffline: 0 }));
    const work = new BackgroundWork(
      t.prisma,
      new ManualClock(T0),
      { tick } as unknown as DispatchService,
      { throttleMs: 4000, budgetMs: 5000, leaseMs: 30_000 },
      () => undefined,
      keepAlive,
    );
    await work.kick();
    expect(tick).toHaveBeenCalledTimes(1);
    expect(keepAlive).not.toHaveBeenCalled();
  });

  it('waitUntil de @vercel/functions : sans effet hors Vercel, transmis au contexte de requête Vercel', async () => {
    const symbol = Symbol.for('@vercel/request-context');
    const g = globalThis as Record<symbol, unknown>;
    expect(g[symbol]).toBeUndefined();
    expect(() => vercelKeepAlive(Promise.resolve())).not.toThrow();
    const waitUntil = vi.fn();
    g[symbol] = { get: () => ({ waitUntil }) };
    try {
      const p = Promise.resolve(1);
      vercelKeepAlive(p);
      expect(waitUntil).toHaveBeenCalledWith(p);
    } finally {
      delete g[symbol];
    }
  });
});
