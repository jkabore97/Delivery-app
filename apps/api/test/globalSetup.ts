import 'dotenv/config';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Applique les migrations Prisma sur la base de test avant l'exécution. */
export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/yaar_test?schema=public';
  const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  execSync('npx prisma migrate deploy', { cwd, env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
}
