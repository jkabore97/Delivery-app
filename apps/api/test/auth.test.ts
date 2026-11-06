import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AuthResponse, ApiErrorBody, UserDto } from '@yaar/shared';
import { call, createTestApp, loginStaff, nextPhone, resetDb, type TestApp } from './helpers';

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

describe('authentification par OTP', () => {
  it('envoie un code par SMS puis connecte l’utilisateur avec ce code', async () => {
    const phone = '70 11 22 33';
    const r1 = await call(t.app, 'POST', '/auth/otp/request', null, { phone });
    expect(r1.statusCode).toBe(200);
    expect(r1.json()).toEqual({ sent: true, expiresInSeconds: 300 });
    const code = t.sms.lastCodeFor('+22670112233');
    expect(code).toMatch(/^\d{6}$/);

    const r2 = await call(t.app, 'POST', '/auth/otp/verify', null, { phone, code, role: 'SELLER', name: 'Awa' });
    expect(r2.statusCode).toBe(200);
    const body = r2.json<AuthResponse>();
    expect(body.isNewUser).toBe(true);
    expect(body.tokenType).toBe('Bearer');
    expect(body.user).toMatchObject({ phone: '+22670112233', role: 'SELLER', name: 'Awa' });

    const me = await call(t.app, 'GET', '/me', body.accessToken);
    expect(me.json<UserDto>().id).toBe(body.user.id);

    // Le code est à usage unique.
    if (code !== '123456') {
      const again = await call(t.app, 'POST', '/auth/otp/verify', null, { phone, code });
      expect(again.statusCode).toBe(400);
    }
  });

  it('refuse un code incorrect avec le format d’erreur standard', async () => {
    const phone = nextPhone();
    await call(t.app, 'POST', '/auth/otp/request', null, { phone });
    const r = await call(t.app, 'POST', '/auth/otp/verify', null, { phone, code: '000001' });
    expect(r.statusCode).toBe(400);
    expect(r.json<ApiErrorBody>().error.code).toBe('OTP_INVALID');
  });

  it('limite le nombre de demandes de code', async () => {
    const phone = nextPhone();
    for (let i = 0; i < 5; i++) expect((await call(t.app, 'POST', '/auth/otp/request', null, { phone })).statusCode).toBe(200);
    const r = await call(t.app, 'POST', '/auth/otp/request', null, { phone });
    expect(r.statusCode).toBe(429);
    expect(r.json<ApiErrorBody>().error.code).toBe('OTP_RATE_LIMITED');
  });

  it('ne permet pas de s’attribuer un rôle de console à l’inscription', async () => {
    const r = await call(t.app, 'POST', '/auth/otp/verify', null, { phone: nextPhone(), code: '123456', role: 'CONTROLLER' });
    expect(r.statusCode).toBe(400);
    expect(r.json<ApiErrorBody>().error.code).toBe('VALIDATION_ERROR');
  });

  it('garde le rôle existant à la reconnexion', async () => {
    const phone = nextPhone();
    await call(t.app, 'POST', '/auth/otp/verify', null, { phone, code: '123456', role: 'DRIVER' });
    const r = await call(t.app, 'POST', '/auth/otp/verify', null, { phone, code: '123456', role: 'CLIENT' });
    expect(r.json<AuthResponse>().user.role).toBe('DRIVER');
    expect(r.json<AuthResponse>().isNewUser).toBe(false);
  });

  it('refuse les requêtes sans jeton ou avec un jeton invalide', async () => {
    const r = await call(t.app, 'GET', '/me');
    expect(r.statusCode).toBe(401);
    expect(r.json()).toEqual({ error: { code: 'UNAUTHENTICATED', message: 'Authentification requise' } });
    const r2 = await call(t.app, 'GET', '/me', 'abc.def.ghi');
    expect(r2.statusCode).toBe(401);
  });

  it('bloque un compte suspendu (connexion et jeton existant)', async () => {
    const staff = await loginStaff(t);
    const phone = nextPhone();
    const client = (await call(t.app, 'POST', '/auth/otp/verify', null, { phone, code: '123456' })).json<AuthResponse>();
    const s = await call(t.app, 'POST', `/controller/users/${client.user.id}/suspend`, staff.accessToken, { reason: 'Fraude' });
    expect(s.statusCode).toBe(200);
    expect((await call(t.app, 'GET', '/me', client.accessToken)).json<ApiErrorBody>().error.code).toBe('ACCOUNT_SUSPENDED');
    const relog = await call(t.app, 'POST', '/auth/otp/verify', null, { phone, code: '123456' });
    expect(relog.statusCode).toBe(403);
  });
});
