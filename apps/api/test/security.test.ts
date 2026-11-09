import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ApiErrorBody, OfferDto, OrderDto } from '@yaar/shared';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { PURGED_ADDRESS, runRetention } from '../src/jobs/retention';
import { ManualClock } from '../src/lib/clock';
import { MemorySmsProvider } from '../src/providers/sms';
import {
  call,
  createDriver,
  createStore,
  createTestApp,
  login,
  loginStaff,
  nextPhone,
  P,
  resetDb,
  T0,
  type TestApp,
} from './helpers';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
  await t.prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(t.prisma);
  t.clock.set(T0);
  t.ctx.realtime.emitted.length = 0;
  t.ctx.realtime.evictions.length = 0;
  t.push.sent.length = 0;
});

const near = { lat: 12.37, lng: -1.526 };
const parcel = {
  type: 'PARCEL',
  vehicleType: 'MOTO',
  pickup: { ...P.centre, address: 'Rue 12.34, porte rouge', landmark: 'Chez ma tante' },
  dropoff: { ...P.zogona, address: 'Zogona, villa 45', landmark: 'Derrière l’école' },
  recipientName: 'Fatou',
  recipientPhone: '70 99 88 77',
};

/** Colis accepté par un livreur puis récupéré. */
async function pickedUpParcel() {
  const client = await login(t.app, 'CLIENT');
  const driver = await createDriver(t, 'MOTO', near);
  const o = (await call(t.app, 'POST', '/orders', client.accessToken, parcel)).json<OrderDto>();
  const offer = await t.prisma.dispatchOffer.findFirstOrThrow({ where: { orderId: o.id } });
  await call(t.app, 'POST', `/driver/offers/${offer.id}/accept`, driver.accessToken, {});
  await call(t.app, 'POST', `/orders/${o.id}/pickup`, driver.accessToken, {});
  const code = (await t.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).deliveryCode;
  return { client, driver, orderId: o.id, code, wrong: code === '0000' ? '1111' : '0000' };
}

describe('code de livraison : anti force brute', () => {
  it('20 essais parallèles erronés : 5 évalués au plus, puis 423', async () => {
    const { driver, orderId, code, wrong } = await pickedUpParcel();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => call(t.app, 'POST', `/orders/${orderId}/deliver`, driver.accessToken, { code: wrong })),
    );
    const evaluated = results.filter((r) => r.statusCode === 400).length;
    const locked = results.filter((r) => r.statusCode === 423).length;
    expect(evaluated).toBe(5);
    expect(locked).toBe(15);
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).deliveryCodeAttempts).toBe(5);
    // Même le bon code est refusé une fois bloqué
    const good = await call(t.app, 'POST', `/orders/${orderId}/deliver`, driver.accessToken, { code });
    expect(good.statusCode).toBe(423);
    expect(good.json<ApiErrorBody>().error.code).toBe('DELIVERY_CODE_LOCKED');
  });

  it('la console débloque le code (audité), puis le livreur livre', async () => {
    const { driver, orderId, code, wrong } = await pickedUpParcel();
    const staff = await loginStaff(t);
    for (let i = 0; i < 5; i++) await call(t.app, 'POST', `/orders/${orderId}/deliver`, driver.accessToken, { code: wrong });
    expect((await call(t.app, 'POST', `/orders/${orderId}/deliver`, driver.accessToken, { code })).statusCode).toBe(423);
    // Réservé à la console
    expect((await call(t.app, 'POST', `/controller/orders/${orderId}/reset-delivery-code`, driver.accessToken, {})).statusCode).toBe(403);
    const reset = await call(t.app, 'POST', `/controller/orders/${orderId}/reset-delivery-code`, staff.accessToken, { reason: 'Client joint par téléphone' });
    expect(reset.statusCode).toBe(200);
    expect(await t.prisma.auditLog.count({ where: { action: 'ORDER_DELIVERY_CODE_RESET', entityId: orderId } })).toBe(1);
    const done = await call(t.app, 'POST', `/orders/${orderId}/deliver`, driver.accessToken, { code });
    expect(done.json<OrderDto>().status).toBe('DELIVERED');
  });

  it('OTP : des vérifications parallèles erronées ne dépassent pas 5 essais', async () => {
    const phone = nextPhone();
    // Instance sans contournement OTP (code 123456 refusé) pour tester le vrai chemin.
    const cfg = { ...loadConfig(), otpDevBypass: false };
    const sms = new MemorySmsProvider();
    const built = await buildApp({ config: cfg, clock: new ManualClock(T0), sms, logger: false });
    await built.app.ready();
    try {
      await call(built.app, 'POST', '/auth/otp/request', null, { phone });
      const real = sms.lastCodeFor(phone)!;
      const bad = real === '000000' ? '111111' : '000000';
      await Promise.all(
        Array.from({ length: 15 }, () => call(built.app, 'POST', '/auth/otp/verify', null, { phone, code: bad })),
      );
      const otp = await t.prisma.otpCode.findFirstOrThrow({ where: { phone } });
      expect(otp.attempts).toBe(5);
      // Le bon code ne passe plus : il faut en redemander un.
      expect((await call(built.app, 'POST', '/auth/otp/verify', null, { phone, code: real })).statusCode).toBe(400);
    } finally {
      await built.app.close();
    }
  });

  it('limite par IP des demandes de code (SMS)', async () => {
    const cfg = { ...loadConfig(), authRateLimitRequest: 3 };
    const built = await buildApp({ config: cfg, clock: new ManualClock(T0), sms: new MemorySmsProvider(), logger: false });
    await built.app.ready();
    try {
      const codes: number[] = [];
      for (let i = 0; i < 4; i++) codes.push((await call(built.app, 'POST', '/auth/otp/request', null, { phone: nextPhone() })).statusCode);
      expect(codes).toEqual([200, 200, 200, 429]);
    } finally {
      await built.app.close();
    }
  });

  it('refuse un fichier dont le contenu ne correspond pas au type déclaré', async () => {
    const { driver, orderId, code } = await pickedUpParcel();
    const fake = Buffer.from('<html><script>alert(1)</script></html>').toString('base64');
    const r = await call(t.app, 'POST', `/orders/${orderId}/deliver`, driver.accessToken, {
      code,
      proofPhoto: { mimeType: 'image/png', dataBase64: fake },
    });
    expect(r.statusCode).toBe(415);
    expect(r.json<ApiErrorBody>().error.code).toBe('UNSUPPORTED_FILE');
  });
});

describe('reprise d’une course bloquée par la console', () => {
  it('livraison forcée : statut DELIVERED, caisse du livreur, audit, livreur libéré', async () => {
    const { driver, orderId } = await pickedUpParcel();
    const staff = await loginStaff(t);
    const r = await call(t.app, 'POST', `/controller/orders/${orderId}/force-deliver`, staff.accessToken, { reason: 'Code perdu, client confirmé' });
    expect(r.statusCode).toBe(200);
    const o = await t.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(o.status).toBe('DELIVERED');
    const p = await t.prisma.driverProfile.findUniqueOrThrow({ where: { userId: driver.user.id } });
    expect(p.isBusy).toBe(false);
    expect(p.cashHeld).toBe(o.total);
    expect(await t.prisma.cashLedgerEntry.count({ where: { orderId, type: 'COLLECTION' } })).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { action: 'ORDER_FORCE_DELIVERED', entityId: orderId } })).toBe(1);
    expect(t.ctx.realtime.evictions).toContainEqual({ orderId, userId: driver.user.id });
    // Le livreur peut de nouveau passer hors ligne
    expect((await call(t.app, 'PATCH', '/driver/availability', driver.accessToken, { online: false })).statusCode).toBe(200);
  });

  it('annulation après retrait par la console : incident ouvert, livreur libéré', async () => {
    const { client, driver, orderId } = await pickedUpParcel();
    const staff = await loginStaff(t);
    // Le client ne peut pas annuler après le retrait
    expect((await call(t.app, 'POST', `/orders/${orderId}/cancel`, client.accessToken, {})).statusCode).toBe(409);
    const r = await call(t.app, 'POST', `/orders/${orderId}/cancel`, staff.accessToken, { reason: 'Livreur injoignable' });
    expect(r.json<OrderDto>().status).toBe('CANCELLED');
    const inc = await t.prisma.incident.findFirstOrThrow({ where: { orderId } });
    expect(inc).toMatchObject({ type: 'OTHER', status: 'OPEN' });
    expect((await t.prisma.driverProfile.findUniqueOrThrow({ where: { userId: driver.user.id } })).isBusy).toBe(false);
    expect(t.ctx.realtime.evictions).toContainEqual({ orderId, userId: driver.user.id });
  });

  it('refuse de suspendre un livreur en course', async () => {
    const { driver } = await pickedUpParcel();
    const staff = await loginStaff(t);
    const a = await call(t.app, 'POST', `/controller/drivers/${driver.user.id}/suspend`, staff.accessToken, { reason: 'Test' });
    expect(a.statusCode).toBe(409);
    expect(a.json<ApiErrorBody>().error.code).toBe('DRIVER_BUSY');
    const b = await call(t.app, 'POST', `/controller/users/${driver.user.id}/suspend`, staff.accessToken, { reason: 'Test' });
    expect(b.statusCode).toBe(409);
  });
});

describe('confidentialité des adresses', () => {
  it('une offre ne contient pas l’adresse du client, seulement des zones approximatives', async () => {
    const client = await login(t.app, 'CLIENT');
    const driver = await createDriver(t, 'MOTO', near);
    await call(t.app, 'POST', '/orders', client.accessToken, parcel);
    const [offer] = (await call(t.app, 'GET', '/driver/offers', driver.accessToken)).json<OfferDto[]>();
    expect(offer).toBeDefined();
    const text = JSON.stringify(offer);
    for (const secret of ['Rue 12.34', 'villa 45', 'Chez ma tante', 'école', 'Fatou', '99 88 77', '12.3686', '12.3805'])
      expect(text).not.toContain(secret);
    expect(offer!.dropoff).toEqual({ address: 'Secteur Zogona', zone: 'Secteur Zogona' });
    expect(offer!.pickup.address).toBe('Secteur Centre-ville');
  });

  it('offre FOOD : adresse de la boutique, zone de livraison seulement', async () => {
    const { seller, storeId, productIds } = await createStore(t, P.centre);
    const client = await login(t.app, 'CLIENT');
    const driver = await createDriver(t, 'MOTO', near);
    const o = (
      await call(t.app, 'POST', '/orders', client.accessToken, {
        type: 'FOOD', storeId, vehicleType: 'MOTO', items: [{ productId: productIds[0], quantity: 1 }],
        dropoff: { ...P.patteDOie, address: 'Maison bleue rue 15', landmark: 'Station Total' },
      })
    ).json<OrderDto>();
    await call(t.app, 'POST', `/orders/${o.id}/accept`, seller.accessToken, {});
    await call(t.app, 'POST', `/orders/${o.id}/ready`, seller.accessToken, {});
    const [offer] = (await call(t.app, 'GET', '/driver/offers', driver.accessToken)).json<OfferDto[]>();
    expect(offer!.pickup).toMatchObject({ address: 'Avenue Kwame Nkrumah', name: 'Le Verdoyant' });
    expect(offer!.dropoff.address).toBe('Secteur Patte d’Oie');
    // Ancienne commande payée à la livraison : tout est encaissé auprès du client.
    expect(offer).toMatchObject({ cashToCollect: o.total, cashAtPickup: 0, cashAtDelivery: o.total });
    expect(JSON.stringify(offer)).not.toContain('Maison bleue');
  });

  it('le vendeur ne garde pas l’adresse du client après la livraison', async () => {
    const { seller, storeId, productIds } = await createStore(t, P.centre);
    const client = await login(t.app, 'CLIENT');
    const driver = await createDriver(t, 'MOTO', near);
    const staff = await loginStaff(t);
    const o = (
      await call(t.app, 'POST', '/orders', client.accessToken, {
        type: 'FOOD', storeId, vehicleType: 'MOTO', items: [{ productId: productIds[0], quantity: 1 }],
        dropoff: { ...P.patteDOie, address: 'Maison bleue', landmark: 'Station' },
      })
    ).json<OrderDto>();
    expect((await call(t.app, 'GET', `/orders/${o.id}`, seller.accessToken)).json<OrderDto>().dropoff?.address).toBe('Maison bleue');
    await call(t.app, 'POST', `/orders/${o.id}/accept`, seller.accessToken, {});
    await call(t.app, 'POST', `/orders/${o.id}/ready`, seller.accessToken, {});
    const offer = await t.prisma.dispatchOffer.findFirstOrThrow({ where: { orderId: o.id } });
    await call(t.app, 'POST', `/driver/offers/${offer.id}/accept`, driver.accessToken, {});
    await call(t.app, 'POST', `/orders/${o.id}/pickup`, driver.accessToken, {});
    await call(t.app, 'POST', `/controller/orders/${o.id}/force-deliver`, staff.accessToken, { reason: 'test' });
    const after = (await call(t.app, 'GET', `/orders/${o.id}`, seller.accessToken)).json<OrderDto>();
    expect(after.status).toBe('DELIVERED');
    expect(after.dropoff).toBeNull();
    expect(after.recipientName).toBeNull();
    // Le livreur non plus ; le client garde son historique.
    expect((await call(t.app, 'GET', `/orders/${o.id}`, driver.accessToken)).json<OrderDto>().dropoff).toBeNull();
    expect((await call(t.app, 'GET', `/orders/${o.id}`, client.accessToken)).json<OrderDto>().dropoff?.address).toBe('Maison bleue');
  });

  it('rétention : positions client des commandes et des SOS purgées après 12 mois', async () => {
    const client = await login(t.app, 'CLIENT');
    const driver = await createDriver(t, 'MOTO', null);
    const old = new Date(T0);
    old.setUTCMonth(old.getUTCMonth() - 13);
    const base = {
      clientId: client.user.id, vehicleType: 'MOTO' as const, pickupLat: 12.36, pickupLng: -1.52, pickupAddress: 'Chez moi',
      dropoffLat: 12.38, dropoffLng: -1.49, dropoffAddress: 'Chez elle', dropoffLandmark: 'Portail vert', recipientPhone: '+22670000099',
      distanceKm: 3, itemsTotal: 0, deliveryFee: 1500, commission: 300, driverEarning: 1200, sellerPayout: 0, total: 1500, deliveryCode: '1234',
    };
    const oldDone = await t.prisma.order.create({ data: { ...base, type: 'PARCEL', status: 'DELIVERED', createdAt: old } });
    const oldActive = await t.prisma.order.create({ data: { ...base, type: 'PARCEL', status: 'SEARCHING_DRIVER', createdAt: old } });
    const recent = await t.prisma.order.create({ data: { ...base, type: 'PARCEL', status: 'DELIVERED', createdAt: T0 } });
    await t.prisma.incident.create({ data: { type: 'SOS', reporterId: driver.user.id, lat: 12.3, lng: -1.5, description: 'SOS', createdAt: old } });

    const r = await runRetention(t.prisma, t.clock);
    expect(r.orderLocationsPurged).toBe(1);
    expect(r.incidentLocationsPurged).toBe(1);
    const purged = await t.prisma.order.findUniqueOrThrow({ where: { id: oldDone.id } });
    expect(purged).toMatchObject({
      pickupLat: 0, pickupLng: 0, dropoffLat: 0, dropoffLng: 0, dropoffAddress: PURGED_ADDRESS, pickupAddress: PURGED_ADDRESS,
      dropoffLandmark: '', recipientPhone: null, total: 1500,
    });
    expect(purged.locationPurgedAt).not.toBeNull();
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: oldActive.id } })).dropoffAddress).toBe('Chez elle');
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: recent.id } })).dropoffAddress).toBe('Chez elle');
    expect(await t.prisma.incident.findFirstOrThrow()).toMatchObject({ lat: null, lng: null });
    // Idempotent
    expect((await runRetention(t.prisma, t.clock)).orderLocationsPurged).toBe(0);
  });
});

describe('suivi des livreurs', () => {
  it('consentement : retrait = hors ligne et position effacée', async () => {
    const d = await createDriver(t, 'MOTO', near);
    const r = await call(t.app, 'DELETE', '/driver/consent', d.accessToken);
    expect(r.json()).toMatchObject({ trackingConsentAt: null, isOnline: false, lastLocation: null });
    const on = await call(t.app, 'PATCH', '/driver/availability', d.accessToken, { online: true });
    expect(on.json<ApiErrorBody>().error.code).toBe('CONSENT_REQUIRED');
    expect((await call(t.app, 'POST', '/driver/consent', d.accessToken)).json()).toMatchObject({ trackingConsentAt: T0.toISOString() });
    expect((await call(t.app, 'PATCH', '/driver/availability', d.accessToken, { online: true })).statusCode).toBe(200);
  });

  it('un livreur en ligne sans position récente est remis hors ligne et n’est plus sollicité', async () => {
    const stale = await createDriver(t, 'MOTO', near);
    t.clock.advance(11 * 60_000);
    const fresh = await createDriver(t, 'MOTO', { lat: 12.371, lng: -1.527 });
    const client = await login(t.app, 'CLIENT');
    await call(t.app, 'POST', '/orders', client.accessToken, parcel);
    const offer = await t.prisma.dispatchOffer.findFirstOrThrow();
    expect(offer.driverId).toBe(fresh.user.id);
    const res = await t.ctx.dispatch.tick();
    expect(res.staleOffline).toBe(1);
    const p = await t.prisma.driverProfile.findUniqueOrThrow({ where: { userId: stale.user.id } });
    expect(p).toMatchObject({ isOnline: false, lastLat: null, lastLocationAt: null });
  });

  it('pas d’offres en double avec des cycles d’affectation simultanés', async () => {
    await createDriver(t, 'MOTO', near);
    await createDriver(t, 'MOTO', { lat: 12.371, lng: -1.527 });
    const client = await login(t.app, 'CLIENT');
    const o = (await call(t.app, 'POST', '/orders', client.accessToken, parcel)).json<OrderDto>();
    await t.prisma.dispatchOffer.deleteMany();
    await Promise.all([t.ctx.dispatch.tick(), t.ctx.dispatch.offerNext(o.id), t.ctx.dispatch.offerNext(o.id), t.ctx.dispatch.startSearch(o.id)]);
    expect(await t.prisma.dispatchOffer.count({ where: { orderId: o.id, status: 'OFFERED' } })).toBe(1);
  });
});
