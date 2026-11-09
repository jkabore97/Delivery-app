#!/usr/bin/env node
/**
 * Build Vercel de l'API (Root Directory = apps/api, Build Command = `npm run build:vercel`).
 *   1. prisma generate (moteur rhel-openssl-3.0.x pour les fonctions Vercel, cf. binaryTargets) ;
 *   2. bundle esbuild de src/vercel.ts → dist/vercel.mjs (inclut le source TypeScript de @yaar/shared ;
 *      les paquets npm restent externes et sont tracés par Vercel depuis node_modules) ;
 *   3. UNIQUEMENT pour un déploiement de production (VERCEL_ENV=production, ou ALLOW_PREVIEW_DB_MIGRATIONS=true) :
 *      vérification de la configuration d'exécution (scripts/check-config.ts : le build échoue plutôt que de
 *      publier une API qui ne démarre pas), puis prisma migrate deploy sur l'URL directe
 *      (DATABASE_URL_UNPOOLED de Neon, sinon DATABASE_URL). Les prévisualisations (branches, pull requests)
 *      partagent les variables de la base de production : elles ne la migrent jamais ;
 *   4. si SEED_DEMO=true et DEMO_MODE=true : données de démonstration UNIQUEMENT si la base n'a aucun
 *      utilisateur (jamais d'effacement). SEED_DEMO=true sans DEMO_MODE=true : seed ignoré (avertissement).
 *      Avec en plus DEMO_RESET_ID (texte libre) : réinitialisation explicite de la démo (`seed.ts --demo-reset`) :
 *      si l'identifiant diffère du dernier appliqué (table AppSetting), la base est VIDÉE puis la démo B2B recréée et
 *      l'identifiant enregistré ; même identifiant : rien. Refusée (avertissement, aucun effacement) sans DEMO_MODE=true.
 *      Pour réinitialiser la démo : donner une nouvelle valeur à DEMO_RESET_ID, puis redéployer.
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
  try {
    execSync(cmd, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
  } catch {
    // La commande a déjà affiché son erreur : pas de pile d'appels en plus dans le journal de build.
    console.error(`\n✖ Build interrompu : échec de « ${cmd} ».`);
    process.exit(1);
  }
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

const vercelEnv = process.env.VERCEL_ENV;
const allowPreviewDb = process.env.ALLOW_PREVIEW_DB_MIGRATIONS === 'true';

if (skipDb) {
  console.info('\n--skip-db : migrations et seed ignorés.');
} else if (vercelEnv !== 'production' && !allowPreviewDb) {
  console.warn(
    `\n⚠ VERCEL_ENV=${vercelEnv ?? '(non défini)'} : PAS de migration ni de seed. Seul un déploiement de production ` +
      'modifie la base (les prévisualisations utilisent les mêmes variables de base de données) ; ' +
      'ALLOW_PREVIEW_DB_MIGRATIONS=true pour forcer, avec une base de prévisualisation séparée.',
  );
} else {
  if (vercelEnv !== 'production') console.warn(`\n⚠ ALLOW_PREVIEW_DB_MIGRATIONS=true : migrations sur la base de VERCEL_ENV=${vercelEnv ?? '(non défini)'}.`);
  // Configuration d'exécution invalide : le build échoue (le déploiement précédent reste en ligne).
  run('npx tsx scripts/check-config.ts');
  const directUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!directUrl) throw new Error('DATABASE_URL (ou DATABASE_URL_UNPOOLED) est requis pour appliquer les migrations');
  // Migrations et seed sur la connexion directe (verrous consultatifs, pas de pooler en mode transaction).
  run('npx prisma migrate deploy', { DATABASE_URL: directUrl });
  const resetId = process.env.DEMO_RESET_ID?.trim() ?? '';
  if (process.env.SEED_DEMO !== 'true') {
    console.info('\nSEED_DEMO≠true : pas de données de démonstration.');
    if (resetId) console.warn('⚠ DEMO_RESET_ID défini mais SEED_DEMO≠true : réinitialisation de la démo ignorée (aucun effacement).');
  } else if (process.env.DEMO_MODE !== 'true') {
    console.warn(
      '\n' +
        '⚠⚠⚠ SEED_DEMO=true mais DEMO_MODE≠true : seed de démonstration IGNORÉ. ⚠⚠⚠\n' +
        '    Les comptes de démonstration (code 123456) ne doivent jamais exister hors démonstration.\n' +
        '    Retirez SEED_DEMO, ou activez DEMO_MODE=true (avec DEMO_STAFF_CODE) pour une démo publique.' +
        (resetId ? '\n    DEMO_RESET_ID ignoré : la réinitialisation (effacement de la base) est refusée sans DEMO_MODE=true.' : ''),
    );
  } else if (resetId) {
    // Réinitialisation explicite : effacement + démo B2B si DEMO_RESET_ID diffère du dernier appliqué, sinon rien.
    run('npx tsx prisma/seed.ts --demo-reset', { DATABASE_URL: directUrl });
  } else {
    // --if-empty : rien si la base contient déjà un utilisateur ; jamais d'effacement.
    run('npx tsx prisma/seed.ts --if-empty', { DATABASE_URL: directUrl });
  }
}
