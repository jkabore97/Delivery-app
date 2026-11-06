import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PRICING_RULES,
  computeDeliveryPrice,
  roadDistanceKm,
  type ApiErrorBody,
  type CashLedgerEntryDto,
  type DriverEarningsDto,
  type DriverProfileDto,
  type OfferDto,
  type OrderDto,
  type QuoteResponse,
} from '@yaar/shared';
import { call, createDriver, createStore, createTestApp, login, loginStaff, P, resetDb, type TestApp } from './helpers';

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
  t.clock.set(new Date('2026-11-06T10:00:00.000Z'));
  t.ctx.realtime.emitted.length = 0;
});

const near = { lat: 12.3700, lng: -1.5260 }; // ~0,2 km du centre
const farther = { lat: 12.3800, lng: -1.5300 }; // ~1,3 km

describe('cycle de vie complet d’une commande FOOD payée en espèces', () => {
  it('devis → commande → vendeur → affectation → livraison avec code → caisse livreur', async () => {
    const { seller, storeId, productIds } = await createStore(t, P.centre);
    const client = await login(t.app, 'CLIENT', undefined, 'Aminata');
    const nearDriver = await createDriver(t, 'MOTO', near);
    const farDriver = await createDriver(t, 'MOTO', farther);
    await createDriver(t, 'BIKE', near); // mauvais type de véhicule
    await createDriver(t, 'MOTO', P.bobo); // hors rayon

    const dropoff = { ...P.patteDOie, address: "Patte d'Oie, secteur 15", landmark: 'Derrière la station Total' };
    const items = [
      { productId: productIds[0], quantity: 2 },
      { productId: productIds[1], quantity: 1 },
    ];

    // 1. Devis
    const q = await call(t.app, 'POST', '/orders/quote', client.accessToken, { type: 'FOOD', storeId, items, dropoff });
    expect(q.statusCode).toBe(200);
    const quote = q.json<QuoteResponse>();
    const expectedKm = roadDistanceKm(P.centre, P.patteDOie);
    expect(quote.distanceKm).toBe(expectedKm);
    expect(quote.itemsTotal).toBe(5500);
    const moto = quote.options.find((o) => o.vehicleType === 'MOTO')!;
    const expectedFee = computeDeliveryPrice(DEFAULT_PRICING_RULES[1]!, expectedKm).deliveryFee;
    expect(moto.deliveryFee).toBe(expectedFee);
    expect(moto.deliveryFee % 50).toBe(0);
    expect(moto.total).toBe(5500 + expectedFee);
    expect(quote.options.map((o) => o.vehicleType)).toEqual(['BIKE', 'MOTO', 'CAR']);

    // 2. Commande
    const c = await call(t.app, 'POST', '/orders', client.accessToken, { type: 'FOOD', storeId, items, dropoff, vehicleType: 'MOTO' });
    expect(c.statusCode).toBe(201);
    const created = c.json<OrderDto>();
    expect(created.status).toBe('PENDING');
    expect(created.number).toBeGreaterThanOrEqual(1001);
    expect(created.deliveryCode).toMatch(/^\d{4}$/);
    expect(created.total).toBe(moto.total);
    expect(created.commission).toBeNull(); // visible des contrôleurs seulement
    const code = created.deliveryCode!;
    const id = created.id;

    // Le vendeur voit la commande mais pas le code.
    const sv = (await call(t.app, 'GET', `/orders/${id}`, seller.accessToken)).json<OrderDto>();
    expect(sv.deliveryCode).toBeNull();
    expect(sv.sellerPayout).toBe(5500 - Math.floor(5500 * 0.1));

    // 3. Vendeur : accepter, prête -> recherche de livreur
    const acc = await call(t.app, 'POST', `/orders/${id}/accept`, seller.accessToken, { prepTimeMinutes: 15 });
    expect(acc.json<OrderDto>().status).toBe('ACCEPTED');
    // Impossible de sauter une étape
    const bad = await call(t.app, 'POST', `/orders/${id}/accept`, seller.accessToken, {});
    expect(bad.statusCode).toBe(409);
    expect(bad.json<ApiErrorBody>().error.code).toBe('INVALID_TRANSITION');

    const ready = await call(t.app, 'POST', `/orders/${id}/ready`, seller.accessToken, {});
    expect(ready.json<OrderDto>().status).toBe('SEARCHING_DRIVER');

    // 4. L'offre va au livreur MOTO le plus proche
    const offersNear = (await call(t.app, 'GET', '/driver/offers', nearDriver.accessToken)).json<OfferDto[]>();
    expect(offersNear).toHaveLength(1);
    const offer = offersNear[0]!;
    expect(offer.orderId).toBe(id);
    expect(offer.cashToCollect).toBe(created.total);
    expect(offer).not.toHaveProperty('dropoff.lat');
    expect((await call(t.app, 'GET', '/driver/offers', farDriver.accessToken)).json<OfferDto[]>()).toHaveLength(0);
    expect(t.ctx.realtime.emitted.some((e) => e.event === 'offer.new' && e.rooms.includes(`driver:${nearDriver.user.id}`))).toBe(true);

    // Avant acceptation, le livreur ne voit pas la commande.
    expect((await call(t.app, 'GET', `/orders/${id}`, nearDriver.accessToken)).statusCode).toBe(404);

    const accepted = await call(t.app, 'POST', `/driver/offers/${offer.id}/accept`, nearDriver.accessToken, {});
    expect(accepted.statusCode).toBe(200);
    const asDriver = accepted.json<OrderDto>();
    expect(asDriver.status).toBe('ASSIGNED');
    expect(asDriver.dropoff).toMatchObject({ landmark: 'Derrière la station Total' });
    expect(asDriver.client?.phone).toBe(client.user.phone);
    expect(asDriver.deliveryCode).toBeNull();
    expect(asDriver.driverEarning).toBeGreaterThan(0);

    // Le client voit son livreur
    const asClient = (await call(t.app, 'GET', `/orders/${id}`, client.accessToken)).json<OrderDto>();
    expect(asClient.driver?.id).toBe(nearDriver.user.id);
    expect(asClient.driver?.lastLocation).not.toBeNull();
    expect(asClient.deliveryCode).toBe(code);

    // 5. Livraison sans récupération : refusée
    const early = await call(t.app, 'POST', `/orders/${id}/deliver`, nearDriver.accessToken, { code });
    expect(early.statusCode).toBe(409);

    expect((await call(t.app, 'POST', `/orders/${id}/pickup`, nearDriver.accessToken, {})).json<OrderDto>().status).toBe('PICKED_UP');

    // Mauvais code
    const wrong = await call(t.app, 'POST', `/orders/${id}/deliver`, nearDriver.accessToken, {
      code: code === '0000' ? '1111' : '0000',
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json<ApiErrorBody>().error.code).toBe('DELIVERY_CODE_INVALID');

    // Bon code + photo
    const { PNG_BASE64 } = await import('./helpers');
    const done = await call(t.app, 'POST', `/orders/${id}/deliver`, nearDriver.accessToken, {
      code,
      proofPhoto: { mimeType: 'image/png', dataBase64: PNG_BASE64 },
    });
    expect(done.statusCode).toBe(200);
    const deliveredForDriver = done.json<OrderDto>();
    expect(deliveredForDriver.status).toBe('DELIVERED');
    expect(deliveredForDriver.cashCollected).toBe(created.total);
    expect(deliveredForDriver.hasProofPhoto).toBe(true);
    // Après livraison, le livreur ne voit plus les adresses du client.
    expect(deliveredForDriver.dropoff).toBeNull();
    expect(deliveredForDriver.pickup).toBeNull();
    expect(deliveredForDriver.client?.phone).toBeNull();

    // 6. Caisse livreur
    const earnings = (await call(t.app, 'GET', '/driver/earnings', nearDriver.accessToken)).json<DriverEarningsDto>();
    expect(earnings.cashHeld).toBe(created.total);
    expect(earnings.today.deliveries).toBe(1);
    expect(earnings.today.earnings).toBe(deliveredForDriver.driverEarning);
    expect(earnings.recentLedger[0]).toMatchObject({ type: 'COLLECTION', amount: created.total, balanceAfter: created.total });

    // Historique des statuts (OrderEvent)
    const staff = await loginStaff(t);
    const full = (await call(t.app, 'GET', `/orders/${id}`, staff.accessToken)).json<OrderDto>();
    expect(full.events!.map((e) => e.toStatus)).toEqual([
      'PENDING', 'ACCEPTED', 'READY', 'SEARCHING_DRIVER', 'ASSIGNED', 'PICKED_UP', 'DELIVERED',
    ]);
    expect(full.commission).toBe(created.total - created.itemsTotal - full.driverEarning! + Math.floor(5500 * 0.1));
    expect(full.deliveryCode).toBeNull();

    // Photo de preuve visible par le client (déchiffrée)
    const photo = await call(t.app, 'GET', `/orders/${id}/proof-photo`, client.accessToken);
    expect(photo.statusCode).toBe(200);
    expect(photo.headers['content-type']).toContain('image/png');
    expect(photo.rawPayload.equals(Buffer.from(PNG_BASE64, 'base64'))).toBe(true);

    // 7. Notes dans les deux sens
    expect((await call(t.app, 'POST', `/orders/${id}/rating`, client.accessToken, { score: 5, comment: 'Parfait' })).statusCode).toBe(201);
    expect((await call(t.app, 'POST', `/orders/${id}/rating`, nearDriver.accessToken, { score: 4 })).statusCode).toBe(201);
    const again = await call(t.app, 'POST', `/orders/${id}/rating`, client.accessToken, { score: 1 });
    expect(again.json<ApiErrorBody>().error.code).toBe('ALREADY_RATED');
    const profile = (await call(t.app, 'GET', '/driver/profile', nearDriver.accessToken)).json<DriverProfileDto>();
    expect(profile.ratingAvg).toBe(5);
    expect(profile.isBusy).toBe(false);
  });
});

describe('colis, paiement et annulation', () => {
  it('un colis passe directement en recherche de livreur', async () => {
    const client = await login(t.app, 'CLIENT');
    const driver = await createDriver(t, 'BIKE', near);
    const r = await call(t.app, 'POST', '/orders', client.accessToken, {
      type: 'PARCEL', vehicleType: 'BIKE',
      pickup: { ...P.centre, address: 'Centre', landmark: 'Grand marché' },
      dropoff: { ...P.zogona, address: 'Zogona' },
      parcelDescription: 'Enveloppe',
    });
    expect(r.statusCode).toBe(201);
    const o = r.json<OrderDto>();
    expect(o.status).toBe('SEARCHING_DRIVER');
    expect(o.itemsTotal).toBe(0);
    const offers = (await call(t.app, 'GET', '/driver/offers', driver.accessToken)).json<OfferDto[]>();
    expect(offers[0]?.orderId).toBe(o.id);
  });

  it('refuse le mobile money (Lot 2)', async () => {
    const client = await login(t.app, 'CLIENT');
    const r = await call(t.app, 'POST', '/orders', client.accessToken, {
      type: 'PARCEL', vehicleType: 'BIKE', paymentMethod: 'MOBILE_MONEY',
      pickup: { ...P.centre, address: 'A' }, dropoff: { ...P.zogona, address: 'B' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json<ApiErrorBody>().error).toEqual({
      code: 'PAYMENT_METHOD_UNAVAILABLE',
      message: 'Paiement mobile money non disponible (Lot 2)',
    });
  });

  it('refuse une boutique fermée et un produit indisponible', async () => {
    const { seller, storeId, productIds } = await createStore(t);
    const client = await login(t.app, 'CLIENT');
    const body = { type: 'FOOD', storeId, items: [{ productId: productIds[0], quantity: 1 }], dropoff: { ...P.zogona, address: 'B' } };
    await call(t.app, 'PATCH', `/seller/products/${productIds[0]}`, seller.accessToken, { isAvailable: false });
    expect((await call(t.app, 'POST', '/orders/quote', client.accessToken, body)).json<ApiErrorBody>().error.code).toBe('PRODUCT_UNAVAILABLE');
    await call(t.app, 'PATCH', `/seller/stores/${storeId}`, seller.accessToken, { isOpen: false });
    expect((await call(t.app, 'POST', '/orders/quote', client.accessToken, body)).json<ApiErrorBody>().error.code).toBe('STORE_CLOSED');
  });

  it('le client annule tôt, plus après la récupération', async () => {
    const client = await login(t.app, 'CLIENT');
    const driver = await createDriver(t, 'BIKE', near);
    const mk = async () =>
      (
        await call(t.app, 'POST', '/orders', client.accessToken, {
          type: 'PARCEL', vehicleType: 'BIKE', pickup: { ...P.centre, address: 'A' }, dropoff: { ...P.zogona, address: 'B' },
        })
      ).json<OrderDto>();
    const o1 = await mk();
    const c1 = await call(t.app, 'POST', `/orders/${o1.id}/cancel`, client.accessToken, { reason: 'Erreur' });
    expect(c1.json<OrderDto>().status).toBe('CANCELLED');
    // L'offre a été retirée au livreur
    expect((await call(t.app, 'GET', '/driver/offers', driver.accessToken)).json<OfferDto[]>()).toHaveLength(0);

    const o2 = await mk();
    const offer = (await call(t.app, 'GET', '/driver/offers', driver.accessToken)).json<OfferDto[]>()[0]!;
    await call(t.app, 'POST', `/driver/offers/${offer.id}/accept`, driver.accessToken, {});
    await call(t.app, 'POST', `/orders/${o2.id}/pickup`, driver.accessToken, {});
    const c2 = await call(t.app, 'POST', `/orders/${o2.id}/cancel`, client.accessToken, {});
    expect(c2.statusCode).toBe(409);
  });
});

describe('affectation (dispatch)', () => {
  const parcel = { type: 'PARCEL', vehicleType: 'MOTO', pickup: { ...P.centre, address: 'A' }, dropoff: { ...P.zogona, address: 'B' } };

  it('passe au livreur suivant après 30 s sans réponse, puis après un refus', async () => {
    const client = await login(t.app, 'CLIENT');
    const d1 = await createDriver(t, 'MOTO', near);
    const d2 = await createDriver(t, 'MOTO', farther);
    const o = (await call(t.app, 'POST', '/orders', client.accessToken, parcel)).json<OrderDto>();
    expect((await call(t.app, 'GET', '/driver/offers', d1.accessToken)).json<OfferDto[]>()).toHaveLength(1);

    t.clock.advance(29_000);
    expect((await t.ctx.dispatch.tick()).expired).toBe(0);
    t.clock.advance(1_000);
    const tick = await t.ctx.dispatch.tick();
    expect(tick.expired).toBe(1);
    expect((await call(t.app, 'GET', '/driver/offers', d1.accessToken)).json<OfferDto[]>()).toHaveLength(0);
    const o2 = (await call(t.app, 'GET', '/driver/offers', d2.accessToken)).json<OfferDto[]>();
    expect(o2[0]?.orderId).toBe(o.id);

    // d2 refuse : plus personne d'éligible (d1 en délai de carence)
    expect((await call(t.app, 'POST', `/driver/offers/${o2[0]!.id}/reject`, d2.accessToken, {})).statusCode).toBe(204);
    expect(await t.prisma.dispatchOffer.count({ where: { orderId: o.id, status: 'OFFERED' } })).toBe(0);

    // Accepter une offre expirée est refusé
    const late = await call(t.app, 'POST', `/driver/offers/${o2[0]!.id}/accept`, d2.accessToken, {});
    expect(late.json<ApiErrorBody>().error.code).toBe('OFFER_EXPIRED');
  });

  it('un contrôleur affecte puis réaffecte manuellement', async () => {
    const client = await login(t.app, 'CLIENT');
    const staff = await loginStaff(t);
    const o = (await call(t.app, 'POST', '/orders', client.accessToken, parcel)).json<OrderDto>();
    const pending = (await call(t.app, 'GET', '/controller/orders/pending', staff.accessToken)).json<Array<{ id: string }>>();
    expect(pending.map((p) => p.id)).toContain(o.id);

    const d1 = await createDriver(t, 'MOTO', farther);
    const d2 = await createDriver(t, 'MOTO', null); // hors ligne : listé mais non affectable
    const cands = (await call(t.app, 'GET', `/controller/orders/${o.id}/candidates`, staff.accessToken)).json<Array<{ id: string; isOnline: boolean }>>();
    expect(cands.map((c) => c.id)).toEqual([d1.user.id, d2.user.id]);
    expect(cands[1]!.isOnline).toBe(false);

    const a1 = await call(t.app, 'POST', `/controller/orders/${o.id}/assign`, staff.accessToken, { driverId: d1.user.id });
    expect(a1.json<OrderDto>()).toMatchObject({ status: 'ASSIGNED', driver: { id: d1.user.id } });
    // Un livreur hors ligne ne peut pas être affecté (pas de suivi possible).
    const offline = await call(t.app, 'POST', `/controller/orders/${o.id}/assign`, staff.accessToken, { driverId: d2.user.id });
    expect(offline.statusCode).toBe(409);
    expect(offline.json<ApiErrorBody>().error.code).toBe('DRIVER_OFFLINE');
    await t.prisma.driverProfile.update({
      where: { userId: d2.user.id },
      data: { isOnline: true, lastLat: farther.lat, lastLng: farther.lng, lastLocationAt: t.clock.now() },
    });
    const a2 = await call(t.app, 'POST', `/controller/orders/${o.id}/assign`, staff.accessToken, { driverId: d2.user.id });
    expect(a2.json<OrderDto>().driver?.id).toBe(d2.user.id);
    expect((await t.prisma.driverProfile.findUnique({ where: { userId: d1.user.id } }))!.isBusy).toBe(false);
    expect((await call(t.app, 'GET', `/orders/${o.id}`, d1.accessToken)).statusCode).toBe(404);
    const audit = await t.prisma.auditLog.count({ where: { action: 'ORDER_MANUALLY_ASSIGNED', entityId: o.id } });
    expect(audit).toBe(2);
  });
});

describe('plafond d’espèces', () => {
  it('bloque un livreur au plafond jusqu’au versement enregistré par un contrôleur', async () => {
    const staff = await loginStaff(t);
    const driver = await createDriver(t, 'MOTO', null, { cashHeld: 50_000 });
    const on = await call(t.app, 'PATCH', '/driver/availability', driver.accessToken, { online: true, lat: near.lat, lng: near.lng });
    expect(on.statusCode).toBe(409);
    expect(on.json<ApiErrorBody>().error.code).toBe('CASH_LIMIT_REACHED');

    // Un livreur au plafond ne reçoit pas d'offre même s'il est en ligne.
    await t.prisma.driverProfile.update({ where: { userId: driver.user.id }, data: { isOnline: true, lastLat: near.lat, lastLng: near.lng } });
    const client = await login(t.app, 'CLIENT');
    await call(t.app, 'POST', '/orders', client.accessToken, {
      type: 'PARCEL', vehicleType: 'MOTO', pickup: { ...P.centre, address: 'A' }, dropoff: { ...P.zogona, address: 'B' },
    });
    expect((await call(t.app, 'GET', '/driver/offers', driver.accessToken)).json<OfferDto[]>()).toHaveLength(0);
    await t.prisma.driverProfile.update({ where: { userId: driver.user.id }, data: { isOnline: false } });

    const tooMuch = await call(t.app, 'POST', `/controller/drivers/${driver.user.id}/cash-deposits`, staff.accessToken, { amount: 60_000 });
    expect(tooMuch.statusCode).toBe(409);
    const dep = await call(t.app, 'POST', `/controller/drivers/${driver.user.id}/cash-deposits`, staff.accessToken, { amount: 30_000, note: 'Versement agence' });
    expect(dep.statusCode).toBe(201);
    expect(dep.json<CashLedgerEntryDto>()).toMatchObject({ type: 'DEPOSIT', amount: -30_000, balanceAfter: 20_000 });

    const on2 = await call(t.app, 'PATCH', '/driver/availability', driver.accessToken, { online: true, lat: near.lat, lng: near.lng });
    expect(on2.statusCode).toBe(200);
    expect(on2.json<DriverProfileDto>()).toMatchObject({ isOnline: true, cashHeld: 20_000, cashBlocked: false });
    // En passant en ligne, il reçoit la commande en attente.
    expect((await call(t.app, 'GET', '/driver/offers', driver.accessToken)).json<OfferDto[]>()).toHaveLength(1);

    const cash = (await call(t.app, 'GET', '/controller/cash', staff.accessToken)).json<{ totalHeld: number }>();
    expect(cash.totalHeld).toBe(20_000);
    expect(await t.prisma.auditLog.count({ where: { action: 'CASH_DEPOSIT_RECORDED' } })).toBe(1);
  });
});
