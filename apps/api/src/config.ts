import { z } from 'zod';
import {
  base64Length,
  DEFAULT_CASH_LIMIT_FCFA,
  DEFAULT_DISPATCH_RADIUS_KM,
  DEFAULT_DRIVER_STALE_MINUTES,
  DEFAULT_OFFER_TIMEOUT_SECONDS,
  DEMO_OTP_CODE,
  MAX_UPLOAD_BYTES,
  VERCEL_MAX_UPLOAD_BYTES,
} from '@yaar/shared';
import { assertCorsOriginsForProduction, parseCorsOrigins, type CorsOrigins } from './lib/cors';

const boolString = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

/** Application web publique (Expo web) : page de suivi des destinataires `/suivi/<jeton>`. */
export const DEFAULT_PUBLIC_APP_URL = 'https://yaar-livraison.vercel.app';

/** Serveurs OSRM publics FOSSGIS (règles d'usage : au plus 1 requête par seconde, User-Agent identifiant l'application). */
export const FOSSGIS_ROUTING_HOST = 'routing.openstreetmap.de';

/** Limites par IP de /auth/* (requêtes par 10 min) : valeurs par défaut, et en mode démonstration (partenaires derrière une même IP). */
export const AUTH_RATE_LIMIT_DEFAULTS = { request: 20, verify: 60 } as const;
export const AUTH_RATE_LIMIT_DEMO_DEFAULTS = { request: 100, verify: 300 } as const;

/** URL http(s) absolue, sans paramètres ni fragment ; la barre oblique finale est retirée. */
function httpUrl(name: string) {
  return z
    .string()
    .trim()
    .refine((v) => {
      try {
        const u = new URL(v);
        return (u.protocol === 'https:' || u.protocol === 'http:') && !u.search && !u.hash && !u.username;
      } catch {
        return false;
      }
    }, `${name} : URL http(s) absolue attendue (sans paramètres)`)
    .transform((v) => v.replace(/\/+$/, ''));
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL est requis'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET doit faire au moins 16 caractères'),
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(7 * 24 * 3600),
  OTP_DEV_BYPASS: boolString.default(false),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  STORAGE_DIR: z.string().default('./storage'),
  /** Clé AES-256 (64 caractères hexadécimaux) pour chiffrer les fichiers stockés. Optionnelle en dev. */
  STORAGE_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'STORAGE_ENCRYPTION_KEY : 64 caractères hexadécimaux')
    .optional(),
  CASH_LIMIT: z.coerce.number().int().positive().default(DEFAULT_CASH_LIMIT_FCFA),
  DISPATCH_RADIUS_KM: z.coerce.number().positive().default(DEFAULT_DISPATCH_RADIUS_KM),
  OFFER_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(DEFAULT_OFFER_TIMEOUT_SECONDS),
  DISPATCH_TICK_MS: z.coerce.number().int().positive().default(5000),
  DRIVER_STALE_MINUTES: z.coerce.number().int().positive().default(DEFAULT_DRIVER_STALE_MINUTES),
  CORS_ORIGINS: z.string().default('*'),
  /** false (défaut) : X-Forwarded-For ignoré ; true, ou liste d'IP / CIDR des proxys de confiance. */
  TRUST_PROXY: z.string().trim().default('false'),
  /**
   * Limites par adresse IP sur /auth/* (requêtes par fenêtre de 10 min ; 0 = désactivé). Sans valeur : 20 / 60,
   * ou 100 / 300 en mode démonstration (plusieurs partenaires derrière la même IP).
   */
  AUTH_RATE_LIMIT_REQUEST: z.coerce.number().int().min(0).optional(),
  AUTH_RATE_LIMIT_VERIFY: z.coerce.number().int().min(0).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** socket : Socket.IO (serveur persistant) ; poll : pas de socket, les clients interrogent le REST (Vercel). */
  REALTIME_MODE: z.enum(['socket', 'poll']).optional(),
  /** Intervalle de rafraîchissement conseillé aux clients en mode poll (exposé dans GET /config). */
  POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(4000),
  /** Mode poll : le cycle d'affectation tourne au plus une fois par fenêtre (toutes instances confondues). */
  WORK_THROTTLE_MS: z.coerce.number().int().min(500).default(4000),
  /** Mode poll : temps maximal pendant lequel une requête attend le cycle d'affectation qu'elle déclenche. */
  WORK_BUDGET_MS: z.coerce.number().int().min(0).default(1500),
  /** local : disque (STORAGE_DIR) ; db : table StoredFile de PostgreSQL (hébergement sans disque persistant). */
  STORAGE_DRIVER: z.enum(['local', 'db']).optional(),
  /**
   * Démonstration : code OTP 123456 accepté (clients, vendeurs, livreurs et nouveaux comptes) et seed de démo
   * autorisé, même avec NODE_ENV=production.
   */
  DEMO_MODE: boolString.default(false),
  /**
   * Démonstration : code à 6 chiffres des comptes de console existants (CONTRÔLEUR / ADMIN), qui n'acceptent
   * pas 123456. Obligatoire (et différent de 123456) en production ou sur Vercel ; 123456 par défaut en dev/test.
   */
  DEMO_STAFF_CODE: z.string().regex(/^\d{6}$/, 'DEMO_STAFF_CODE : 6 chiffres').optional(),
  /** Canal d'envoi des codes OTP : console (logs) ou whatsapp (non implémenté, voir providers/whatsapp.ts). */
  OTP_PROVIDER: z.enum(['console', 'whatsapp']).default('console'),
  /** Secret des appels de tâches planifiées (Vercel Cron envoie `Authorization: Bearer <CRON_SECRET>`). */
  CRON_SECRET: z.string().min(16, 'CRON_SECRET doit faire au moins 16 caractères').optional(),
  /** Défini à 1 par Vercel sur ses builds et fonctions. */
  VERCEL: z.string().optional(),
  /**
   * Itinéraires de la carte de suivi : osrm (service OSRM, par défaut les serveurs publics FOSSGIS) ou straight
   * (ligne droite, aucun appel externe : tests, smoke test, ou pour ne transmettre aucune coordonnée à un tiers).
   */
  ROUTING_PROVIDER: z.enum(['osrm', 'straight']).default('osrm'),
  /** URL de base du service OSRM (profils routed-car / routed-bike des serveurs FOSSGIS). */
  ROUTING_OSRM_URL: httpUrl('ROUTING_OSRM_URL').default('https://routing.openstreetmap.de'),
  /** Délai maximal d'un appel au service d'itinéraire (ms) ; au-delà, ligne droite de secours. */
  ROUTING_TIMEOUT_MS: z.coerce.number().int().min(100).max(10_000).default(2500),
  /**
   * Appels au service d'itinéraire : au plus N par seconde et par instance d'API (seau à jetons ; au-delà, ligne
   * droite). 1 par défaut (règle des serveurs publics FOSSGIS) ; 0 = sans limite (OSRM auto-hébergé uniquement).
   */
  ROUTING_MAX_RPS: z.coerce.number().int().min(0).max(100).default(1),
  /** URL publique de l'application web : lien de suivi envoyé aux destinataires (`${PUBLIC_APP_URL}/suivi/<jeton>`). */
  PUBLIC_APP_URL: httpUrl('PUBLIC_APP_URL').default(DEFAULT_PUBLIC_APP_URL),
  /** Messages aux destinataires des livraisons d'entreprise : console (logs) ou whatsapp (non implémenté). */
  RECIPIENT_NOTIFIER: z.enum(['console', 'whatsapp']).default('console'),
  /** Suivi public GET /track/:token : requêtes par minute et par adresse IP (0 = pas de limite). */
  TRACK_RATE_LIMIT: z.coerce.number().int().min(0).default(120),
  /** Rafraîchissement conseillé de la page publique de suivi pendant une course (ms, exposé dans GET /config). */
  TRACKING_POLL_INTERVAL_MS: z.coerce.number().int().min(2000).max(60_000).default(8000),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  host: string;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresInSeconds: number;
  otpDevBypass: boolean;
  otpTtlSeconds: number;
  storageDir: string;
  storageEncryptionKey: string | undefined;
  cashLimit: number;
  dispatchRadiusKm: number;
  offerTimeoutSeconds: number;
  dispatchTickMs: number;
  driverStaleMinutes: number;
  corsOrigins: CorsOrigins;
  trustProxy: boolean | string[];
  authRateLimitRequest: number;
  authRateLimitVerify: number;
  logLevel: string;
  realtimeMode: 'socket' | 'poll';
  pollIntervalMs: number;
  workThrottleMs: number;
  workBudgetMs: number;
  storageDriver: 'local' | 'db';
  demoMode: boolean;
  /** Mode démo : code des comptes de console existants (jamais exposé par l'API) ; undefined hors démo. */
  demoStaffCode: string | undefined;
  otpProvider: 'console' | 'whatsapp';
  /** Taille maximale d'un fichier décodé (5 Mo ; 3 Mo sur Vercel, limite de 4,5 Mo des requêtes). */
  maxUploadBytes: number;
  /** Taille maximale d'un corps de requête JSON : un fichier de `maxUploadBytes` encodé en base64 + marge. */
  bodyLimitBytes: number;
  cronSecret: string | undefined;
  /** Exécution sur Vercel (fonctions éphémères, plusieurs instances, pas de disque persistant). */
  onVercel: boolean;
  /** Fournisseur d'itinéraires (osrm : service externe ; straight : ligne droite, aucun appel). */
  routingProvider: 'osrm' | 'straight';
  routingOsrmUrl: string;
  routingTimeoutMs: number;
  /** Appels au service d'itinéraire par seconde et par instance (0 = illimité). */
  routingMaxRps: number;
  /** URL publique de l'application (liens de suivi des destinataires), sans barre oblique finale. */
  publicAppUrl: string;
  recipientNotifier: 'console' | 'whatsapp';
  /** GET /track/:token : requêtes par minute et par IP (0 = illimité). */
  trackRateLimit: number;
  /** Rafraîchissement conseillé de la page publique de suivi pendant une course (ms). */
  trackingPollIntervalMs: number;
}

/** Marge du corps JSON autour du fichier encodé (type, date d'expiration, code de livraison…). */
const BODY_MARGIN_BYTES = 256 * 1024;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // Une variable définie mais vide (`STORAGE_ENCRYPTION_KEY=`) est traitée comme absente.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ''));
  // Sur Vercel, NODE_ENV n'a pas à être défini dans le projet (le définir à production ferait sauter
  // les devDependencies à l'installation) : production par défaut.
  if (cleaned.VERCEL === '1' && !cleaned.NODE_ENV) cleaned.NODE_ENV = 'production';
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuration invalide : ${msg}`);
  }
  const e = parsed.data;
  const isProd = e.NODE_ENV === 'production';
  const onVercel = e.VERCEL === '1';
  if (isProd && e.JWT_SECRET.startsWith('change-me')) {
    throw new Error('JWT_SECRET doit être changé en production');
  }
  if (isProd && !e.STORAGE_ENCRYPTION_KEY) {
    throw new Error('STORAGE_ENCRYPTION_KEY est obligatoire en production (pièces KYC chiffrées)');
  }
  const corsOrigins = parseCorsOrigins(e.CORS_ORIGINS);
  if (isProd) assertCorsOriginsForProduction(corsOrigins);
  if (e.DEMO_MODE && e.OTP_PROVIDER !== 'console') {
    throw new Error(
      `DEMO_MODE=true exige OTP_PROVIDER=console (actuellement ${e.OTP_PROVIDER}) : le mode démonstration ne doit pas envoyer de vrais codes`,
    );
  }
  // Démo publique : les comptes de console (accès aux pièces KYC) ne s'ouvrent pas avec le code 123456.
  if (e.DEMO_MODE && (isProd || onVercel)) {
    if (!e.DEMO_STAFF_CODE)
      throw new Error(
        'DEMO_MODE=true en production exige DEMO_STAFF_CODE (6 chiffres, différent de 123456) : code de connexion des comptes de console',
      );
    if (e.DEMO_STAFF_CODE === DEMO_OTP_CODE)
      throw new Error('DEMO_STAFF_CODE ne doit pas être 123456 (code public de la démonstration)');
  }
  // Démonstration publique : aucun message ne doit partir vers un vrai destinataire.
  if (e.DEMO_MODE && e.RECIPIENT_NOTIFIER !== 'console') {
    throw new Error(
      `DEMO_MODE=true exige RECIPIENT_NOTIFIER=console (actuellement ${e.RECIPIENT_NOTIFIER}) : le mode démonstration ne doit pas écrire à de vrais destinataires`,
    );
  }
  // Production réelle : le canal « console » n'envoie rien aux destinataires (lien et code seulement dans les logs).
  if (isProd && !e.DEMO_MODE && e.RECIPIENT_NOTIFIER === 'console') {
    throw new Error(
      'RECIPIENT_NOTIFIER=console est interdit en production hors démonstration (DEMO_MODE=true) : les destinataires ne recevraient ni le lien de suivi ni le code. Branchez un vrai canal (RECIPIENT_NOTIFIER=whatsapp, cf. src/providers/recipients.ts)',
    );
  }
  if (isProd && !e.PUBLIC_APP_URL.startsWith('https://'))
    throw new Error('PUBLIC_APP_URL doit être en https en production (lien de suivi envoyé aux destinataires)');
  // Serveurs publics FOSSGIS : 1 requête par seconde au plus (règles d'usage).
  if (e.ROUTING_PROVIDER === 'osrm' && new URL(e.ROUTING_OSRM_URL).hostname === FOSSGIS_ROUTING_HOST && (e.ROUTING_MAX_RPS === 0 || e.ROUTING_MAX_RPS > 1))
    throw new Error(
      `ROUTING_MAX_RPS=${e.ROUTING_MAX_RPS} est interdit avec les serveurs publics FOSSGIS (${FOSSGIS_ROUTING_HOST}) : 1 requête par seconde au plus. Auto-hébergez OSRM pour lever la limite`,
    );
  const realtimeMode = e.REALTIME_MODE ?? (onVercel ? 'poll' : 'socket');
  const storageDriver = e.STORAGE_DRIVER ?? (onVercel ? 'db' : 'local');
  if (onVercel && realtimeMode === 'socket')
    throw new Error('REALTIME_MODE=socket est impossible sur Vercel (pas de connexion persistante) : utilisez poll');
  if (onVercel && storageDriver === 'local')
    throw new Error('STORAGE_DRIVER=local est impossible sur Vercel (disque éphémère) : utilisez db');
  const maxUploadBytes = onVercel ? VERCEL_MAX_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    jwtExpiresInSeconds: e.JWT_EXPIRES_IN_SECONDS,
    // Le contournement OTP n'est jamais actif en production, sauf en mode démonstration (DEMO_MODE),
    // et jamais pour les comptes de console existants en mode démonstration (demoStaffCode).
    otpDevBypass: e.DEMO_MODE || (!isProd && e.OTP_DEV_BYPASS),
    otpTtlSeconds: e.OTP_TTL_SECONDS,
    storageDir: e.STORAGE_DIR,
    storageEncryptionKey: e.STORAGE_ENCRYPTION_KEY,
    cashLimit: e.CASH_LIMIT,
    dispatchRadiusKm: e.DISPATCH_RADIUS_KM,
    offerTimeoutSeconds: e.OFFER_TIMEOUT_SECONDS,
    dispatchTickMs: e.DISPATCH_TICK_MS,
    driverStaleMinutes: e.DRIVER_STALE_MINUTES,
    trustProxy:
      e.TRUST_PROXY === 'true'
        ? true
        : e.TRUST_PROXY === 'false'
          ? false
          : e.TRUST_PROXY.split(',')
              .map((x) => x.trim())
              .filter(Boolean),
    authRateLimitRequest:
      e.AUTH_RATE_LIMIT_REQUEST ?? (e.DEMO_MODE ? AUTH_RATE_LIMIT_DEMO_DEFAULTS.request : AUTH_RATE_LIMIT_DEFAULTS.request),
    authRateLimitVerify:
      e.AUTH_RATE_LIMIT_VERIFY ?? (e.DEMO_MODE ? AUTH_RATE_LIMIT_DEMO_DEFAULTS.verify : AUTH_RATE_LIMIT_DEFAULTS.verify),
    corsOrigins,
    logLevel: e.LOG_LEVEL,
    realtimeMode,
    pollIntervalMs: e.POLL_INTERVAL_MS,
    workThrottleMs: e.WORK_THROTTLE_MS,
    workBudgetMs: e.WORK_BUDGET_MS,
    storageDriver,
    demoMode: e.DEMO_MODE,
    demoStaffCode: e.DEMO_MODE ? (e.DEMO_STAFF_CODE ?? DEMO_OTP_CODE) : undefined,
    otpProvider: e.OTP_PROVIDER,
    maxUploadBytes,
    bodyLimitBytes: base64Length(maxUploadBytes) + BODY_MARGIN_BYTES,
    cronSecret: e.CRON_SECRET,
    onVercel,
    routingProvider: e.ROUTING_PROVIDER,
    routingOsrmUrl: e.ROUTING_OSRM_URL,
    routingTimeoutMs: e.ROUTING_TIMEOUT_MS,
    routingMaxRps: e.ROUTING_MAX_RPS,
    publicAppUrl: e.PUBLIC_APP_URL,
    recipientNotifier: e.RECIPIENT_NOTIFIER,
    trackRateLimit: e.TRACK_RATE_LIMIT,
    trackingPollIntervalMs: e.TRACKING_POLL_INTERVAL_MS,
  };
}
