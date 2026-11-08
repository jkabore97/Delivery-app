import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ApiErrorBody, AuthResponse, PublicConfigDto } from '@yaar/shared';
import { loadConfig } from '../src/config';
import { call, createTestApp, nextPhone, resetDb, type TestApp } from './helpers';

/** Valeur de test (jamais celle d'un déploiement). */
const STAFF_CODE = '482913';

/** Démonstration publique « comme en production » : NODE_ENV=production, DEMO_MODE=true, code d'accès démo. */
const DEMO_PROD = {
  NODE_ENV: 'production',
  DEMO_MODE: 'true',
  DEMO_STAFF_CODE: STAFF_CODE,
  JWT_SECRET: 'demo-prod-secret-0123456789abcdef0123456789',
  CORS_ORIGINS: 'https://yaar-console.vercel.app',
  REALTIME_MODE: 'poll',
};

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp(DEMO_PROD);
});
afterAll(async () => {
  await t.app.close();
  await t.prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(t.prisma);
});

const verify = (phone: string, code: string, extra: Record<string, unknown> = {}) =>
  call(t.app, 'POST', '/auth/otp/verify', null, { phone, code, ...extra });
const requestCode = (phone: string) => call(t.app, 'POST', '/auth/otp/request', null, { phone });

async function staffAccount(role: 'CONTROLLER' | 'ADMIN'): Promise<string> {
  const phone = nextPhone();
  await t.prisma.user.create({ data: { phone, role, name: role } });
  return phone;
}

describe('mode démo en production : code d’accès des comptes de console', () => {
  it('un contrôleur ou un admin existant ne se connecte PAS avec 123456', async () => {
    for (const role of ['CONTROLLER', 'ADMIN'] as const) {
      const phone = await staffAccount(role);
      // Sans code demandé : refus (le code d'accès démo s'utilise comme un code reçu).
      const direct = await verify(phone, '123456');
      expect(direct.statusCode).toBe(400);
      expect(direct.json<ApiErrorBody>().error.code).toBe('OTP_INVALID');
      expect((await requestCode(phone)).statusCode).toBe(200);
      const r = await verify(phone, '123456');
      expect(r.statusCode).toBe(400);
      expect(r.json<ApiErrorBody>().error).toMatchObject({ code: 'OTP_INVALID', message: 'Code incorrect' });
    }
  });

  it('un contrôleur se connecte avec DEMO_STAFF_CODE après « Recevoir le code »', async () => {
    const phone = await staffAccount('CONTROLLER');
    // Sans code demandé : refusé, même avec le bon code d'accès.
    expect((await verify(phone, STAFF_CODE)).statusCode).toBe(400);
    await requestCode(phone);
    const r = await verify(phone, STAFF_CODE);
    expect(r.statusCode).toBe(200);
    expect(r.json<AuthResponse>().user).toMatchObject({ phone, role: 'CONTROLLER' });
    // Usage unique, comme un code reçu.
    expect((await verify(phone, STAFF_CODE)).statusCode).toBe(400);
  });

  it('le code d’accès démo partage le compteur atomique de 5 essais du code demandé', async () => {
    const phone = await staffAccount('ADMIN');
    await requestCode(phone);
    const results = await Promise.all(Array.from({ length: 8 }, () => verify(phone, '000001')));
    expect(results.every((r) => r.statusCode === 400)).toBe(true);
    const otp = await t.prisma.otpCode.findFirstOrThrow({ where: { phone } });
    expect(otp.attempts).toBe(5);
    // Essais épuisés : même le bon code d'accès est refusé, il faut redemander un code.
    expect((await verify(phone, STAFF_CODE)).statusCode).toBe(400);
    t.clock.advance(1_000);
    await requestCode(phone);
    expect((await verify(phone, STAFF_CODE)).statusCode).toBe(200);
  });

  it('le vrai code envoyé reste valable pour un compte de console', async () => {
    const phone = await staffAccount('CONTROLLER');
    await requestCode(phone);
    const sent = t.sms.lastCodeFor(phone)!;
    expect((await verify(phone, sent)).statusCode).toBe(200);
  });

  it('clients, vendeurs, livreurs et nouveaux comptes se connectent avec 123456 (sans code demandé)', async () => {
    const client = await verify(nextPhone(), '123456');
    expect(client.statusCode).toBe(200);
    expect(client.json<AuthResponse>()).toMatchObject({ isNewUser: true, user: { role: 'CLIENT' } });
    const driver = await verify(nextPhone(), '123456', { role: 'DRIVER' });
    expect(driver.json<AuthResponse>().user.role).toBe('DRIVER');
    // Compte existant (vendeur) : 123456 accepté, rôle conservé.
    const sellerPhone = nextPhone();
    await t.prisma.user.create({ data: { phone: sellerPhone, role: 'SELLER' } });
    const seller = await verify(sellerPhone, '123456', { role: 'CLIENT' });
    expect(seller.statusCode).toBe(200);
    expect(seller.json<AuthResponse>().user.role).toBe('SELLER');
    // Une inscription ne crée jamais un compte de console.
    expect((await verify(nextPhone(), '123456', { role: 'CONTROLLER' })).statusCode).toBe(400);
    expect((await verify(nextPhone(), '123456', { role: 'ADMIN' })).statusCode).toBe(400);
  });

  it('GET /config annonce le mode démo sans jamais révéler le code d’accès', async () => {
    const r = await call(t.app, 'GET', '/config');
    expect(r.json<PublicConfigDto>().demoMode).toBe(true);
    expect(r.body).not.toContain(STAFF_CODE);
  });
});

describe('mode démo en développement / test', () => {
  it('sans DEMO_STAFF_CODE : 123456 par défaut, y compris pour les comptes de console', async () => {
    const dev = await createTestApp({ DEMO_MODE: 'true', REALTIME_MODE: 'poll' });
    try {
      expect(dev.ctx.config.demoStaffCode).toBe('123456');
      const phone = nextPhone();
      await dev.prisma.user.create({ data: { phone, role: 'CONTROLLER' } });
      await call(dev.app, 'POST', '/auth/otp/request', null, { phone });
      const r = await call(dev.app, 'POST', '/auth/otp/verify', null, { phone, code: '123456' });
      expect(r.statusCode).toBe(200);
      expect(r.json<AuthResponse>().user.role).toBe('CONTROLLER');
    } finally {
      await dev.app.close();
      await dev.prisma.$disconnect();
    }
  });

  it('sans DEMO_MODE (OTP_DEV_BYPASS du développement) : comportement inchangé', () => {
    const c = loadConfig({ ...process.env, DEMO_MODE: 'false' });
    expect(c).toMatchObject({ otpDevBypass: true, demoMode: false, demoStaffCode: undefined });
  });
});

describe('configuration du mode démo', () => {
  const prod = {
    ...process.env,
    NODE_ENV: 'production',
    JWT_SECRET: 'x'.repeat(40),
    STORAGE_ENCRYPTION_KEY: 'c'.repeat(64),
    CORS_ORIGINS: 'https://yaar-console.vercel.app',
  };

  it('refuse DEMO_MODE=true sans OTP_PROVIDER=console (même en développement)', () => {
    expect(() => loadConfig({ ...prod, DEMO_MODE: 'true', DEMO_STAFF_CODE: STAFF_CODE, OTP_PROVIDER: 'whatsapp' })).toThrow(
      /DEMO_MODE=true exige OTP_PROVIDER=console/,
    );
    expect(() => loadConfig({ ...process.env, DEMO_MODE: 'true', OTP_PROVIDER: 'whatsapp' })).toThrow(/OTP_PROVIDER=console/);
  });

  it('production ou Vercel : DEMO_STAFF_CODE obligatoire, 6 chiffres, différent de 123456', () => {
    expect(() => loadConfig({ ...prod, DEMO_MODE: 'true' })).toThrow(/DEMO_STAFF_CODE/);
    expect(() => loadConfig({ ...prod, DEMO_MODE: 'true', DEMO_STAFF_CODE: '123456' })).toThrow(/123456/);
    expect(() => loadConfig({ ...prod, DEMO_MODE: 'true', DEMO_STAFF_CODE: '12345' })).toThrow(/6 chiffres/);
    expect(() => loadConfig({ ...prod, DEMO_MODE: 'true', DEMO_STAFF_CODE: '12a456' })).toThrow(/6 chiffres/);
    // VERCEL=1 compte comme la production, même avec un NODE_ENV différent.
    expect(() => loadConfig({ ...process.env, VERCEL: '1', NODE_ENV: 'development', REALTIME_MODE: 'poll', STORAGE_DRIVER: 'db', DEMO_MODE: 'true' })).toThrow(
      /DEMO_STAFF_CODE/,
    );
    expect(loadConfig({ ...prod, DEMO_MODE: 'true', DEMO_STAFF_CODE: STAFF_CODE })).toMatchObject({
      demoMode: true,
      otpDevBypass: true,
      demoStaffCode: STAFF_CODE,
    });
    // Hors démo, la variable est ignorée et le contournement OTP n'existe pas en production.
    expect(loadConfig({ ...prod, DEMO_STAFF_CODE: STAFF_CODE })).toMatchObject({ demoMode: false, otpDevBypass: false, demoStaffCode: undefined });
  });

  it('le message d’erreur ne contient jamais la valeur du code', () => {
    try {
      loadConfig({ ...prod, DEMO_MODE: 'true', DEMO_STAFF_CODE: '98765x' });
      expect.unreachable();
    } catch (e) {
      expect(String(e)).not.toContain('98765x');
    }
  });
});
