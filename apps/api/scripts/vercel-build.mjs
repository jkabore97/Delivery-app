#!/usr/bin/env node
/**
 * Build Vercel de l'API (Root Directory = apps/api, Build Command = `npm run vercel-build`).
 *   1. prisma generate (moteur rhel-openssl-3.0.x pour les fonctions Vercel, cf. binaryTargets) ;
 *   2. bundle esbuild de src/vercel.ts → dist/vercel.mjs (inclut le source TypeScript de @yaar/shared ;
 *      les paquets npm restent externes et sont tracés par Vercel depuis node_modules) ;
 *   3. prisma migrate deploy sur l'URL directe (DATABASE_URL_UNPOOLED de Neon, sinon DATABASE_URL) ;
 *   4. si SEED_DEMO=true : données de démonstration UNIQUEMENT si la base n'a aucun utilisateur
 *      (jamais d'effacement ; exige DEMO_MODE=true en production).
 * Options locales : --skip-db (étapes 1-2 seulement).
 */
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const skipDb = process.argv.includes('--skip-db');

function run(cmd, env = {}) {
  console.info(`\n$ ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
}

run('npx prisma generate');

// Paquets npm externes (résolus à l'exécution dans node_modules) ; @yaar/shared est du TypeScript
// source dans le monorepo : il est intégré au bundle.
const external = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {})].filter(
  (d) => d !== '@yaar/shared',
);
await build({
  entryPoints: [path.join(root, 'src/vercel.ts')],
  outfile: path.join(root, 'dist/vercel.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: 'linked',
  external: [...external, '.prisma/client', 'bufferutil', 'utf-8-validate'],
  logLevel: 'info',
  // Paquets CommonJS éventuellement intégrés : `require` disponible dans le module ESM.
  banner: { js: "import { createRequire as __yaarCreateRequire } from 'node:module';\nconst require = __yaarCreateRequire(import.meta.url);" },
});

// Répertoire de sortie statique vide (vercel.json → outputDirectory) : aucun fichier source servi.
mkdirSync(path.join(root, 'public'), { recursive: true });
writeFileSync(path.join(root, 'public/.gitkeep'), '');

if (skipDb) {
  console.info('\n--skip-db : migrations et seed ignorés.');
} else {
  const directUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!directUrl) throw new Error('DATABASE_URL (ou DATABASE_URL_UNPOOLED) est requis pour appliquer les migrations');
  // Migrations et seed sur la connexion directe (verrous consultatifs, pas de pooler en mode transaction).
  run('npx prisma migrate deploy', { DATABASE_URL: directUrl });
  if (process.env.SEED_DEMO === 'true') run('npx tsx prisma/seed.ts --if-empty', { DATABASE_URL: directUrl });
  else console.info('\nSEED_DEMO≠true : pas de données de démonstration.');
}
