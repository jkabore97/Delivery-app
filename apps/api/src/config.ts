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
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // Une variable définie mais vide (`STORAGE_ENCRYPTION_KEY=`) est traitée comme absente.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ''));
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
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    jwtExpiresInSeconds: e.JWT_EXPIRES_IN_SECONDS,
    // Le contournement OTP n'est jamais actif en production.
    otpDevBypass: !isProd && e.OTP_DEV_BYPASS,
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
  };
}
