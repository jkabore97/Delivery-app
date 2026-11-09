import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PRICING_RULES,
  computeDeliveryPrice,
  roadDistanceKm,
  type ApiErrorBody,
  type OfferDto,
  type OrderDto,
  type TrackingDto,
} from '@yaar/shared';
import { loadConfig } from '../src/config';
import { redactUrl } from '../src/lib/logging';
import { maskPhone } from '../src/providers/recipients';
import { call, createBusiness, createDriver, createTestApp, loginStaff, P, resetDb, T0, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
  await t.prisma.$disconnect();
});
beforeEach(async () => {
  await t.ctx.work.settled();
  await resetDb(t.prisma);
  t.clock.set(T0);
});

const near = { lat: 12.37, lng: -1.526 };
const dropoff = { ...P.patteDOie, address: "Patte d'Oie, secteur 15", landmark: 'Portail bleu' };
const body = (over: Record<string, unknown> = {}) => ({
  dropoff,
  recipientName: 'Ali Ouédraogo',
  recipientPhone: '76 12 34 56',
  packageDescription: 'Carton de livres',
  vehicleType: 'MOTO',
  ...over,
});
const fee = computeDeliveryPrice(DEFAULT_PRICING_RULES[1]!, roadDistanceKm(P.centre, dropoff)).deliveryFee;

const TRACKING_KEYS = [
  'amountToPay', 'assignedAt', 'cancelledAt', 'createdAt', 'deliveredAt', 'deliveryCode', 'driver', 'dropoff', 'etaMinutes',
  'number', 'packageDescription', 'pickedUpAt', 'pickup', 'recipientName', 'route', 'sender', 'status', 'updatedAt', 'vehicleType',
];

async function newDelivery(app: TestApp = t, over: Record<string, unknown> = {}) {
  const { business } = await createBusiness(app, P.centre, { name: 'Librairie Jeunesse d’Afrique' });
  const r = await call(app.app, 'POST', '/business/deliveries', business.accessToken, body(over));
  expect(r.statusCode).toBe(201);
  const o = r.json<OrderDto>();
  const token = o.trackingUrl!.split('/').at(-1)!;
  const code = (await app.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).deliveryCode;
  return { business, order: o, token, code };
}
const track = (token: string, app: TestApp = t, headers: Record<string, string> = {}) =>
  app.app.inject({ method: 'GET', url: `/track/${token}`, headers });

describe('suivi public du destinataire (GET /track/:token, sans compte)', () => {
  it('lien valide : forme constante, montant à payer, code ; ni numéro du destinataire ni données internes', async () => {
    const { token, code, order } = await newDelivery(t, { feePaidBy: 'RECIPIENT', cashToCollect: 15_000 });
    const r = await track(token);
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    const dto = r.json<TrackingDto>();
    expect(Object.keys(dto).sort()).toEqual(TRACKING_KEYS);
    expect(dto).toMatchObject({
      number: order.number,
      status: 'SEARCHING_DRIVER',
      vehicleType: 'MOTO',
      sender: { name: 'Librairie Jeunesse d’Afrique', phone: '+22625300000' },
      recipientName: 'Ali Ouédraogo',
      packageDescription: 'Carton de livres',
      pickup: { lat: P.centre.lat, lng: P.centre.lng, address: 'Avenue Kwame Nkrumah' },
      dropoff: { lat: dropoff.lat, lng: dropoff.lng, address: dropoff.address, landmark: 'Portail bleu' },
      amountToPay: 15_000 + fee,
      driver: null,
      route: null,
      etaMinutes: null,
      deliveryCode: code,
      assignedAt: null,
    });
    // Aucune autre donnée personnelle ni montant interne.
    expect(r.body).not.toContain('76123456');
    for (const k of ['commission', 'driverEarning', 'sellerPayout', 'clientId', 'trackingToken', 'recipientPhone', 'Gérante'])
      expect(r.body).not.toContain(k);
    // Frais payés par l'expéditeur, rien à encaisser : 0.
    const prepaid = await newDelivery(t, { recipientPhone: '76 99 99 99' });
    expect((await track(prepaid.token)).json<TrackingDto>().amountToPay).toBe(0);
  });

  it('livreur (prénom, véhicule, téléphone, position, cap), itinéraire et ETA pendant ASSIGNED / PICKED_UP seulement', async () => {
    const driver = await createDriver(t, 'MOTO', near);
    const { token, order, code } = await newDelivery();
    const offer = (await call(t.app, 'GET', '/driver/offers', driver.accessToken)).json<OfferDto[]>()[0]!;
    await call(t.app, 'POST', `/driver/offers/${offer.id}/accept`, driver.accessToken, {});
    await t.ctx.work.settled();
    await call(t.app, 'POST', '/driver/location', driver.accessToken, { ...near, heading: 135, speed: 5 });
    const assigned = (await track(token)).json<TrackingDto>();
    expect(assigned.status).toBe('ASSIGNED');
    expect(assigned.driver).toEqual({
      firstName: 'Livreur',
      vehicleType: 'MOTO',
      plate: '11 JJ 0001',
      phone: driver.user.phone,
      ratingAvg: null,
      lastLocation: { lat: near.lat, lng: near.lng, at: T0.toISOString(), heading: 135 },
    });
    expect(assigned.route).toMatchObject({ target: 'PICKUP', source: 'straight' });
    expect(assigned.etaMinutes).toBeGreaterThan(0);
    expect(assigned.assignedAt).toBe(T0.toISOString());

    await call(t.app, 'POST', `/orders/${order.id}/pickup`, driver.accessToken, {});
    await t.ctx.work.settled();
    const picked = (await track(token)).json<TrackingDto>();
    expect(picked).toMatchObject({ status: 'PICKED_UP', route: { target: 'DROPOFF' }, deliveryCode: code });
    expect(picked.driver?.phone).toBe(driver.user.phone);

    await call(t.app, 'POST', `/orders/${order.id}/deliver`, driver.accessToken, { code });
    const done = (await track(token)).json<TrackingDto>();
    expect(Object.keys(done).sort()).toEqual(TRACKING_KEYS);
    expect(done).toMatchObject({ status: 'DELIVERED', driver: null, route: null, etaMinutes: null, deliveryCode: null, deliveredAt: T0.toISOString() });
    expect((await track(token)).body).not.toContain(driver.user.phone);

    // Le lien expire 24 h après la livraison.
    t.clock.advance(24 * 3600_000);
    expect((await track(token)).statusCode).toBe(200);
    t.clock.advance(1_000);
    const expired = await track(token);
    expect(expired.statusCode).toBe(404);
    expect(expired.json<ApiErrorBody>().error).toEqual({ code: 'NOT_FOUND', message: 'Lien de suivi introuvable ou expiré' });
  });

  it('annulée : visible 24 h sans code, puis 404', async () => {
    const { token, order, business } = await newDelivery();
    await call(t.app, 'POST', `/orders/${order.id}/cancel`, business.accessToken, {});
    t.clock.advance(3600_000);
    expect((await track(token)).json<TrackingDto>()).toMatchObject({ status: 'CANCELLED', deliveryCode: null, cancelledAt: T0.toISOString() });
    t.clock.advance(23 * 3600_000 + 1);
    expect((await track(token)).statusCode).toBe(404);
  });

  it('jeton inconnu, mal formé ou d’une commande sans lien : 404 au format standard', async () => {
    await newDelivery();
    for (const bad of ['AAAAAAAAAAAAAAAAAAAAAAAA', 'x', '..%2F..%2Fadmin', 'a'.repeat(80)]) {
      const r = await track(bad);
      expect(r.statusCode, bad).toBe(404);
      expect(r.json<ApiErrorBody>().error.code).toBe('NOT_FOUND');
    }
  });
});

describe('suivi public : limites, mode poll, CORS', () => {
  it('limite par adresse IP (TRACK_RATE_LIMIT par minute)', async () => {
    const limited = await createTestApp({ TRACK_RATE_LIMIT: '3' });
    try {
      const { token } = await newDelivery(limited);
      const from = (ip: string) => limited.app.inject({ method: 'GET', url: `/track/${token}`, remoteAddress: ip });
      for (let i = 0; i < 3; i++) expect((await from('10.0.0.1')).statusCode).toBe(200);
      const over = await from('10.0.0.1');
      expect(over.statusCode).toBe(429);
      expect(over.json<ApiErrorBody>().error.code).toBe('RATE_LIMITED');
      expect((await from('10.0.0.2')).statusCode).toBe(200);
      limited.clock.advance(60_000);
      expect((await from('10.0.0.1')).statusCode).toBe(200);
    } finally {
      await limited.app.close();
      await limited.prisma.$disconnect();
    }
  });

  it('mode poll : la page de suivi déclenche le cycle d’affectation (offre expirée → livreur suivant)', async () => {
    const poll = await createTestApp({ REALTIME_MODE: 'poll', WORK_THROTTLE_MS: '4000', WORK_BUDGET_MS: '10000' });
    try {
      await resetDb(poll.prisma);
      const d1 = await createDriver(poll, 'MOTO', near);
      const d2 = await createDriver(poll, 'MOTO', { lat: 12.3726, lng: -1.5275 });
      const { token, order } = await newDelivery(poll);
      const offersOf = async (tok: string) => (await call(poll.app, 'GET', '/driver/offers', tok)).json<OfferDto[]>();
      expect((await offersOf(d1.accessToken))[0]?.orderId).toBe(order.id);
      poll.clock.advance(31_000);
      expect((await track(token, poll)).statusCode).toBe(200);
      expect(await poll.prisma.dispatchOffer.count({ where: { orderId: order.id, driverId: d1.user.id, status: 'EXPIRED' } })).toBe(1);
      expect(await poll.prisma.dispatchOffer.count({ where: { orderId: order.id, driverId: d2.user.id, status: 'OFFERED' } })).toBe(1);
    } finally {
      await poll.app.close();
      await poll.prisma.$disconnect();
    }
  });

  it('PUBLIC_APP_URL : lien de suivi et origine CORS autorisée (page publique), autres origines refusées', async () => {
    const app = await createTestApp({ CORS_ORIGINS: 'https://console.yaar.test', PUBLIC_APP_URL: 'https://suivi.yaar.test/app/' });
    try {
      const { token, order } = await newDelivery(app);
      expect(order.trackingUrl).toBe(`https://suivi.yaar.test/app/suivi/${token}`);
      const ok = await track(token, app, { origin: 'https://suivi.yaar.test' });
      expect(ok.headers['access-control-allow-origin']).toBe('https://suivi.yaar.test');
      const console = await track(token, app, { origin: 'https://console.yaar.test' });
      expect(console.headers['access-control-allow-origin']).toBe('https://console.yaar.test');
      const evil = await track(token, app, { origin: 'https://evil.example.test' });
      expect(evil.statusCode).toBe(200);
      expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await app.app.close();
      await app.prisma.$disconnect();
    }
  });

  it('configuration : PUBLIC_APP_URL valide (https en production), pas de vrais messages en démo, limite ≥ 0', () => {
    const prod = { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), STORAGE_ENCRYPTION_KEY: 'c'.repeat(64), CORS_ORIGINS: 'https://c.yaar.test', RECIPIENT_NOTIFIER: 'whatsapp' };
    expect(loadConfig({ ...process.env }).publicAppUrl).toBe('https://yaar-livraison.vercel.app');
    expect(() => loadConfig({ ...process.env, PUBLIC_APP_URL: 'pas une url' })).toThrow(/PUBLIC_APP_URL/);
    expect(() => loadConfig({ ...process.env, PUBLIC_APP_URL: 'https://app.test/?x=1' })).toThrow(/PUBLIC_APP_URL/);
    expect(loadConfig({ ...process.env, PUBLIC_APP_URL: 'http://localhost:8081' }).publicAppUrl).toBe('http://localhost:8081');
    expect(() => loadConfig({ ...prod, PUBLIC_APP_URL: 'http://app.yaar.test' })).toThrow(/https en production/);
    expect(() => loadConfig({ ...process.env, DEMO_MODE: 'true', RECIPIENT_NOTIFIER: 'whatsapp' })).toThrow(/RECIPIENT_NOTIFIER=console/);
    expect(() => loadConfig({ ...process.env, RECIPIENT_NOTIFIER: 'sms' })).toThrow(/RECIPIENT_NOTIFIER/);
    expect(() => loadConfig({ ...process.env, TRACK_RATE_LIMIT: '-1' })).toThrow(/TRACK_RATE_LIMIT/);
    expect(loadConfig({ ...process.env, TRACK_RATE_LIMIT: '0' }).trackRateLimit).toBe(0);
  });
});

describe('suivi public : en-têtes, jetons trop longs ou mal formés, expiration absolue', () => {
  it('429 : mêmes en-têtes no-store et no-referrer que les autres réponses (posés avant la limite)', async () => {
    const limited = await createTestApp({ TRACK_RATE_LIMIT: '1' });
    try {
      const { token } = await newDelivery(limited);
      const from = () => limited.app.inject({ method: 'GET', url: `/track/${token}`, remoteAddress: '10.0.0.9' });
      const ok = await from();
      const over = await from();
      expect([ok.statusCode, over.statusCode]).toEqual([200, 429]);
      for (const r of [ok, over]) {
        expect(r.headers['cache-control']).toBe('no-store');
        expect(r.headers['referrer-policy']).toBe('no-referrer');
      }
    } finally {
      await limited.app.close();
      await limited.prisma.$disconnect();
    }
  });

  it('jeton trop long (limite du routeur, 100 caractères) ou encodage invalide : la même 404 JSON qu’un jeton inconnu, avec CORS', async () => {
    const app = await createTestApp({ CORS_ORIGINS: 'https://console.yaar.test', PUBLIC_APP_URL: 'https://suivi.yaar.test' });
    try {
      const origin = { origin: 'https://suivi.yaar.test' };
      const unknown = await track('A'.repeat(24), app, origin);
      expect(unknown.statusCode).toBe(404);
      for (const bad of ['a'.repeat(101), 'a'.repeat(129), 'b'.repeat(5000), '%E0%A4%A', 'abc%ZZ', `${'a'.repeat(30)}%2F..`]) {
        const r = await track(bad, app, origin);
        expect(r.statusCode, bad.slice(0, 12)).toBe(404);
        expect(r.json(), bad.slice(0, 12)).toEqual(unknown.json());
        expect(r.headers).toMatchObject({
          'access-control-allow-origin': 'https://suivi.yaar.test',
          'cache-control': 'no-store',
          'referrer-policy': 'no-referrer',
          'content-type': expect.stringMatching(/^application\/json/),
        });
      }
      expect((await track('a'.repeat(200), app, { origin: 'https://evil.example.test' })).headers['access-control-allow-origin']).toBeUndefined();
      // Les autres routes à paramètre : identifiant trop long → 404 JSON (et non 414), encodage invalide → 400 JSON.
      const staff = await loginStaff(app);
      const longId = await call(app.app, 'GET', `/orders/${'c'.repeat(150)}`, staff.accessToken);
      expect([longId.statusCode, longId.json<ApiErrorBody>().error.code]).toEqual([404, 'NOT_FOUND']);
      const badUrl = await call(app.app, 'GET', '/orders/%E0%A4%A', staff.accessToken);
      expect([badUrl.statusCode, badUrl.json<ApiErrorBody>().error.code]).toEqual([400, 'VALIDATION_ERROR']);
    } finally {
      await app.app.close();
      await app.prisma.$disconnect();
    }
  });

  it('livraison jamais terminée : lien expiré 7 jours après la création ; une livraison terminée n’ajoute pas 24 h au-delà', async () => {
    const searching = await newDelivery();
    const driver = await createDriver(t, 'MOTO', near);
    const late = await newDelivery(t, { recipientPhone: '76 98 76 54' });
    const offer = (await call(t.app, 'GET', '/driver/offers', driver.accessToken)).json<OfferDto[]>()[0]!;
    expect(offer.orderId).toBe(late.order.id);
    await call(t.app, 'POST', `/driver/offers/${offer.id}/accept`, driver.accessToken, {});
    await call(t.app, 'POST', `/orders/${late.order.id}/pickup`, driver.accessToken, {});
    t.clock.advance(7 * 24 * 3600_000 - 60_000);
    await call(t.app, 'POST', `/orders/${late.order.id}/deliver`, driver.accessToken, { code: late.code });
    t.clock.advance(60_000);
    expect((await track(searching.token)).statusCode).toBe(200);
    expect((await track(late.token)).json<TrackingDto>().status).toBe('DELIVERED');
    t.clock.advance(1_000);
    for (const tok of [searching.token, late.token]) {
      const r = await track(tok);
      expect(r.statusCode).toBe(404);
      expect(r.json<ApiErrorBody>().error.message).toBe('Lien de suivi introuvable ou expiré');
    }
  });

  it('GET /config : rythme conseillé de la page de suivi (TRACKING_POLL_INTERVAL_MS, 8 s par défaut)', async () => {
    expect((await call(t.app, 'GET', '/config')).json<{ trackingPollIntervalMs: number }>().trackingPollIntervalMs).toBe(8000);
    expect(loadConfig({ ...process.env, TRACKING_POLL_INTERVAL_MS: '10000' }).trackingPollIntervalMs).toBe(10_000);
    expect(() => loadConfig({ ...process.env, TRACKING_POLL_INTERVAL_MS: '500' })).toThrow(/TRACKING_POLL_INTERVAL_MS/);
  });
});

describe('journaux sans données des destinataires', () => {
  it('jeton masqué dans les URL journalisées ; numéro masqué', () => {
    expect(redactUrl('/track/AbCdEfGhIjKlMnOpQrStUvWx')).toBe('/track/[jeton]');
    expect(redactUrl('/track/abc?x=1')).toBe('/track/[jeton]?x=1');
    expect(redactUrl('/orders/123')).toBe('/orders/123');
    expect(maskPhone('+22676123456')).toBe('+226******56');
    expect(maskPhone('+22625360000')).toBe('+226******00');
    expect(maskPhone('123')).toBe('***');
  });

  it('hors DEMO_MODE : requêtes /track/[jeton], message au destinataire sans lien ni code et numéro masqué ; en démo : complet', async () => {
    const lines: string[] = [];
    const app = await createTestApp({ LOG_LEVEL: 'info' }, { recipients: null, logStream: { write: (l) => void lines.push(l) } });
    try {
      const { token, code } = await newDelivery(app, { recipientPhone: '76 12 34 56' });
      await app.ctx.work.settled();
      expect((await track(token, app)).statusCode).toBe(200);
      const logs = lines.join('');
      expect(logs).toContain('"url":"/track/[jeton]"');
      expect(logs).not.toContain(token);
      expect(logs).toContain('[DESTINATAIRE -> +226******56]');
      expect(logs).toContain('[lien de suivi et code de livraison masqués]');
      expect(logs).not.toContain('76123456');
      expect(logs).not.toContain('/suivi/');
      expect(logs).not.toContain(`réception : ${code}`);
    } finally {
      await app.app.close();
      await app.prisma.$disconnect();
    }
    const demoLines: string[] = [];
    const demo = await createTestApp({ LOG_LEVEL: 'info', DEMO_MODE: 'true' }, { recipients: null, logStream: { write: (l) => void demoLines.push(l) } });
    try {
      const { code } = await newDelivery(demo, { recipientPhone: '76 12 34 57' });
      await demo.ctx.work.settled();
      const logs = demoLines.join('');
      expect(logs).toContain('[DESTINATAIRE -> +22676123457]');
      expect(logs).toContain(`réception : ${code}`);
    } finally {
      await demo.app.close();
      await demo.prisma.$disconnect();
    }
  });

  it('RECIPIENT_NOTIFIER=console refusé en production hors démonstration (vérifié aussi par scripts/check-config.ts)', () => {
    const prod = { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), STORAGE_ENCRYPTION_KEY: 'c'.repeat(64), CORS_ORIGINS: 'https://c.yaar.test' };
    expect(() => loadConfig({ ...prod, RECIPIENT_NOTIFIER: 'console' })).toThrow(/RECIPIENT_NOTIFIER=console est interdit en production/);
    const noNotifier: Record<string, string | undefined> = { ...prod };
    delete noNotifier.RECIPIENT_NOTIFIER; // défaut : console
    expect(() => loadConfig(noNotifier)).toThrow(/RECIPIENT_NOTIFIER=console/);
    expect(loadConfig({ ...prod, RECIPIENT_NOTIFIER: 'whatsapp' }).recipientNotifier).toBe('whatsapp');
    expect(loadConfig({ ...prod, DEMO_MODE: 'true', DEMO_STAFF_CODE: '482913', RECIPIENT_NOTIFIER: 'console' }).recipientNotifier).toBe('console');
    expect(loadConfig({ ...process.env, RECIPIENT_NOTIFIER: 'console' }).recipientNotifier).toBe('console'); // développement
  });
});
