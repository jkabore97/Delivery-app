import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ApiErrorBody, AuditLogDto, DriverProfileDto, Paginated } from '@yaar/shared';
import { call, createTestApp, login, loginStaff, PNG_BASE64, resetDb, type TestApp } from './helpers';

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

const doc = (extra: Record<string, unknown> = {}) => ({ mimeType: 'image/png', dataBase64: PNG_BASE64, ...extra });

describe('dossier livreur (KYC)', () => {
  it('inscription moto, dépôt des pièces, validation par un contrôleur et journal d’audit', async () => {
    const driver = await login(t.app, 'DRIVER', undefined, 'Ousmane B.');
    const staff = await loginStaff(t);

    expect((await call(t.app, 'GET', '/driver/profile', driver.accessToken)).statusCode).toBe(404);
    const noPlate = await call(t.app, 'PUT', '/driver/profile', driver.accessToken, { vehicleType: 'MOTO' });
    expect(noPlate.statusCode).toBe(400);

    const p = await call(t.app, 'PUT', '/driver/profile', driver.accessToken, { vehicleType: 'MOTO', plate: '11 km 2280' });
    expect(p.statusCode).toBe(200);
    const prof = p.json<DriverProfileDto>();
    expect(prof).toMatchObject({ status: 'PENDING', plate: '11 KM 2280', kycComplete: false });
    expect(prof.missingDocuments).toEqual(['CNIB', 'PERMIS', 'CARTE_GRISE', 'ASSURANCE', 'SELFIE']);

    // L'assurance exige une date d'expiration
    const noExp = await call(t.app, 'PUT', '/driver/documents/ASSURANCE', driver.accessToken, doc());
    expect(noExp.statusCode).toBe(400);

    for (const type of ['CNIB', 'PERMIS', 'CARTE_GRISE', 'SELFIE']) {
      expect((await call(t.app, 'PUT', `/driver/documents/${type}`, driver.accessToken, doc())).statusCode).toBe(200);
    }

    // Dossier incomplet : validation refusée
    const early = await call(t.app, 'POST', `/controller/drivers/${driver.user.id}/approve`, staff.accessToken, {});
    expect(early.statusCode).toBe(409);
    expect(early.json<ApiErrorBody>().error.code).toBe('KYC_INCOMPLETE');

    // Assurance expirée : toujours incomplet
    await call(t.app, 'PUT', '/driver/documents/ASSURANCE', driver.accessToken, doc({ expiresAt: '2020-01-01' }));
    expect((await call(t.app, 'POST', `/controller/drivers/${driver.user.id}/approve`, staff.accessToken, {})).statusCode).toBe(409);
    const done = await call(t.app, 'PUT', '/driver/documents/ASSURANCE', driver.accessToken, doc({ expiresAt: '2027-12-31' }));
    expect(done.json<DriverProfileDto>().kycComplete).toBe(true);

    // File KYC côté console
    const queue = (await call(t.app, 'GET', '/controller/drivers?status=PENDING', staff.accessToken)).json<Paginated<DriverProfileDto>>();
    expect(queue.items.map((d) => d.userId)).toContain(driver.user.id);
    const detail = (await call(t.app, 'GET', `/controller/drivers/${driver.user.id}`, staff.accessToken)).json<DriverProfileDto>();
    const cnib = detail.documents.find((d) => d.type === 'CNIB')!;

    // Consultation d'une pièce : contenu renvoyé et consultation journalisée
    const view = await call(t.app, 'GET', `/controller/drivers/${driver.user.id}/documents/${cnib.id}`, staff.accessToken);
    expect(view.statusCode).toBe(200);
    expect(view.headers['content-type']).toContain('image/png');
    expect(view.rawPayload.equals(Buffer.from(PNG_BASE64, 'base64'))).toBe(true);
    const logs = (await call(t.app, 'GET', '/controller/audit-logs?action=DRIVER_DOCUMENT_VIEWED', staff.accessToken)).json<Paginated<AuditLogDto>>();
    expect(logs.total).toBe(1);
    expect(logs.items[0]).toMatchObject({
      action: 'DRIVER_DOCUMENT_VIEWED',
      entityType: 'DriverDocument',
      entityId: cnib.id,
      actor: { id: staff.user.id },
      metadata: { driverId: driver.user.id, documentType: 'CNIB' },
    });

    // Le livreur ne peut pas se valider lui-même ni lire les pièces via la console
    expect((await call(t.app, 'POST', `/controller/drivers/${driver.user.id}/approve`, driver.accessToken, {})).statusCode).toBe(403);
    expect((await call(t.app, 'GET', `/controller/drivers/${driver.user.id}/documents/${cnib.id}`, driver.accessToken)).statusCode).toBe(403);

    const ok = await call(t.app, 'POST', `/controller/drivers/${driver.user.id}/approve`, staff.accessToken, {});
    expect(ok.statusCode).toBe(200);
    expect(ok.json<DriverProfileDto>().status).toBe('APPROVED');
    expect(await t.prisma.auditLog.count({ where: { action: 'DRIVER_APPROVED', entityId: driver.user.id } })).toBe(1);

    // Le livreur validé peut passer en ligne ; la suspension le met hors ligne
    // Consentement au suivi GPS exigé avant le premier passage en ligne, puis enregistré.
    const noConsent = await call(t.app, 'PATCH', '/driver/availability', driver.accessToken, { online: true });
    expect(noConsent.statusCode).toBe(403);
    expect(noConsent.json<{ error: { code: string } }>().error.code).toBe('CONSENT_REQUIRED');
    const on = await call(t.app, 'PATCH', '/driver/availability', driver.accessToken, { online: true, trackingConsent: true });
    expect(on.statusCode).toBe(200);
    expect(on.json<DriverProfileDto>().trackingConsentAt).toBe(t.clock.now().toISOString());
    const sus = await call(t.app, 'POST', `/controller/drivers/${driver.user.id}/suspend`, staff.accessToken, { reason: 'Assurance falsifiée' });
    expect(sus.json<DriverProfileDto>()).toMatchObject({ status: 'SUSPENDED', isOnline: false });
    expect((await call(t.app, 'PATCH', '/driver/availability', driver.accessToken, { online: true })).statusCode).toBe(403);
  });

  it('refus d’un dossier vélo puis nouveau dépôt', async () => {
    const driver = await login(t.app, 'DRIVER');
    const staff = await loginStaff(t);
    const p = (await call(t.app, 'PUT', '/driver/profile', driver.accessToken, { vehicleType: 'BIKE' })).json<DriverProfileDto>();
    expect(p.requiredDocuments).toEqual(['CNIB', 'SELFIE']);
    // Le permis n'est pas demandé pour un vélo
    expect((await call(t.app, 'PUT', '/driver/documents/PERMIS', driver.accessToken, doc())).statusCode).toBe(400);

    const rej = await call(t.app, 'POST', `/controller/drivers/${driver.user.id}/reject`, staff.accessToken, { reason: 'Selfie flou' });
    expect(rej.json<DriverProfileDto>()).toMatchObject({ status: 'REJECTED', rejectionReason: 'Selfie flou' });
    const again = await call(t.app, 'PUT', '/driver/documents/SELFIE', driver.accessToken, doc());
    expect(again.json<DriverProfileDto>().status).toBe('PENDING');
  });
});
