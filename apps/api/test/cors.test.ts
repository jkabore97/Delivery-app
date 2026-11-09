import { createServer } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ApiErrorBody } from '@yaar/shared';
import { loadConfig } from '../src/config';
import { assertCorsOriginsForProduction, corsPatternToRegExp, isOriginAllowed, parseCorsOrigins } from '../src/lib/cors';
import { createDriver, createTestApp, resetDb, type TestApp } from './helpers';

const PREVIEW = 'https://yaar-console-*-wendtoin-jairus-kabore-s-projects.vercel.app';
const ORIGINS = `https://yaar-console.vercel.app, https://yaar-livraison.vercel.app/, ${PREVIEW}`;

describe('CORS_ORIGINS : origines exactes et motifs', () => {
  it('analyse la liste (espaces et / final ignorés) et reconnaît « * »', () => {
    expect(parseCorsOrigins('*')).toBe('*');
    expect(parseCorsOrigins(ORIGINS)).toEqual(['https://yaar-console.vercel.app', 'https://yaar-livraison.vercel.app', PREVIEW]);
  });

  it('un « * » couvre une partie d’UN SEUL segment du nom d’hôte', () => {
    const list = parseCorsOrigins(ORIGINS);
    const ok = [
      'https://yaar-console.vercel.app',
      'https://yaar-livraison.vercel.app',
      'https://yaar-console-git-main-wendtoin-jairus-kabore-s-projects.vercel.app',
      'https://yaar-console-a1b2c3d4e-wendtoin-jairus-kabore-s-projects.vercel.app',
    ];
    for (const o of ok) expect(isOriginAllowed(o, list), o).toBe(true);
    const refused = [
      'https://yaar-console-x.y-wendtoin-jairus-kabore-s-projects.vercel.app', // deux segments
      'https://yaar-console--wendtoin-jairus-kabore-s-projects.vercel.app.evil.test', // suffixe ajouté
      'http://yaar-console-a-wendtoin-jairus-kabore-s-projects.vercel.app', // autre schéma
      'https://evil-yaar-console-a-wendtoin-jairus-kabore-s-projects.vercel.app', // préfixe ajouté
      'https://yaar-console.vercel.app.evil.test',
      'https://yaar-app.vercel.app',
    ];
    for (const o of refused) expect(isOriginAllowed(o, list), o).toBe(false);
    expect(isOriginAllowed(undefined, list)).toBe(false);
    expect(corsPatternToRegExp('https://a-*.example.test').test('https://a-.example.test')).toBe(false);
  });

  it('refuse les motifs mal formés ; en production, « * » seul et un segment entier « * »', () => {
    expect(() => parseCorsOrigins('https://*')).not.toThrow();
    expect(() => parseCorsOrigins('*.vercel.app')).toThrow(/motif/);
    expect(() => parseCorsOrigins('https://app.test/*')).toThrow(/motif/);
    expect(() => parseCorsOrigins('https://app.test:*')).toThrow(/motif/);
    expect(() => assertCorsOriginsForProduction('*')).toThrow(/interdit en production/);
    expect(() => assertCorsOriginsForProduction(parseCorsOrigins('https://*.vercel.app'))).toThrow(/trop large/);
    expect(() => assertCorsOriginsForProduction(parseCorsOrigins(ORIGINS))).not.toThrow();
    // Production réelle : un vrai canal pour les destinataires (console interdit hors démonstration).
    const prod = { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), STORAGE_ENCRYPTION_KEY: 'c'.repeat(64), RECIPIENT_NOTIFIER: 'whatsapp' };
    expect(() => loadConfig({ ...prod, CORS_ORIGINS: '*' })).toThrow(/CORS_ORIGINS=\*/);
    expect(() => loadConfig({ ...prod, CORS_ORIGINS: 'https://*.vercel.app' })).toThrow(/trop large/);
    expect(loadConfig({ ...prod, CORS_ORIGINS: ORIGINS }).corsOrigins).toHaveLength(3);
    // En développement, « * » reste possible.
    expect(loadConfig({ ...process.env, CORS_ORIGINS: '*' }).corsOrigins).toBe('*');
  });
});

describe('CORS de l’API', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ CORS_ORIGINS: ORIGINS, REALTIME_MODE: 'poll' });
  });
  afterAll(async () => {
    await t.app.close();
    await t.prisma.$disconnect();
  });

  const preflight = (origin: string, url = '/controller/map') =>
    t.app.inject({
      method: 'OPTIONS',
      url,
      headers: { origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' },
    });

  it('préflight mis en cache 2 h (Access-Control-Max-Age: 7200), origine du motif acceptée', async () => {
    const origin = 'https://yaar-console-git-fix-wendtoin-jairus-kabore-s-projects.vercel.app';
    const r = await preflight(origin);
    expect(r.statusCode).toBe(204);
    expect(r.headers['access-control-allow-origin']).toBe(origin);
    expect(r.headers['access-control-max-age']).toBe('7200');
    expect(String(r.headers['access-control-allow-headers'])).toContain('authorization');
  });

  it('origine hors liste : pas d’en-tête CORS', async () => {
    const r = await preflight('https://yaar-app.vercel.app');
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
    const g = await t.app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://evil.example.test' } });
    expect(g.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('les réponses d’erreur portent aussi les en-têtes CORS', async () => {
    const r = await t.app.inject({ method: 'GET', url: '/me', headers: { origin: 'https://yaar-livraison.vercel.app' } });
    expect(r.statusCode).toBe(401);
    expect(r.headers['access-control-allow-origin']).toBe('https://yaar-livraison.vercel.app');
  });
});

describe('fonction Vercel : échec de démarrage', () => {
  it('répond 500 au format JSON avec les en-têtes CORS des origines autorisées (et accepte le préflight)', async () => {
    const saved = { ...process.env };
    // Configuration invalide : mode démo en production sans DEMO_STAFF_CODE.
    Object.assign(process.env, {
      NODE_ENV: 'production',
      VERCEL: '1',
      DEMO_MODE: 'true',
      JWT_SECRET: 'x'.repeat(40),
      CORS_ORIGINS: ORIGINS,
    });
    delete process.env.DEMO_STAFF_CODE;
    const { default: handler } = await import('../src/vercel');
    const server = createServer((req, res) => void handler(req, res));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    try {
      const origin = 'https://yaar-console.vercel.app';
      const r = await fetch(`${base}/health`, { headers: { origin } });
      expect(r.status).toBe(500);
      expect(r.headers.get('access-control-allow-origin')).toBe(origin);
      expect(((await r.json()) as ApiErrorBody).error.code).toBe('INTERNAL_ERROR');
      const pre = await fetch(`${base}/me`, {
        method: 'OPTIONS',
        headers: { origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' },
      });
      expect(pre.status).toBe(204);
      expect(pre.headers.get('access-control-allow-origin')).toBe(origin);
      expect(pre.headers.get('access-control-allow-headers')).toBe('authorization');
      const other = await fetch(`${base}/health`, { headers: { origin: 'https://evil.example.test' } });
      expect(other.status).toBe(500);
      expect(other.headers.get('access-control-allow-origin')).toBeNull();
    } finally {
      server.close();
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
    }
  });
});

describe('limites d’envoi sur Vercel (corps de requête limité à 4,5 Mo par Vercel)', () => {
  let v: TestApp;
  beforeAll(async () => {
    v = await createTestApp({ VERCEL: '1', REALTIME_MODE: 'poll', STORAGE_DRIVER: 'db' });
  });
  afterAll(async () => {
    await v.app.close();
    await v.prisma.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(v.prisma);
  });

  const jpeg = (bytes: number) => {
    const b = Buffer.alloc(bytes);
    b[0] = 0xff;
    b[1] = 0xd8;
    b[2] = 0xff;
    return b.toString('base64');
  };

  it('3 Mo décodés au plus, corps limité à 4,25 Mo : 413 PAYLOAD_TOO_LARGE en JSON, message en français', async () => {
    expect(v.ctx.config).toMatchObject({ onVercel: true, maxUploadBytes: 3 * 1024 * 1024, bodyLimitBytes: 4.25 * 1024 * 1024 });
    const driver = await createDriver(v, 'MOTO', null);
    const put = (dataBase64: string) =>
      v.app.inject({
        method: 'PUT',
        url: '/driver/documents/CNIB',
        headers: { authorization: `Bearer ${driver.accessToken}`, origin: 'https://yaar-livraison.vercel.app' },
        payload: { mimeType: 'image/jpeg', dataBase64 },
      });
    const ok = await put(jpeg(Math.round(2.9 * 1024 * 1024)));
    expect(ok.statusCode).toBe(200);
    const big = await put(jpeg(Math.round(3.1 * 1024 * 1024)));
    expect(big.statusCode).toBe(413);
    expect(big.json<ApiErrorBody>().error).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
    expect(big.json<ApiErrorBody>().error.message).toMatch(/3 Mo maximum/);
    const huge = await put('A'.repeat(Math.round(4.4 * 1024 * 1024)));
    expect(huge.statusCode).toBe(413);
    expect(huge.json<ApiErrorBody>().error).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
    expect(huge.json<ApiErrorBody>().error.message).toMatch(/3 Mo maximum/);
  });

  it('hors Vercel : 5 Mo décodés', () => {
    const c = loadConfig({ ...process.env });
    expect(c).toMatchObject({ onVercel: false, maxUploadBytes: 5 * 1024 * 1024 });
    expect(c.bodyLimitBytes).toBeGreaterThan(Math.ceil((5 * 1024 * 1024 * 4) / 3));
  });
});
