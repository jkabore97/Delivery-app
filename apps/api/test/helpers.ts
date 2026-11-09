import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { PrismaClient, VehicleType } from '@prisma/client';
import { DEFAULT_PRICING_RULES, requiredDocuments, type AuthResponse, type LatLng } from '@yaar/shared';
import { buildApp, type BuiltApp } from '../src/app';
import { loadConfig } from '../src/config';
import { ManualClock } from '../src/lib/clock';
import { MemoryPushProvider } from '../src/providers/push';
import { MemoryRecipientNotifier, type RecipientNotifier } from '../src/providers/recipients';
import { straightRoute, type RouteResult, type RoutingProvider } from '../src/providers/routing';
import { MemorySmsProvider } from '../src/providers/sms';
import type { KeepAlive } from '../src/services/work';

export interface TestApp extends BuiltApp {
  clock: ManualClock;
  sms: MemorySmsProvider;
  push: MemoryPushProvider;
  recipients: MemoryRecipientNotifier;
  prisma: PrismaClient;
}

/**
 * Faux service d'itinéraire (aucun réseau) : enregistre les appels ; tracé en ligne droite découpé en
 * `segments` points (source `osrm` pour distinguer du repli), ou réponse personnalisée ; `gate` retarde la réponse.
 */
export class FakeRoutingProvider implements RoutingProvider {
  readonly name = 'osrm' as const;
  readonly calls: Array<{ from: LatLng; to: LatLng; vehicleType: VehicleType }> = [];
  gate: Promise<void> | null = null;
  respond: ((from: LatLng, to: LatLng, vehicleType: VehicleType) => RouteResult) | null = null;
  constructor(private readonly segments = 10) {}
  async route(from: LatLng, to: LatLng, vehicleType: VehicleType): Promise<RouteResult> {
    this.calls.push({ from, to, vehicleType });
    if (this.gate) await this.gate;
    if (this.respond) return this.respond(from, to, vehicleType);
    const base = straightRoute(from, to, vehicleType);
    const points: Array<[number, number]> = [];
    for (let i = 0; i <= this.segments; i++) {
      const f = i / this.segments;
      points.push([from.lat + (to.lat - from.lat) * f, from.lng + (to.lng - from.lng) * f]);
    }
    return { ...base, points, source: 'osrm' };
  }
}

export const T0 = new Date('2026-11-06T10:00:00.000Z');

/** Quelques points de Ouagadougou. */
export const P = {
  centre: { lat: 12.3686, lng: -1.5275 },
  patteDOie: { lat: 12.3395, lng: -1.517 },
  zogona: { lat: 12.3805, lng: -1.4975 },
  gounghin: { lat: 12.364, lng: -1.556 },
  ouaga2000: { lat: 12.3226, lng: -1.4977 },
  bobo: { lat: 11.1771, lng: -4.2979 }, // hors rayon
};

/**
 * Application de test. `env` remplace des variables d'environnement (ex. REALTIME_MODE=poll) ;
 * `opts.sms: null` garde le fournisseur OTP choisi par la configuration (OTP_PROVIDER), `opts.recipients: null`
 * celui des messages aux destinataires (RECIPIENT_NOTIFIER).
 */
export async function createTestApp(
  env: Record<string, string> = {},
  opts: {
    clock?: ManualClock;
    sms?: null;
    routing?: RoutingProvider;
    /** null : celui de la configuration (RECIPIENT_NOTIFIER) ; défaut : MemoryRecipientNotifier. */
    recipients?: RecipientNotifier | null;
    keepAlive?: KeepAlive;
    /** Journaux capturés (lignes JSON de pino, niveau LOG_LEVEL) ; sans : aucun journal. */
    logStream?: { write(line: string): void };
  } = {},
): Promise<TestApp> {
  const clock = opts.clock ?? new ManualClock(T0);
  const sms = new MemorySmsProvider();
  const push = new MemoryPushProvider();
  const recipients = new MemoryRecipientNotifier();
  const built = await buildApp({
    config: loadConfig({ ...process.env, ...env }),
    clock,
    ...(opts.sms === null ? {} : { sms }),
    push,
    routing: opts.routing,
    ...(opts.recipients === null ? {} : { recipients: opts.recipients ?? recipients }),
    keepAlive: opts.keepAlive,
    logger: opts.logStream !== undefined,
    logStream: opts.logStream,
  });
  built.ctx.realtime.record(true);
  await built.app.ready();
  return { ...built, clock, sms, push, recipients, prisma: built.ctx.prisma };
}

export async function resetDb(prisma: PrismaClient): Promise<void> {
  const tables = [
    'AppSetting', 'StoredFile', 'JobLease', 'OrderMessage', 'PushToken', 'AuditLog', 'Rating', 'Incident', 'CashLedgerEntry', 'DispatchOffer', 'OrderEvent', 'OrderItem', 'Order',
    'SavedAddress', 'Product', 'Store', 'LocationPing', 'DriverDocument', 'DriverProfile', 'OtpCode', 'PricingRule', 'User',
  ];
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} CASCADE`);
  for (const r of DEFAULT_PRICING_RULES) await prisma.pricingRule.create({ data: r });
}

let phoneCounter = 0;
export function nextPhone(): string {
  phoneCounter++;
  return `+2267${String(1_000_000 + phoneCounter).slice(-7)}`;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function call(
  app: FastifyInstance,
  method: Method,
  url: string,
  token?: string | null,
  payload?: unknown,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method,
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });
}

/** Connexion via le contournement OTP de développement (code 123456). */
export async function login(
  app: FastifyInstance,
  role: 'CLIENT' | 'SELLER' | 'DRIVER' = 'CLIENT',
  phone = nextPhone(),
  name = 'Test',
): Promise<AuthResponse> {
  const res = await call(app, 'POST', '/auth/otp/verify', null, { phone, code: '123456', role, name });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.body}`);
  return res.json<AuthResponse>();
}

/** Crée un compte de console directement en base puis se connecte. */
export async function loginStaff(t: TestApp, role: 'CONTROLLER' | 'ADMIN' = 'CONTROLLER'): Promise<AuthResponse> {
  const phone = nextPhone();
  await t.prisma.user.create({ data: { phone, role, name: role === 'ADMIN' ? 'Admin' : 'Contrôleur' } });
  return login(t.app, 'CLIENT', phone);
}

/** Livreur validé, en ligne à la position donnée. */
export async function createDriver(
  t: TestApp,
  vehicleType: VehicleType,
  pos: { lat: number; lng: number } | null,
  opts: { cashHeld?: number; status?: 'APPROVED' | 'PENDING' } = {},
): Promise<AuthResponse> {
  const auth = await login(t.app, 'DRIVER', nextPhone(), `Livreur ${vehicleType}`);
  await t.prisma.driverProfile.create({
    data: {
      userId: auth.user.id,
      vehicleType,
      plate: vehicleType === 'BIKE' ? null : '11 JJ 0001',
      status: opts.status ?? 'APPROVED',
      isOnline: pos !== null,
      lastLat: pos?.lat ?? null,
      lastLng: pos?.lng ?? null,
      lastLocationAt: pos ? t.clock.now() : null,
      cashHeld: opts.cashHeld ?? 0,
      trackingConsentAt: t.clock.now(),
      onlineSince: pos ? t.clock.now() : null,
    },
  });
  return auth;
}

export async function createStore(
  t: TestApp,
  at: { lat: number; lng: number } = P.centre,
): Promise<{ seller: AuthResponse; storeId: string; productIds: string[] }> {
  const seller = await login(t.app, 'SELLER', nextPhone(), 'Vendeur');
  const s = await call(t.app, 'POST', '/seller/stores', seller.accessToken, {
    name: 'Le Verdoyant',
    address: 'Avenue Kwame Nkrumah',
    landmark: 'Face BCEAO',
    lat: at.lat,
    lng: at.lng,
  });
  const storeId = s.json<{ id: string }>().id;
  // Validation de la boutique par la console (cf. POST /controller/stores/:id/approve).
  await t.prisma.store.update({ where: { id: storeId }, data: { approvalStatus: 'APPROVED', approvedAt: t.clock.now() } });
  await call(t.app, 'PATCH', `/seller/stores/${storeId}`, seller.accessToken, { isOpen: true });
  const productIds: string[] = [];
  for (const p of [
    { name: 'Riz gras poulet', price: 2500 },
    { name: 'Bissap 50 cl', price: 500 },
  ]) {
    const r = await call(t.app, 'POST', `/seller/stores/${storeId}/products`, seller.accessToken, p);
    productIds.push(r.json<{ id: string }>().id);
  }
  return { seller, storeId, productIds };
}

/** Entreprise (compte SELLER) avec sa boutique validée (profil d'entreprise) à la position donnée. */
export async function createBusiness(
  t: TestApp,
  at: { lat: number; lng: number } = P.centre,
  opts: { name?: string; approval?: 'APPROVED' | 'PENDING' | 'SUSPENDED' } = {},
): Promise<{ business: AuthResponse; storeId: string }> {
  const business = await login(t.app, 'SELLER', nextPhone(), 'Gérante');
  const store = await t.prisma.store.create({
    data: {
      ownerId: business.user.id,
      name: opts.name ?? 'Pharmacie du Centre',
      address: 'Avenue Kwame Nkrumah',
      landmark: 'Face BCEAO',
      lat: at.lat,
      lng: at.lng,
      phone: '+22625300000',
      isOpen: true,
      approvalStatus: opts.approval ?? 'APPROVED',
      approvedAt: opts.approval && opts.approval !== 'APPROVED' ? null : t.clock.now(),
    },
  });
  return { business, storeId: store.id };
}

export const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

export function allDocs(vehicleType: VehicleType) {
  return requiredDocuments(vehicleType);
}
