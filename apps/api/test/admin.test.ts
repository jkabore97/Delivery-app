import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  ApiErrorBody,
  CashLedgerEntryDto,
  IncidentDto,
  OrderDto,
  OrderMessageDto,
  Paginated,
  PricingRuleDto,
  ProductDto,
  QuoteResponse,
  StoreDetailDto,
  StoreDto,
  UserDto,
} from '@yaar/shared';
import { call, createDriver, createStore, createTestApp, login, loginStaff, P, PNG_BASE64, resetDb, T0, type TestApp } from './helpers';

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
  t.push.sent.length = 0;
});

const near = { lat: 12.37, lng: -1.526 };
const parcel = {
  type: 'PARCEL', vehicleType: 'MOTO', pickup: { ...P.centre, address: 'A' }, dropoff: { ...P.zogona, address: 'B' },
};

describe('tarifs', () => {
  it('modification d’un tarif (auditée) appliquée aux devis suivants', async () => {
    const staff = await loginStaff(t);
    const client = await login(t.app, 'CLIENT');
    const body = { baseFare: 1000, perKm: 300, minimumFare: 2000, commissionPercent: 15, isActive: true };
    expect((await call(t.app, 'PUT', '/controller/pricing-rules/MOTO', client.accessToken, body)).statusCode).toBe(403);
    const r = await call(t.app, 'PUT', '/controller/pricing-rules/MOTO', staff.accessToken, body);
    expect(r.json<PricingRuleDto>()).toMatchObject({ vehicleType: 'MOTO', baseFare: 1000, perKm: 300 });
    const audit = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'PRICING_RULE_UPDATED' } });
    expect(audit.metadata).toMatchObject({ before: { baseFare: 700 }, after: { baseFare: 1000 } });
    const q = (await call(t.app, 'POST', '/orders/quote', client.accessToken, parcel)).json<QuoteResponse>();
    const moto = q.options.find((o) => o.vehicleType === 'MOTO')!;
    expect(moto.deliveryFee).toBe(Math.ceil(Math.max(2000, 1000 + 300 * q.distanceKm) / 50) * 50);
    // Désactivation d'un véhicule
    await call(t.app, 'PUT', '/controller/pricing-rules/CAR', staff.accessToken, { ...body, isActive: false });
    const q2 = (await call(t.app, 'POST', '/orders/quote', client.accessToken, parcel)).json<QuoteResponse>();
    expect(q2.options.find((o) => o.vehicleType === 'CAR')!.available).toBe(false);
    const refused = await call(t.app, 'POST', '/orders', client.accessToken, { ...parcel, vehicleType: 'CAR' });
    expect(refused.json<ApiErrorBody>().error.code).toBe('PRICING_UNAVAILABLE');
  });
});

describe('boutiques : validation par la console', () => {
  it('une boutique créée par un vendeur est invisible jusqu’à sa validation', async () => {
    const seller = await login(t.app, 'SELLER');
    const client = await login(t.app, 'CLIENT');
    const staff = await loginStaff(t);
    const s = (
      await call(t.app, 'POST', '/seller/stores', seller.accessToken, { name: 'Chez Fati', address: 'Tampouy', lat: 12.405, lng: -1.559 })
    ).json<StoreDto>();
    expect(s).toMatchObject({ approvalStatus: 'PENDING', commissionPercent: 10 });
    await call(t.app, 'PATCH', `/seller/stores/${s.id}`, seller.accessToken, { isOpen: true });
    expect((await call(t.app, 'GET', '/stores', client.accessToken)).json<Paginated<StoreDto>>().total).toBe(0);
    expect((await call(t.app, 'GET', `/stores/${s.id}`, client.accessToken)).statusCode).toBe(404);
    expect((await call(t.app, 'GET', `/stores/${s.id}`, seller.accessToken)).statusCode).toBe(200);

    const pending = (await call(t.app, 'GET', '/controller/stores?approvalStatus=PENDING', staff.accessToken)).json<Paginated<StoreDto>>();
    expect(pending.items.map((x) => x.id)).toEqual([s.id]);
    const ok = await call(t.app, 'POST', `/controller/stores/${s.id}/approve`, staff.accessToken, {});
    expect(ok.json<StoreDto>().approvalStatus).toBe('APPROVED');
    expect(await t.prisma.auditLog.count({ where: { action: 'STORE_APPROVED', entityId: s.id } })).toBe(1);

    const list = (await call(t.app, 'GET', `/stores?lat=${P.centre.lat}&lng=${P.centre.lng}`, client.accessToken)).json<Paginated<StoreDto>>();
    expect(list.items).toHaveLength(1);
    // Vue publique : pas de commission
    expect(list.items[0]).toMatchObject({ id: s.id, commissionPercent: null });
    expect(list.items[0]!.distanceKm).toBeGreaterThan(0);

    const sus = await call(t.app, 'POST', `/controller/stores/${s.id}/suspend`, staff.accessToken, { reason: 'Hygiène' });
    expect(sus.json<StoreDto>()).toMatchObject({ approvalStatus: 'SUSPENDED', isOpen: false, approvalNote: 'Hygiène' });
    expect((await call(t.app, 'GET', '/stores', client.accessToken)).json<Paginated<StoreDto>>().total).toBe(0);
  });

  it('commission et ouverture modifiées par la console (audité)', async () => {
    const { storeId } = await createStore(t);
    const staff = await loginStaff(t);
    const r = await call(t.app, 'PATCH', `/controller/stores/${storeId}`, staff.accessToken, { commissionPercent: 12.5 });
    expect(r.json<StoreDto>().commissionPercent).toBe(12.5);
    expect(await t.prisma.auditLog.count({ where: { action: 'STORE_UPDATED_BY_CONTROLLER', entityId: storeId } })).toBe(1);
  });

  it('photo de produit', async () => {
    const { seller, storeId, productIds } = await createStore(t);
    const client = await login(t.app, 'CLIENT');
    const pid = productIds[0]!;
    const bad = await call(t.app, 'PUT', `/seller/products/${pid}/photo`, seller.accessToken, { mimeType: 'application/pdf', dataBase64: PNG_BASE64 });
    expect(bad.statusCode).toBe(400);
    const r = await call(t.app, 'PUT', `/seller/products/${pid}/photo`, seller.accessToken, { mimeType: 'image/png', dataBase64: PNG_BASE64 });
    expect(r.json<ProductDto>().photoUrl).toBe(`/products/${pid}/photo`);
    const detail = (await call(t.app, 'GET', `/stores/${storeId}`, client.accessToken)).json<StoreDetailDto>();
    expect(detail.products.find((p) => p.id === pid)!.photoUrl).toBe(`/products/${pid}/photo`);
    const img = await call(t.app, 'GET', `/products/${pid}/photo`, client.accessToken);
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['x-content-type-options']).toBe('nosniff');
    expect(img.rawPayload.equals(Buffer.from(PNG_BASE64, 'base64'))).toBe(true);
    // Un autre vendeur ne peut pas la modifier
    const other = await login(t.app, 'SELLER');
    expect((await call(t.app, 'PUT', `/seller/products/${pid}/photo`, other.accessToken, { mimeType: 'image/png', dataBase64: PNG_BASE64 })).statusCode).toBe(404);
    const del = await call(t.app, 'DELETE', `/seller/products/${pid}/photo`, seller.accessToken);
    expect(del.json<ProductDto>().photoUrl).toBeNull();
    expect((await call(t.app, 'GET', `/products/${pid}/photo`, client.accessToken)).statusCode).toBe(404);
  });
});

describe('utilisateurs, livreurs, caisse, incidents', () => {
  it('liste, suspension et réactivation des comptes', async () => {
    const staff = await loginStaff(t);
    const client = await login(t.app, 'CLIENT', undefined, 'Moussa');
    const list = (await call(t.app, 'GET', '/controller/users?role=CLIENT&q=mous', staff.accessToken)).json<Paginated<UserDto>>();
    expect(list.items.map((u) => u.id)).toEqual([client.user.id]);
    await call(t.app, 'POST', `/controller/users/${client.user.id}/suspend`, staff.accessToken, { reason: 'Fraude' });
    expect((await call(t.app, 'GET', '/controller/users?suspended=true', staff.accessToken)).json<Paginated<UserDto>>().total).toBe(1);
    const un = await call(t.app, 'POST', `/controller/users/${client.user.id}/unsuspend`, staff.accessToken, {});
    expect(un.json<UserDto>().isSuspended).toBe(false);
    expect((await call(t.app, 'GET', '/me', client.accessToken)).statusCode).toBe(200);
    expect(await t.prisma.auditLog.count({ where: { entityId: client.user.id, action: { in: ['USER_SUSPENDED', 'USER_UNSUSPENDED'] } } })).toBe(2);
  });

  it('réintégration d’un livreur suspendu', async () => {
    const staff = await loginStaff(t);
    const d = await createDriver(t, 'BIKE', null);
    await call(t.app, 'POST', `/controller/drivers/${d.user.id}/suspend`, staff.accessToken, { reason: 'Contrôle' });
    const r = await call(t.app, 'POST', `/controller/drivers/${d.user.id}/reinstate`, staff.accessToken, {});
    expect(r.json()).toMatchObject({ status: 'APPROVED', suspensionReason: null });
    expect(await t.prisma.auditLog.count({ where: { action: 'DRIVER_REINSTATED', entityId: d.user.id } })).toBe(1);
  });

  it('deux versements simultanés ne rendent pas le solde négatif', async () => {
    const staff = await loginStaff(t);
    const d = await createDriver(t, 'MOTO', null, { cashHeld: 10_000 });
    const res = await Promise.all(
      [1, 2, 3].map(() => call(t.app, 'POST', `/controller/drivers/${d.user.id}/cash-deposits`, staff.accessToken, { amount: 6_000 })),
    );
    expect(res.map((r) => r.statusCode).sort()).toEqual([201, 409, 409]);
    const ok = res.find((r) => r.statusCode === 201)!.json<CashLedgerEntryDto>();
    expect(ok).toMatchObject({ amount: -6000, balanceAfter: 4000 });
    expect((await t.prisma.driverProfile.findUniqueOrThrow({ where: { userId: d.user.id } })).cashHeld).toBe(4000);
  });

  it('litige puis traitement de l’incident par la console', async () => {
    const staff = await loginStaff(t);
    const client = await login(t.app, 'CLIENT');
    const o = (await call(t.app, 'POST', '/orders', client.accessToken, parcel)).json<OrderDto>();
    const intruder = await login(t.app, 'CLIENT');
    expect((await call(t.app, 'POST', `/orders/${o.id}/dispute`, intruder.accessToken, { description: 'Pas à moi' })).statusCode).toBe(404);
    const d = await call(t.app, 'POST', `/orders/${o.id}/dispute`, client.accessToken, { description: 'Colis abîmé' });
    expect(d.statusCode).toBe(201);
    const inc = d.json<IncidentDto>();
    const list = (await call(t.app, 'GET', '/controller/incidents?type=DISPUTE&status=OPEN', staff.accessToken)).json<Paginated<IncidentDto>>();
    expect(list.items.map((i) => i.id)).toEqual([inc.id]);
    // Plusieurs statuts en une requête (console en mode poll : alertes ouvertes et en cours).
    const second = (await call(t.app, 'POST', `/orders/${o.id}/dispute`, client.accessToken, { description: 'Retard' })).json<IncidentDto>();
    await call(t.app, 'PATCH', `/controller/incidents/${second.id}`, staff.accessToken, { status: 'IN_PROGRESS' });
    const both = (await call(t.app, 'GET', '/controller/incidents?status=OPEN,IN_PROGRESS', staff.accessToken)).json<Paginated<IncidentDto>>();
    expect(both.items.map((i) => i.id).sort()).toEqual([inc.id, second.id].sort());
    expect((await call(t.app, 'GET', '/controller/incidents?status=OPEN,FERME', staff.accessToken)).statusCode).toBe(400);
    const res = await call(t.app, 'PATCH', `/controller/incidents/${inc.id}`, staff.accessToken, { status: 'RESOLVED', resolutionNote: 'Remboursé' });
    expect(res.json<IncidentDto>()).toMatchObject({ status: 'RESOLVED', resolutionNote: 'Remboursé', resolvedBy: { id: staff.user.id } });
    expect(t.ctx.realtime.emitted.some((e) => e.event === 'incident.updated')).toBe(true);
    const stillOpen = (await call(t.app, 'GET', '/controller/incidents?status=OPEN,IN_PROGRESS', staff.accessToken)).json<Paginated<IncidentDto>>();
    expect(stillOpen.items.map((i) => i.id)).toEqual([second.id]);
  });

  it('vendeur : refus d’une commande et statistiques du jour', async () => {
    const { seller, storeId, productIds } = await createStore(t);
    const client = await login(t.app, 'CLIENT');
    const o = (
      await call(t.app, 'POST', '/orders', client.accessToken, {
        type: 'FOOD', storeId, vehicleType: 'MOTO', items: [{ productId: productIds[0], quantity: 1 }],
        dropoff: { ...P.zogona, address: 'B' },
      })
    ).json<OrderDto>();
    const r = await call(t.app, 'POST', `/orders/${o.id}/reject`, seller.accessToken, { reason: 'Rupture de stock' });
    expect(r.json<OrderDto>()).toMatchObject({ status: 'CANCELLED', cancelReason: 'Refusée par le vendeur : Rupture de stock' });
    const stats = (await call(t.app, 'GET', `/seller/stores/${storeId}/stats`, seller.accessToken)).json<{ today: { orders: number; cancelled: number } }>();
    expect(stats.today).toMatchObject({ orders: 1, cancelled: 1 });
    // Les événements de statut utilisent l'horloge injectée
    const events = await t.prisma.orderEvent.findMany({ where: { orderId: o.id } });
    expect(events.every((e) => e.createdAt.getTime() === T0.getTime())).toBe(true);
  });

  it('exports CSV (audités, sans adresses)', async () => {
    const staff = await loginStaff(t);
    const client = await login(t.app, 'CLIENT');
    await call(t.app, 'POST', '/orders', client.accessToken, { ...parcel, dropoff: { ...P.zogona, address: 'Villa secrète' } });
    const r = await call(t.app, 'GET', '/controller/exports/orders.csv?from=2026-01-01', staff.accessToken);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('text/csv');
    const lines = r.body.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('numero;date;type;statut');
    expect(r.body).not.toContain('Villa secrète');
    expect((await call(t.app, 'GET', '/controller/exports/cash-ledger.csv', staff.accessToken)).statusCode).toBe(200);
    expect((await call(t.app, 'GET', '/controller/exports/orders.csv', client.accessToken)).statusCode).toBe(403);
    expect(await t.prisma.auditLog.count({ where: { action: 'DATA_EXPORTED' } })).toBe(2);
  });
});

describe('notifications, messagerie, estimation d’arrivée', () => {
  it('push : offre au livreur, nouvelle commande au vendeur, étapes au client', async () => {
    const { seller, storeId, productIds } = await createStore(t);
    const client = await login(t.app, 'CLIENT');
    const driver = await createDriver(t, 'MOTO', near);
    for (const [u, token] of [[client, 'ExponentPushToken[client-1]'], [seller, 'ExponentPushToken[seller-1]'], [driver, 'ExponentPushToken[driver-1]']] as const)
      expect((await call(t.app, 'POST', '/me/push-tokens', u.accessToken, { token })).statusCode).toBe(204);
    const o = (
      await call(t.app, 'POST', '/orders', client.accessToken, {
        type: 'FOOD', storeId, vehicleType: 'MOTO', items: [{ productId: productIds[0], quantity: 1 }], dropoff: { ...P.zogona, address: 'B' },
      })
    ).json<OrderDto>();
    await call(t.app, 'POST', `/orders/${o.id}/accept`, seller.accessToken, {});
    await call(t.app, 'POST', `/orders/${o.id}/ready`, seller.accessToken, {});
    await new Promise((r) => setTimeout(r, 50));
    const to = (tok: string) => t.push.sent.filter((s) => s.tokens.includes(tok)).map((s) => s.message.title);
    expect(to('ExponentPushToken[seller-1]')).toContain('Nouvelle commande');
    expect(to('ExponentPushToken[client-1]')).toContain('Commande acceptée');
    expect(to('ExponentPushToken[driver-1]')).toContain('Nouvelle course');
    // Désinscription
    await call(t.app, 'DELETE', '/me/push-tokens', driver.accessToken, { token: 'ExponentPushToken[driver-1]' });
    expect(await t.prisma.pushToken.count()).toBe(2);
  });

  it('messagerie client ↔ livreur pendant la course uniquement, ETA visible du client', async () => {
    const client = await login(t.app, 'CLIENT');
    const driver = await createDriver(t, 'MOTO', near);
    const seller = await login(t.app, 'SELLER');
    const o = (await call(t.app, 'POST', '/orders', client.accessToken, parcel)).json<OrderDto>();
    expect(o.etaMinutes).toBeNull();
    const early = await call(t.app, 'POST', `/orders/${o.id}/messages`, client.accessToken, { body: 'Allô ?' });
    expect(early.json<ApiErrorBody>().error.code).toBe('ORDER_NOT_ACTIVE');

    const offer = await t.prisma.dispatchOffer.findFirstOrThrow({ where: { orderId: o.id } });
    await call(t.app, 'POST', `/driver/offers/${offer.id}/accept`, driver.accessToken, {});
    const asClient = (await call(t.app, 'GET', `/orders/${o.id}`, client.accessToken)).json<OrderDto>();
    expect(asClient.etaMinutes).toBeGreaterThan(0);

    const m1 = await call(t.app, 'POST', `/orders/${o.id}/messages`, client.accessToken, { body: 'Portail bleu, je descends' });
    expect(m1.statusCode).toBe(201);
    await call(t.app, 'POST', `/orders/${o.id}/messages`, driver.accessToken, { body: 'J’arrive dans 5 min' });
    const ev = t.ctx.realtime.emitted.filter((e) => e.event === 'order.message');
    expect(ev[0]!.rooms).toEqual([`user:${client.user.id}`, `user:${driver.user.id}`]);
    const list = (await call(t.app, 'GET', `/orders/${o.id}/messages`, driver.accessToken)).json<OrderMessageDto[]>();
    expect(list.map((m) => m.sender.role)).toEqual(['CLIENT', 'DRIVER']);
    expect((await call(t.app, 'GET', `/orders/${o.id}/messages`, seller.accessToken)).statusCode).toBe(403);
    const vide = await call(t.app, 'POST', `/orders/${o.id}/messages`, client.accessToken, { body: '' });
    expect(vide.statusCode).toBe(400);

    await call(t.app, 'POST', `/orders/${o.id}/pickup`, driver.accessToken, {});
    const code = (await t.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).deliveryCode;
    await call(t.app, 'POST', `/orders/${o.id}/deliver`, driver.accessToken, { code });
    // Après la livraison, le livreur n'a plus accès à la conversation ; le client si.
    expect((await call(t.app, 'GET', `/orders/${o.id}/messages`, driver.accessToken)).statusCode).toBe(404);
    expect((await call(t.app, 'GET', `/orders/${o.id}/messages`, client.accessToken)).json<OrderMessageDto[]>()).toHaveLength(2);
  });

  it('messages d’erreur de validation en français', async () => {
    const client = await login(t.app, 'CLIENT');
    const r = await call(t.app, 'POST', '/orders/quote', client.accessToken, { type: 'PARCEL' });
    expect(r.statusCode).toBe(400);
    const msg = r.json<ApiErrorBody>().error.message;
    expect(msg).toMatch(/^Données invalides/);
    expect(msg).not.toMatch(/Invalid|expected|received/);
  });
});
