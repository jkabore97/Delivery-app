import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ApiErrorBody, OrderDto } from '@yaar/shared';
import { call, createStore, createTestApp, login, loginStaff, P, resetDb, type TestApp } from './helpers';

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
});

describe('contrôle d’accès par rôle', () => {
  it('réserve la console aux contrôleurs et administrateurs', async () => {
    const client = await login(t.app, 'CLIENT');
    const driver = await login(t.app, 'DRIVER');
    const seller = await login(t.app, 'SELLER');
    for (const tok of [client.accessToken, driver.accessToken, seller.accessToken]) {
      const r = await call(t.app, 'GET', '/controller/dashboard', tok);
      expect(r.statusCode).toBe(403);
      expect(r.json<ApiErrorBody>().error.code).toBe('FORBIDDEN');
    }
    const staff = await loginStaff(t);
    expect((await call(t.app, 'GET', '/controller/dashboard', staff.accessToken)).statusCode).toBe(200);
  });

  it('seul un ADMIN crée un compte de console', async () => {
    const ctrl = await loginStaff(t, 'CONTROLLER');
    const admin = await loginStaff(t, 'ADMIN');
    const body = { phone: '70998877', name: 'Nouvel agent', role: 'CONTROLLER' };
    expect((await call(t.app, 'POST', '/controller/staff', ctrl.accessToken, body)).statusCode).toBe(403);
    expect((await call(t.app, 'POST', '/controller/staff', admin.accessToken, body)).statusCode).toBe(201);
  });

  it('un livreur ou un vendeur ne peut pas commander', async () => {
    const driver = await login(t.app, 'DRIVER');
    const r = await call(t.app, 'POST', '/orders/quote', driver.accessToken, {
      type: 'PARCEL', pickup: { ...P.centre, address: 'A' }, dropoff: { ...P.zogona, address: 'B' },
    });
    expect(r.statusCode).toBe(403);
  });

  it('un client ne peut pas agir comme livreur ni comme vendeur', async () => {
    const client = await login(t.app, 'CLIENT');
    expect((await call(t.app, 'POST', '/driver/location', client.accessToken, { lat: 12.3, lng: -1.5 })).statusCode).toBe(403);
    expect((await call(t.app, 'POST', '/seller/stores', client.accessToken, {})).statusCode).toBe(403);
  });

  it('un vendeur ne voit pas les commandes d’une autre boutique', async () => {
    const { productIds, storeId } = await createStore(t);
    const other = await login(t.app, 'SELLER');
    const client = await login(t.app, 'CLIENT');
    const o = await call(t.app, 'POST', '/orders', client.accessToken, {
      type: 'FOOD', storeId, items: [{ productId: productIds[0], quantity: 1 }], vehicleType: 'MOTO',
      dropoff: { ...P.patteDOie, address: "Patte d'Oie" },
    });
    const id = o.json<OrderDto>().id;
    expect((await call(t.app, 'GET', `/orders/${id}`, other.accessToken)).statusCode).toBe(404);
    expect((await call(t.app, 'POST', `/orders/${id}/accept`, other.accessToken, {})).statusCode).toBe(404);
    const otherClient = await login(t.app, 'CLIENT');
    expect((await call(t.app, 'GET', `/orders/${id}`, otherClient.accessToken)).statusCode).toBe(404);
  });

  it('renvoie une erreur de validation détaillée', async () => {
    const client = await login(t.app, 'CLIENT');
    const r = await call(t.app, 'POST', '/orders/quote', client.accessToken, { type: 'FOOD', dropoff: { lat: 999 } });
    expect(r.statusCode).toBe(400);
    const e = r.json<ApiErrorBody>().error;
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(e.details).toBeDefined();
  });

  it('renvoie 404 au format standard pour une route inconnue', async () => {
    const r = await call(t.app, 'GET', '/nope');
    expect(r.statusCode).toBe(404);
    expect(r.json<ApiErrorBody>().error.code).toBe('NOT_FOUND');
  });
});

describe('format des requêtes', () => {
  it('accepte une action POST avec Content-Type JSON et corps vide, refuse un JSON invalide', async () => {
    const client = await login(t.app, 'CLIENT');
    const o = await call(t.app, 'POST', '/orders', client.accessToken, {
      type: 'PARCEL', vehicleType: 'BIKE', pickup: { ...P.centre, address: 'A' }, dropoff: { ...P.zogona, address: 'B' },
    });
    const id = o.json<OrderDto>().id;
    const r = await t.app.inject({
      method: 'POST',
      url: `/orders/${id}/cancel`,
      headers: { authorization: `Bearer ${client.accessToken}`, 'content-type': 'application/json' },
      payload: '',
    });
    expect(r.statusCode).toBe(200);
    const bad = await t.app.inject({
      method: 'POST',
      url: '/auth/otp/request',
      headers: { 'content-type': 'application/json' },
      payload: '{"phone":',
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json<ApiErrorBody>().error).toEqual({ code: 'VALIDATION_ERROR', message: 'JSON invalide' });
  });
});
