import 'dotenv/config';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Les tests utilisent toujours la base de test, jamais celle de développement.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/yaar_test?schema=public';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-for-vitest-only-0123456789';
process.env.OTP_DEV_BYPASS = 'true';
process.env.LOG_LEVEL = 'silent';
process.env.STORAGE_DIR = mkdtempSync(path.join(tmpdir(), 'yaar-storage-'));
process.env.STORAGE_ENCRYPTION_KEY = 'a'.repeat(64);
// Les tests enchaînent de nombreuses connexions depuis 127.0.0.1 : limites par IP désactivées
// (elles sont testées explicitement dans auth.test.ts avec une instance dédiée).
process.env.AUTH_RATE_LIMIT_REQUEST = '0';
process.env.AUTH_RATE_LIMIT_VERIFY = '0';
