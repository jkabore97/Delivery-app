import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DriverProfileDto, OrderDto } from '@yaar/shared';
import { DbStorage, FileCipher, LocalDiskStorage, createStorage } from '../src/providers/storage';
import { call, createDriver, createTestApp, login, loginStaff, P, PNG_BASE64, resetDb, type TestApp } from './helpers';

const KEY = 'd'.repeat(64);
let t: TestApp;

beforeAll(async () => {
  t = await createTestApp({ STORAGE_DRIVER: 'db', STORAGE_ENCRYPTION_KEY: KEY });
});
afterAll(async () => {
  await t.app.close();
  await t.prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(t.prisma);
});

const PNG = Buffer.from(PNG_BASE64, 'base64');

describe('stockage en base (STORAGE_DRIVER=db)', () => {
  it('createStorage choisit le fournisseur selon la configuration', () => {
    expect(t.ctx.storage).toBeInstanceOf(DbStorage);
    expect(createStorage({ storageDriver: 'local', storageDir: '/tmp/x', storageEncryptionKey: undefined }, t.prisma)).toBeInstanceOf(
      LocalDiskStorage,
    );
  });

  it('écrit, relit, remplace et supprime ; les octets en base sont chiffrés (AES-256-GCM)', async () => {
    const s = new DbStorage(t.prisma, KEY);
    await s.put('kyc/u1/cnib-1.png', PNG);
    const row = await t.prisma.storedFile.findUniqueOrThrow({ where: { key: 'kyc/u1/cnib-1.png' } });
    expect(row.sizeBytes).toBe(PNG.length);
    expect(row.data.length).toBe(PNG.length + 28); // iv 12 + tag 16
    expect(Buffer.from(row.data).includes(PNG.subarray(0, 8))).toBe(false);
    expect(new FileCipher(KEY).decrypt(Buffer.from(row.data)).equals(PNG)).toBe(true);
    expect((await s.get('kyc/u1/cnib-1.png')).equals(PNG)).toBe(true);

    await s.put('kyc/u1/cnib-1.png', Buffer.from('autre'));
    expect((await s.get('kyc/u1/cnib-1.png')).toString()).toBe('autre');

    // Mauvaise clé : déchiffrement impossible (authentification GCM).
    await expect(new DbStorage(t.prisma, 'e'.repeat(64)).get('kyc/u1/cnib-1.png')).rejects.toThrow();

    await s.put('kyc/u1/selfie-1.png', PNG);
    await s.put('proofs/o1.png', PNG);
    await s.delete('kyc/u1/cnib-1.png');
    await expect(s.get('kyc/u1/cnib-1.png')).rejects.toMatchObject({ statusCode: 404 });
    await s.deletePrefix('kyc');
    expect(await t.prisma.storedFile.count()).toBe(1);
  });

  it('refuse les clés hors arborescence', async () => {
    const s = new DbStorage(t.prisma, KEY);
    for (const bad of ['../x', '/abs', 'a//b', 'a/./b', '', 'a\\b']) await expect(s.put(bad, PNG)).rejects.toThrow(/invalide/);
  });

  it('pièce KYC déposée puis consultée par la console : servie depuis la base et journalisée', async () => {
    const driver = await login(t.app, 'DRIVER');
    const staff = await loginStaff(t);
    await call(t.app, 'PUT', '/driver/profile', driver.accessToken, { vehicleType: 'BIKE' });
    const up = await call(t.app, 'PUT', '/driver/documents/CNIB', driver.accessToken, { mimeType: 'image/png', dataBase64: PNG_BASE64 });
    expect(up.statusCode).toBe(200);
    const doc = up.json<DriverProfileDto>().documents[0]!;
    expect(await t.prisma.storedFile.count({ where: { key: { startsWith: `kyc/${driver.user.id}/` } } })).toBe(1);

    // Remplacement : l'ancienne pièce est supprimée de la base.
    t.clock.advance(1000);
    await call(t.app, 'PUT', '/driver/documents/CNIB', driver.accessToken, { mimeType: 'image/png', dataBase64: PNG_BASE64 });
    expect(await t.prisma.storedFile.count({ where: { key: { startsWith: `kyc/${driver.user.id}/` } } })).toBe(1);
    const current = (await call(t.app, 'GET', '/driver/profile', driver.accessToken)).json<DriverProfileDto>().documents[0]!;
    expect(current.id).toBe(doc.id);

    const view = await call(t.app, 'GET', `/controller/drivers/${driver.user.id}/documents/${doc.id}`, staff.accessToken);
    expect(view.statusCode).toBe(200);
    expect(view.headers['content-type']).toContain('image/png');
    expect(view.rawPayload.equals(PNG)).toBe(true);
    const audit = await t.prisma.auditLog.findMany({ where: { action: 'DRIVER_DOCUMENT_VIEWED', entityId: doc.id } });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actorId).toBe(staff.user.id);
  });

  it('photo de preuve de livraison : stockée en base, consultation journalisée', async () => {
    const client = await login(t.app, 'CLIENT');
    const staff = await loginStaff(t);
    const d = await createDriver(t, 'BIKE', P.centre);
    const o = (
      await call(t.app, 'POST', '/orders', client.accessToken, {
        type: 'PARCEL', vehicleType: 'BIKE', pickup: { ...P.centre, address: 'A' }, dropoff: { ...P.zogona, address: 'B' },
      })
    ).json<OrderDto>();
    const offer = await t.prisma.dispatchOffer.findFirstOrThrow({ where: { orderId: o.id } });
    await call(t.app, 'POST', `/driver/offers/${offer.id}/accept`, d.accessToken, {});
    await call(t.app, 'POST', `/orders/${o.id}/pickup`, d.accessToken, {});
    const code = (await call(t.app, 'GET', `/orders/${o.id}`, client.accessToken)).json<OrderDto>().deliveryCode!;
    const del = await call(t.app, 'POST', `/orders/${o.id}/deliver`, d.accessToken, {
      code,
      proofPhoto: { mimeType: 'image/png', dataBase64: PNG_BASE64 },
    });
    expect(del.statusCode).toBe(200);
    expect(await t.prisma.storedFile.count({ where: { key: { startsWith: 'proofs/' } } })).toBe(1);
    const view = await call(t.app, 'GET', `/orders/${o.id}/proof-photo`, staff.accessToken);
    expect(view.statusCode).toBe(200);
    expect(view.rawPayload.equals(PNG)).toBe(true);
    expect(await t.prisma.auditLog.count({ where: { action: 'ORDER_PROOF_VIEWED', entityId: o.id } })).toBe(1);
  });
});
