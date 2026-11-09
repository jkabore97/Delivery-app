#!/usr/bin/env node
/**
 * Test de fumée du bundle Vercel : démarre `api/index.js` (→ dist/vercel.mjs) comme serveur HTTP Node,
 * dans les conditions de Vercel (VERCEL=1, NODE_ENV=production, REALTIME_MODE=poll, STORAGE_DRIVER=db,
 * DEMO_MODE=true avec un DEMO_STAFF_CODE de test), puis vérifie /health, /config, CORS (préflight mis en
 * cache, motif de prévisualisation), la connexion OTP (123456 pour les clients et livreurs, refusé pour
 * un contrôleur qui doit utiliser le code d'accès démo ; comptes de démonstration jamais bloqués par la limite de
 * 5 codes par heure), /me, /driver/offers, une livraison d'entreprise (devis, création, lien de suivi public
 * /track/:token avec CORS de PUBLIC_APP_URL, jeton trop long → même 404 JSON avec CORS, annulation), les limites
 * d'envoi (413 JSON), /cron/daily, et la réponse CORS quand l'API ne peut pas démarrer.
 * Itinéraires en ligne droite (ROUTING_PROVIDER=straight) : aucun appel au service OSRM.
 *   npm run build:bundle -w apps/api && npm run smoke:vercel -w apps/api
 * Base : SMOKE_DATABASE_URL, sinon DATABASE_URL (.env), sinon yaar_dev locale (seed de démonstration attendu).
 */
import { spawn } from 'node:child_process';
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
/** Valeur de test uniquement (jamais celle du projet Vercel). */
const STAFF_CODE = '482913';
const CONSOLE_ORIGIN = 'https://console.example.test';
/** Page publique de suivi des destinataires (hors CORS_ORIGINS : autorisée via PUBLIC_APP_URL). */
const TRACKING_ORIGIN = 'https://suivi.example.test';
const PREVIEW_PATTERN = 'https://yaar-console-*-equipe-test.vercel.app';
const env = {
  DATABASE_URL:
    process.env.SMOKE_DATABASE_URL ??
    dotenvValue('DATABASE_URL') ??
    'postgresql://postgres:postgres@localhost:5433/yaar_dev?schema=public',
  VERCEL: '1',
  NODE_ENV: 'production',
  JWT_SECRET: 'smoke-jwt-secret-0123456789abcdef0123456789',
  STORAGE_ENCRYPTION_KEY: 'b'.repeat(64),
  CORS_ORIGINS: `${CONSOLE_ORIGIN},https://mobile.example.test,${PREVIEW_PATTERN}`,
  TRUST_PROXY: 'true',
  REALTIME_MODE: 'poll',
  STORAGE_DRIVER: 'db',
  DEMO_MODE: 'true',
  DEMO_STAFF_CODE: STAFF_CODE,
  OTP_PROVIDER: 'console',
  CRON_SECRET,
  LOG_LEVEL: 'warn',
  ROUTING_PROVIDER: 'straight',
  RECIPIENT_NOTIFIER: 'console',
  PUBLIC_APP_URL: TRACKING_ORIGIN,
};
Object.assign(process.env, env);

const { default: handler } = await import(path.join(root, 'api/index.js'));
const server = createServer((req, res) => void handler(req, res));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

let failures = 0;
function check(name, ok, detail = '') {
  console.info(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures++;
}
async function req(method, url, { token, body, headers = {}, rawBody } = {}, at = base) {
  const res = await fetch(at + url, {
    method,
    headers: {
      ...(body !== undefined || rawBody !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, json, text, headers: res.headers };
}
const login = (phone, code, extra = {}) => req('POST', '/auth/otp/verify', { body: { phone, code, ...extra } });

/** L'API démarrée avec une configuration invalide répond 500 JSON, lisible par les origines autorisées. */
async function startupFailureChecks() {
  const brokenEnv = { ...process.env, ...env, DEMO_STAFF_CODE: '', PORT: '0' };
  const code = `
    import { createServer } from 'node:http';
    const { default: handler } = await import(${JSON.stringify(path.join(root, 'api/index.js'))});
    const s = createServer((q, r) => void handler(q, r));
    s.listen(0, '127.0.0.1', () => console.log('PORT=' + s.address().port));`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], { env: brokenEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const port = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('serveur de test sans réponse')), 15000);
      child.stdout.on('data', (d) => {
        const m = /PORT=(\d+)/.exec(String(d));
        if (m) {
          clearTimeout(t);
          resolve(Number(m[1]));
        }
      });
      child.on('exit', (c) => reject(new Error(`serveur de test arrêté (${c})`)));
    });
    const at = `http://127.0.0.1:${port}`;
    const broken = await req('GET', '/health', { headers: { origin: CONSOLE_ORIGIN } }, at);
    check(
      'Démarrage impossible (DEMO_STAFF_CODE manquant) → 500 JSON avec CORS',
      broken.status === 500 &&
        broken.json?.error?.code === 'INTERNAL_ERROR' &&
        broken.headers.get('access-control-allow-origin') === CONSOLE_ORIGIN,
      `${broken.status} ${broken.headers.get('access-control-allow-origin')}`,
    );
    const pre = await req(
      'OPTIONS',
      '/me',
      { headers: { origin: CONSOLE_ORIGIN, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' } },
      at,
    );
    check(
      'Démarrage impossible : préflight accepté (l’erreur reste lisible)',
      pre.status === 204 && pre.headers.get('access-control-allow-origin') === CONSOLE_ORIGIN,
      String(pre.status),
    );
    const other = await req('GET', '/health', { headers: { origin: 'https://evil.example.test' } }, at);
    check('Démarrage impossible : origine inconnue sans CORS', other.status === 500 && !other.headers.get('access-control-allow-origin'));
  } finally {
    child.kill();
  }
}

try {
  const health = await req('GET', '/health');
  check('GET /health', health.status === 200 && health.json?.status === 'ok', JSON.stringify(health.json));

  const cfg = await req('GET', '/config');
  check(
    'GET /config',
    cfg.status === 200 &&
      cfg.json?.realtime === 'poll' &&
      cfg.json?.demoMode === true &&
      cfg.json?.otpChannel === 'console' &&
      cfg.json?.trackingPollIntervalMs === 8000,
    JSON.stringify(cfg.json),
  );
  check('GET /config ne révèle pas le code d’accès démo', !cfg.text.includes(STAFF_CODE));

  const cors = await req('GET', '/health', { headers: { origin: CONSOLE_ORIGIN } });
  check('CORS origine autorisée', cors.headers.get('access-control-allow-origin') === CONSOLE_ORIGIN);
  const preflight = await req('OPTIONS', '/controller/map', {
    headers: { origin: CONSOLE_ORIGIN, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' },
  });
  check(
    'Préflight CORS mis en cache 2 h (Access-Control-Max-Age: 7200)',
    preflight.status === 204 && preflight.headers.get('access-control-max-age') === '7200',
    `${preflight.status} max-age=${preflight.headers.get('access-control-max-age')}`,
  );
  const previewOrigin = 'https://yaar-console-git-main-equipe-test.vercel.app';
  const preview = await req('GET', '/health', { headers: { origin: previewOrigin } });
  check('CORS motif de prévisualisation (un segment)', preview.headers.get('access-control-allow-origin') === previewOrigin);
  const tooDeep = await req('GET', '/health', { headers: { origin: 'https://yaar-console-a.b-equipe-test.vercel.app' } });
  check('CORS motif : un seul segment (pas de point)', !tooDeep.headers.get('access-control-allow-origin'));
  const evil = await req('GET', '/health', { headers: { origin: 'https://evil.example.test' } });
  check('CORS origine inconnue refusée', !evil.headers.get('access-control-allow-origin'));

  const phone = '+22670000002'; // contrôleur du seed
  const otpReq = await req('POST', '/auth/otp/request', { body: { phone } });
  check('POST /auth/otp/request', otpReq.status === 200 && otpReq.json?.sent === true, JSON.stringify(otpReq.json));

  const refused = await login(phone, '123456');
  check('Contrôleur avec 123456 → refusé (démo publique)', refused.status === 400 && refused.json?.error?.code === 'OTP_INVALID', JSON.stringify(refused.json?.error));
  const staff = await login(phone, STAFF_CODE);
  const token = staff.json?.accessToken;
  check('Contrôleur avec DEMO_STAFF_CODE → connecté', staff.status === 200 && !!token && staff.json?.user?.role === 'CONTROLLER', `role=${staff.json?.user?.role}`);

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

  const wrong = await login(phone, '000000');
  check('Mauvais code refusé', wrong.status === 400, wrong.json?.error?.code);

  const client = await login('+22672000001', '123456');
  check('Client avec 123456 → connecté', client.status === 200 && client.json?.user?.role === 'CLIENT');

  // Démonstration : plusieurs partenaires sur le même compte du seed, jamais bloqués par la limite de 5 codes par heure.
  const demoRequests = [];
  for (let i = 0; i < 7; i++) demoRequests.push((await req('POST', '/auth/otp/request', { body: { phone: '+22671000003' } })).status);
  check('Compte de démonstration : 7 demandes de code de suite acceptées', demoRequests.every((st) => st === 200), demoRequests.join(','));

  const driver = await login('+22673000002', '123456', { role: 'DRIVER' });
  const offers = await req('GET', '/driver/offers', { token: driver.json?.accessToken });
  check('GET /driver/offers (déclenche runDueWork)', offers.status === 200 && Array.isArray(offers.json), `${offers.json?.length} offre(s)`);

  // Vercel : 3 Mo décodés au plus ; au-delà, 413 au format JSON de l'API (lisible grâce à CORS).
  const bigFile = { mimeType: 'image/jpeg', dataBase64: Buffer.alloc(Math.round(3.1 * 1024 * 1024)).toString('base64') };
  const tooBigFile = await req('PUT', '/driver/documents/CNIB', {
    token: driver.json?.accessToken,
    body: bigFile,
    headers: { origin: CONSOLE_ORIGIN },
  });
  check(
    'Fichier > 3 Mo → 413 PAYLOAD_TOO_LARGE (JSON, CORS)',
    tooBigFile.status === 413 &&
      tooBigFile.json?.error?.code === 'PAYLOAD_TOO_LARGE' &&
      tooBigFile.headers.get('access-control-allow-origin') === CONSOLE_ORIGIN,
    tooBigFile.json?.error?.message,
  );
  const tooBigBody = await req('PUT', '/driver/documents/CNIB', {
    token: driver.json?.accessToken,
    rawBody: JSON.stringify({ mimeType: 'image/jpeg', dataBase64: 'A'.repeat(Math.round(4.4 * 1024 * 1024)) }),
  });
  check(
    'Corps > 4,25 Mo → 413 PAYLOAD_TOO_LARGE (JSON)',
    tooBigBody.status === 413 && tooBigBody.json?.error?.code === 'PAYLOAD_TOO_LARGE',
    tooBigBody.json?.error?.message,
  );

  // Livraison d'entreprise (compte vendeur du seed, boutique validée) puis suivi public du destinataire.
  const biz = await login('+22671000001', '123456');
  const bizToken = biz.json?.accessToken;
  const dropoff = { lat: 12.3395, lng: -1.517, address: "Patte d'Oie, secteur 15", landmark: 'Smoke test' };
  const quote = await req('POST', '/business/deliveries/quote', { token: bizToken, body: { dropoff } });
  check(
    'POST /business/deliveries/quote',
    quote.status === 200 && quote.json?.options?.length === 3,
    `${quote.status} ${quote.json?.options?.map((o) => `${o.vehicleType}=${o.deliveryFee}`).join(' ') ?? quote.text}`,
  );
  const created = await req('POST', '/business/deliveries', {
    token: bizToken,
    body: { dropoff, recipientName: 'Test fumée', recipientPhone: '76 00 00 01', packageDescription: 'Test', vehicleType: 'MOTO', cashToCollect: 1000 },
  });
  const trackingUrl = created.json?.trackingUrl ?? '';
  check(
    'POST /business/deliveries → SEARCHING_DRIVER, lien de suivi, code masqué',
    created.status === 201 && created.json?.status === 'SEARCHING_DRIVER' && trackingUrl.startsWith(`${TRACKING_ORIGIN}/suivi/`) && created.json?.deliveryCode === null,
    `${created.status} ${created.json?.status ?? created.text}`,
  );
  const trackToken = trackingUrl.split('/').at(-1);
  const tracked = await req('GET', `/track/${trackToken}`, { headers: { origin: TRACKING_ORIGIN } });
  check(
    'GET /track/:token sans compte (CORS de PUBLIC_APP_URL, no-store, code de livraison)',
    tracked.status === 200 &&
      /^\d{4}$/.test(tracked.json?.deliveryCode ?? '') &&
      tracked.json?.amountToPay === 1000 &&
      tracked.headers.get('access-control-allow-origin') === TRACKING_ORIGIN &&
      tracked.headers.get('cache-control') === 'no-store' &&
      !tracked.text.includes('76000001'),
    `${tracked.status} ${tracked.headers.get('access-control-allow-origin')}`,
  );
  const unknown = await req('GET', '/track/AAAAAAAAAAAAAAAAAAAAAAAA');
  check('GET /track/:token inconnu → 404 JSON', unknown.status === 404 && unknown.json?.error?.code === 'NOT_FOUND');
  const tooLong = await req('GET', `/track/${'a'.repeat(300)}`, { headers: { origin: TRACKING_ORIGIN } });
  check(
    'GET /track/:token trop long → la même 404 JSON (CORS, no-store), pas de 414',
    tooLong.status === 404 &&
      tooLong.json?.error?.message === unknown.json?.error?.message &&
      tooLong.headers.get('access-control-allow-origin') === TRACKING_ORIGIN &&
      tooLong.headers.get('cache-control') === 'no-store',
    `${tooLong.status} ${tooLong.text.slice(0, 80)}`,
  );
  if (created.json?.id) {
    const cancelled = await req('POST', `/orders/${created.json.id}/cancel`, { token: bizToken, body: { reason: 'Test de fumée' } });
    check('POST /orders/:id/cancel par l’entreprise', cancelled.status === 200 && cancelled.json?.status === 'CANCELLED');
  }

  const noSecret = await req('GET', '/cron/daily');
  check('GET /cron/daily sans secret → 401', noSecret.status === 401);
  const cron = await req('GET', '/cron/daily', { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  check('GET /cron/daily avec CRON_SECRET', cron.status === 200 && typeof cron.json?.retention?.locationPingsDeleted === 'number', JSON.stringify(cron.json?.dispatch));

  const socket = await req('GET', '/socket.io/?EIO=4&transport=polling');
  check('Pas de Socket.IO en mode poll', socket.status === 404);

  await startupFailureChecks();
} catch (err) {
  console.error(err);
  failures++;
} finally {
  server.close();
}
console.info(failures === 0 ? '\nSmoke test OK' : `\n${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
