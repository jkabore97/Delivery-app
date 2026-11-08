// Après `expo export --platform web` : les images venant des dépendances sont écrites dans
// dist/assets/node_modules/… Un dossier « node_modules » dans la sortie statique peut être ignoré à
// l'upload (Vercel, Netlify…) : on le renomme en « vendor » et on réécrit les URL dans le bundle.
// Usage : node scripts/web-postexport.mjs [dist]
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve(process.argv[2] ?? 'dist');
const from = path.join(outDir, 'assets', 'node_modules');
const to = path.join(outDir, 'assets', 'vendor');

if (!fs.existsSync(path.join(outDir, 'index.html'))) {
  console.error(`web-postexport : ${outDir}/index.html introuvable (lancer expo export d'abord)`);
  process.exit(1);
}

if (fs.existsSync(from)) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.renameSync(from, to);
  let rewritten = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(js|html|css|json)$/.test(entry.name)) {
        const src = fs.readFileSync(p, 'utf8');
        if (src.includes('/assets/node_modules/')) {
          fs.writeFileSync(p, src.split('/assets/node_modules/').join('/assets/vendor/'));
          rewritten++;
        }
      }
    }
  };
  walk(outDir);
  console.log(`web-postexport : assets/node_modules → assets/vendor (${rewritten} fichier(s) réécrit(s))`);
} else {
  console.log('web-postexport : rien à déplacer');
}
