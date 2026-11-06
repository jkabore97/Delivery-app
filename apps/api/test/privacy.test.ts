import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ApiErrorBody, DriverProfileDto, OrderDto } from '@yaar/shared';
import { runRetention } from '../src/jobs/retention';
import { call, createDriver, createTestApp, login, loginStaff, P, resetDb, type TestApp } from './helpers';

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
  t.ctx.realtime.emitted.length = 0;
});

describe('confidentialité de la localisation', () => {
  it('refuse les positions d’un livreur hors ligne et les accepte en ligne', async () => {
    const d = await createDriver(t, 'MOTO', null);
    const off = await call(t.app, 'POST', '/driver/location', d.accessToken, { lat: 12.37, lng: -1.52 });
    expect(off.statusCode).toBe(403);
    expect(off.json<ApiErrorBody>().error.code).toBe('DRIVER_OFFLINE');
    expect(await t.prisma.locationPing.count()).toBe(0);

    await call(t.app, 'PATCH', '/driver/availability', d.accessToken, { online: true });
    const on = await call(t.app, 'POST', '/driver/location', d.accessToken, { lat: 12.37, lng: -1.52, speed: 5 });
    expect(on.statusCode).toBe(204);
    expect(await t.prisma.locationPing.count()).toBe(1);
    // Sans course : position envoyée aux contrôleurs uniquement
    const ev = t.ctx.realtime.emitted.find((e) => e.event === 'driver.location');
    expect(ev?.rooms).toEqual(['controllers']);

    // Hors ligne : position effacée et nouveaux envois refusés
    const offAgain = await call(t.app, 'PATCH', '/driver/availability', d.accessToken, { online: false });
    expect(offAgain.json<DriverProfileDto>().lastLocation).toBeNull();
    expect((await call(t.app, 'POST', '/driver/location', d.accessToken, { lat: 12.37, lng: -1.52 })).statusCode).toBe(403);
  });

  it('un livreur non validé ne peut pas passer en ligne', async () => {
    const d = await createDriver(t, 'MOTO', null, { status: 'PENDING' });
    const r = await call(t.app, 'PATCH', '/driver/availability', d.accessToken, { online: true });
    expect(r.statusCode).toBe(403);
    expect(r.json<ApiErrorBody>().error.code).toBe('DRIVER_NOT_APPROVED');
  });

  it('la position est diffusée à la salle de la commande seulement pendant la course', async () => {
    const client = await login(t.app, 'CLIENT');
    const d = await createDriver(t, 'BIKE', { lat: 12.369, lng: -1.527 });
    const other = await createDriver(t, 'BIKE', null);
    const o = (
      await call(t.app, 'POST', '/orders', client.accessToken, {
        type: 'PARCEL', vehicleType: 'BIKE', pickup: { ...P.centre, address: 'A' }, dropoff: { ...P.zogona, address: 'B' },
      })
    ).json<OrderDto>();
    // Un autre livreur ne voit pas la commande
    expect((await call(t.app, 'GET', `/orders/${o.id}`, other.accessToken)).statusCode).toBe(404);
    const offer = await t.prisma.dispatchOffer.findFirstOrThrow({ where: { orderId: o.id } });
    await call(t.app, 'POST', `/driver/offers/${offer.id}/accept`, d.accessToken, {});
    await call(t.app, 'POST', '/driver/location', d.accessToken, { lat: 12.37, lng: -1.52 });
    const ev = t.ctx.realtime.emitted.filter((e) => e.event === 'driver.location').pop();
    expect(ev?.rooms).toEqual(['controllers', `order:${o.id}`]);
    const ping = await t.prisma.locationPing.findFirstOrThrow({ orderBy: { createdAt: 'desc' } });
    expect(ping.orderId).toBe(o.id);
  });

  it('purge les positions de plus de 12 mois', async () => {
    const d = await createDriver(t, 'MOTO', null);
    const now = t.clock.now();
    const old = new Date(now);
    old.setUTCMonth(old.getUTCMonth() - 13);
    const recent = new Date(now);
    recent.setUTCMonth(recent.getUTCMonth() - 11);
    await t.prisma.locationPing.createMany({
      data: [
        { driverId: d.user.id, lat: 12.3, lng: -1.5, createdAt: old },
        { driverId: d.user.id, lat: 12.3, lng: -1.5, createdAt: recent },
        { driverId: d.user.id, lat: 12.3, lng: -1.5, createdAt: now },
      ],
    });
    const r = await runRetention(t.prisma, t.clock);
    expect(r.locationPingsDeleted).toBe(1);
    expect(await t.prisma.locationPing.count()).toBe(2);
  });

  it('les contrôleurs voient les livreurs en ligne sur la carte', async () => {
    const staff = await loginStaff(t);
    await createDriver(t, 'CAR', { lat: 12.33, lng: -1.5 });
    await createDriver(t, 'MOTO', null);
    const map = (await call(t.app, 'GET', '/controller/map', staff.accessToken)).json<{ drivers: unknown[]; center: unknown }>();
    expect(map.drivers).toHaveLength(1);
    expect(map.center).toEqual({ lat: 12.3714, lng: -1.5197 });
  });
});
