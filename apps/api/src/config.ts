import { z } from 'zod';
import {
  DEFAULT_CASH_LIMIT_FCFA,
  DEFAULT_DISPATCH_RADIUS_KM,
  DEFAULT_DRIVER_STALE_MINUTES,
  DEFAULT_OFFER_TIMEOUT_SECONDS,
} from '@yaar/shared';

const boolString = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

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
  /** Limites par adresse IP sur /auth/* (requêtes par fenêtre de 10 min ; 0 = désactivé). */
  AUTH_RATE_LIMIT_REQUEST: z.coerce.number().int().min(0).default(20),
  AUTH_RATE_LIMIT_VERIFY: z.coerce.number().int().min(0).default(60),
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
  /** Démonstration : code OTP 123456 accepté et seed de démo autorisé, même avec NODE_ENV=production. */
  DEMO_MODE: boolString.default(false),
  /** Canal d'envoi des codes OTP : console (logs) ou whatsapp (non implémenté, voir providers/whatsapp.ts). */
  OTP_PROVIDER: z.enum(['console', 'whatsapp']).default('console'),
  /** Secret des appels de tâches planifiées (Vercel Cron envoie `Authorization: Bearer <CRON_SECRET>`). */
  CRON_SECRET: z.string().min(16, 'CRON_SECRET doit faire au moins 16 caractères').optional(),
  /** Défini à 1 par Vercel sur ses builds et fonctions. */
  VERCEL: z.string().optional(),
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
  corsOrigins: string[] | '*';
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
  otpProvider: 'console' | 'whatsapp';
  cronSecret: string | undefined;
  /** Exécution sur Vercel (fonctions éphémères, plusieurs instances, pas de disque persistant). */
  onVercel: boolean;
}

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
  if (isProd && e.JWT_SECRET.startsWith('change-me')) {
    throw new Error('JWT_SECRET doit être changé en production');
  }
  if (isProd && !e.STORAGE_ENCRYPTION_KEY) {
    throw new Error('STORAGE_ENCRYPTION_KEY est obligatoire en production (pièces KYC chiffrées)');
  }
  if (isProd && e.CORS_ORIGINS.trim() === '*') {
    throw new Error('CORS_ORIGINS=* est interdit en production : listez les origines autorisées');
  }
  const onVercel = e.VERCEL === '1';
  const realtimeMode = e.REALTIME_MODE ?? (onVercel ? 'poll' : 'socket');
  const storageDriver = e.STORAGE_DRIVER ?? (onVercel ? 'db' : 'local');
  if (onVercel && realtimeMode === 'socket')
    throw new Error('REALTIME_MODE=socket est impossible sur Vercel (pas de connexion persistante) : utilisez poll');
  if (onVercel && storageDriver === 'local')
    throw new Error('STORAGE_DRIVER=local est impossible sur Vercel (disque éphémère) : utilisez db');
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    jwtExpiresInSeconds: e.JWT_EXPIRES_IN_SECONDS,
    // Le contournement OTP n'est jamais actif en production, sauf en mode démonstration (DEMO_MODE).
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
    authRateLimitRequest: e.AUTH_RATE_LIMIT_REQUEST,
    authRateLimitVerify: e.AUTH_RATE_LIMIT_VERIFY,
    corsOrigins:
      e.CORS_ORIGINS.trim() === '*'
        ? '*'
        : e.CORS_ORIGINS.split(',')
            .map((s) => s.trim())
            .filter(Boolean),
    logLevel: e.LOG_LEVEL,
    realtimeMode,
    pollIntervalMs: e.POLL_INTERVAL_MS,
    workThrottleMs: e.WORK_THROTTLE_MS,
    workBudgetMs: e.WORK_BUDGET_MS,
    storageDriver,
    demoMode: e.DEMO_MODE,
    otpProvider: e.OTP_PROVIDER,
    cronSecret: e.CRON_SECRET,
    onVercel,
  };
}
