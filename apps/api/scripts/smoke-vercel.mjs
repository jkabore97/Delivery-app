#!/usr/bin/env node
/**
 * Test de fumée du bundle Vercel : démarre `api/index.js` (→ dist/vercel.mjs) comme serveur HTTP Node,
 * dans les conditions de Vercel (NODE_ENV=production, REALTIME_MODE=poll, STORAGE_DRIVER=db, DEMO_MODE=true),
 * puis vérifie /health, /config, une connexion OTP (code démo 123456), /me, /driver/offers et /cron/daily.
 *   npm run build:bundle -w apps/api && npm run smoke:vercel -w apps/api
 * Base : SMOKE_DATABASE_URL, sinon DATABASE_URL (.env), sinon yaar_dev locale.
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function dotenvValue(name) {
  try {
    const line = readFileSync(path.join(root, '.env'), 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim();
  } catch {
    return undefined;
  }
}
const CRON_SECRET = 'smoke-cron-secret-0123456789abcdef';
Object.assign(process.env, {
  DATABASE_URL:
    process.env.SMOKE_DATABASE_URL ??
    dotenvValue('DATABASE_URL') ??
    'postgresql://postgres:postgres@localhost:5433/yaar_dev?schema=public',
  NODE_ENV: 'production',
  JWT_SECRET: 'smoke-jwt-secret-0123456789abcdef0123456789',
  STORAGE_ENCRYPTION_KEY: 'b'.repeat(64),
  CORS_ORIGINS: 'https://console.example.test,https://mobile.example.test',
  TRUST_PROXY: 'true',
  REALTIME_MODE: 'poll',
  STORAGE_DRIVER: 'db',
  DEMO_MODE: 'true',
  OTP_PROVIDER: 'console',
  CRON_SECRET,
  LOG_LEVEL: 'warn',
});

const { default: handler } = await import(path.join(root, 'api/index.js'));
const server = createServer((req, res) => void handler(req, res));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

let failures = 0;
function check(name, ok, detail = '') {
  console.info(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures++;
}
async function req(method, url, { token, body, headers = {} } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, json, headers: res.headers };
}

try {
  const health = await req('GET', '/health');
  check('GET /health', health.status === 200 && health.json?.status === 'ok', JSON.stringify(health.json));

  const cfg = await req('GET', '/config');
  check(
    'GET /config',
    cfg.status === 200 && cfg.json?.realtime === 'poll' && cfg.json?.demoMode === true && cfg.json?.otpChannel === 'console',
    JSON.stringify(cfg.json),
  );

  const cors = await req('GET', '/health', { headers: { origin: 'https://console.example.test' } });
  check('CORS origine autorisée', cors.headers.get('access-control-allow-origin') === 'https://console.example.test');

  const phone = '+22670000002'; // contrôleur du seed (créé comme client sinon)
  const otpReq = await req('POST', '/auth/otp/request', { body: { phone } });
  check('POST /auth/otp/request', otpReq.status === 200 && otpReq.json?.sent === true, JSON.stringify(otpReq.json));

  const login = await req('POST', '/auth/otp/verify', { body: { phone, code: '123456' } });
  const token = login.json?.accessToken;
  check('POST /auth/otp/verify (code démo 123456, NODE_ENV=production)', login.status === 200 && !!token, `role=${login.json?.user?.role}`);

  const me = await req('GET', '/me', { token });
  check('GET /me', me.status === 200 && me.json?.phone === phone);

  if (process.env.SMOKE_CHECK_FILES === 'true') {
    // Base remplie par le seed de démonstration avec STORAGE_DRIVER=db et la même clé de chiffrement.
    const drivers = await req('GET', '/controller/drivers?pageSize=50', { token });
    const withDoc = drivers.json?.items?.find((d) => d.documents?.length > 0);
    const doc = withDoc?.documents?.[0];
    const file = doc
      ? await fetch(`${base}/controller/drivers/${withDoc.id ?? withDoc.userId}/documents/${doc.id}`, { headers: { authorization: `Bearer ${token}` } })
      : null;
    const bytes = file ? Buffer.from(await file.arrayBuffer()) : Buffer.alloc(0);
    check(
      'Pièce KYC lue depuis la base (STORAGE_DRIVER=db, déchiffrée)',
      file?.status === 200 && bytes.subarray(1, 4).toString() === 'PNG',
      `${file?.status} ${bytes.length} octets`,
    );
  }

  const wrong = await req('POST', '/auth/otp/verify', { body: { phone, code: '000000' } });
  check('Mauvais code refusé', wrong.status === 400, wrong.json?.error?.code);

  const driver = await req('POST', '/auth/otp/verify', { body: { phone: '+22673000002', code: '123456', role: 'DRIVER' } });
  const offers = await req('GET', '/driver/offers', { token: driver.json?.accessToken });
  check('GET /driver/offers (déclenche runDueWork)', offers.status === 200 && Array.isArray(offers.json), `${offers.json?.length} offre(s)`);

  const noSecret = await req('GET', '/cron/daily');
  check('GET /cron/daily sans secret → 401', noSecret.status === 401);
  const cron = await req('GET', '/cron/daily', { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  check('GET /cron/daily avec CRON_SECRET', cron.status === 200 && typeof cron.json?.retention?.locationPingsDeleted === 'number', JSON.stringify(cron.json?.dispatch));

  const socket = await req('GET', '/socket.io/?EIO=4&transport=polling');
  check('Pas de Socket.IO en mode poll', socket.status === 404);
} catch (err) {
  console.error(err);
  failures++;
} finally {
  server.close();
}
console.info(failures === 0 ? '\nSmoke test OK' : `\n${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
