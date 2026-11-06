import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, OrderDto, OrderUpdatedEvent, ServerToClientEvents, SosEvent } from '@yaar/shared';
import { call, createDriver, createTestApp, login, loginStaff, P, resetDb, type TestApp } from './helpers';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let t: TestApp;
let url: string;
const sockets: ClientSocket[] = [];

beforeAll(async () => {
  t = await createTestApp();
  await t.app.listen({ port: 0, host: '127.0.0.1' });
  url = `http://127.0.0.1:${(t.app.server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  for (const s of sockets) s.disconnect();
  await t.app.close();
  await t.prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(t.prisma);
});

function open(token: string | null): ClientSocket {
  const s: ClientSocket = connect(url, { auth: token ? { token } : {}, transports: ['websocket'], forceNew: true });
  sockets.push(s);
  return s;
}

function once<T>(s: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${event}`)), 5000);
    (s as unknown as { once: (e: string, cb: (p: T) => void) => void }).once(event, (p: T) => {
      clearTimeout(timer);
      resolve(p);
    });
  });
}

describe('Socket.IO', () => {
  it('refuse une connexion sans jeton valide', async () => {
    const s = open('invalide');
    const err = await once<Error>(s, 'connect_error');
    expect(err.message).toBe('UNAUTHENTICATED');
  });

  it('les contrôleurs reçoivent les SOS ; les clients suivent leur commande', async () => {
    const staff = await loginStaff(t);
    const client = await login(t.app, 'CLIENT');
    const driver = await createDriver(t, 'BIKE', { lat: 12.369, lng: -1.527 });

    const ctrl = open(staff.accessToken);
    await once(ctrl, 'connect');
    const cli = open(client.accessToken);
    await once(cli, 'connect');

    const o = (
      await call(t.app, 'POST', '/orders', client.accessToken, {
        type: 'PARCEL', vehicleType: 'BIKE', pickup: { ...P.centre, address: 'A' }, dropoff: { ...P.zogona, address: 'B' },
      })
    ).json<OrderDto>();

    const ack = await new Promise<{ ok: boolean }>((r) => cli.emit('order.subscribe', { orderId: o.id }, r));
    expect(ack.ok).toBe(true);
    // Un autre client ne peut pas s'abonner
    const intruder = await login(t.app, 'CLIENT');
    const is = open(intruder.accessToken);
    await once(is, 'connect');
    const nack = await new Promise<{ ok: boolean }>((r) => is.emit('order.subscribe', { orderId: o.id }, r));
    expect(nack.ok).toBe(false);

    const updated = once<OrderUpdatedEvent>(cli, 'order.updated');
    const offer = await t.prisma.dispatchOffer.findFirstOrThrow({ where: { orderId: o.id } });
    await call(t.app, 'POST', `/driver/offers/${offer.id}/accept`, driver.accessToken, {});
    expect(await updated).toMatchObject({ orderId: o.id, status: 'ASSIGNED', driverId: driver.user.id });

    const loc = once<{ driverId: string; orderId: string | null }>(cli, 'driver.location');
    await call(t.app, 'POST', '/driver/location', driver.accessToken, { lat: 12.37, lng: -1.52 });
    expect(await loc).toMatchObject({ driverId: driver.user.id, orderId: o.id });

    const sos = once<SosEvent>(ctrl, 'sos');
    const r = await call(t.app, 'POST', '/driver/sos', driver.accessToken, { lat: 12.37, lng: -1.52, message: 'Accident' });
    expect(r.statusCode).toBe(201);
    const ev = await sos;
    expect(ev.incident).toMatchObject({ type: 'SOS', status: 'OPEN', description: 'Accident', orderId: o.id });
  });

  it('un livreur réaffecté quitte la salle : il ne reçoit plus la position du nouveau livreur', async () => {
    const staff = await loginStaff(t);
    const client = await login(t.app, 'CLIENT');
    const a = await createDriver(t, 'BIKE', { lat: 12.369, lng: -1.527 });
    const o = (
      await call(t.app, 'POST', '/orders', client.accessToken, {
        type: 'PARCEL', vehicleType: 'BIKE', pickup: { ...P.centre, address: 'A' }, dropoff: { ...P.zogona, address: 'B' },
      })
    ).json<OrderDto>();
    const offer = await t.prisma.dispatchOffer.findFirstOrThrow({ where: { orderId: o.id } });
    await call(t.app, 'POST', `/driver/offers/${offer.id}/accept`, a.accessToken, {});
    const b = await createDriver(t, 'BIKE', { lat: 12.371, lng: -1.528 });

    const sa = open(a.accessToken);
    await once(sa, 'connect');
    const ack = await new Promise<{ ok: boolean }>((r) => sa.emit('order.subscribe', { orderId: o.id }, r));
    expect(ack.ok).toBe(true);
    const sc = open(client.accessToken);
    await once(sc, 'connect');
    await new Promise<{ ok: boolean }>((r) => sc.emit('order.subscribe', { orderId: o.id }, r));

    const received: unknown[] = [];
    sa.on('driver.location', (e) => received.push(e));
    const reassigned = await call(t.app, 'POST', `/controller/orders/${o.id}/assign`, staff.accessToken, { driverId: b.user.id });
    expect(reassigned.statusCode).toBe(200);
    // Le nouveau livreur envoie sa position : le client la reçoit, pas l'ancien livreur.
    const clientLoc = once<{ driverId: string }>(sc, 'driver.location');
    await call(t.app, 'POST', '/driver/location', b.accessToken, { lat: 12.372, lng: -1.529 });
    expect(await clientLoc).toMatchObject({ driverId: b.user.id });
    await new Promise((r) => setTimeout(r, 150));
    expect(received).toHaveLength(0);
    // Et il ne peut pas se réabonner
    const again = await new Promise<{ ok: boolean }>((r) => sa.emit('order.subscribe', { orderId: o.id }, r));
    expect(again.ok).toBe(false);
  });

  it('les sockets d’un compte suspendu sont fermées', async () => {
    const staff = await loginStaff(t);
    const client = await login(t.app, 'CLIENT');
    const s = open(client.accessToken);
    await once(s, 'connect');
    const gone = once<string>(s, 'disconnect');
    await call(t.app, 'POST', `/controller/users/${client.user.id}/suspend`, staff.accessToken, { reason: 'Fraude' });
    expect(await gone).toBe('io server disconnect');
  });
});
