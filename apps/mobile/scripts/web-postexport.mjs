// Après `expo export --platform web` :
// 1. les images venant des dépendances sont écrites dans dist/assets/node_modules/… Un dossier « node_modules » dans
//    la sortie statique peut être ignoré à l'upload (Vercel, Netlify…) : on le renomme en « vendor » et on réécrit les
//    URL dans le bundle ;
// 2. page publique de suivi (/suivi/<jeton>, ouverte depuis un SMS, souvent en 3G) : la liste des blocs JS dont elle
//    a besoin (mise en page racine, écran de suivi, MapLibre) est écrite dans index.html, qui les précharge dès les
//    premiers octets au lieu de les découvrir un par un pendant l'exécution de l'application.
// Usage : node scripts/web-postexport.mjs [dist]
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve(process.argv[2] ?? 'dist');
const indexPath = path.join(outDir, 'index.html');
const from = path.join(outDir, 'assets', 'node_modules');
const to = path.join(outDir, 'assets', 'vendor');

if (!fs.existsSync(indexPath)) {
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

/* ------------------------------------------------------------------ */
/* Préchargement des polices (toutes les pages)                         */
/* ------------------------------------------------------------------ */

// Graisses chargées au démarrage : `LOADED_WEIGHTS` de src/fonts.ts (le seul module qui connaît la police). Sur le web,
// les fichiers sont les sous-ensembles WOFF2 latins de assets/fonts/ (src/fontFiles.web.ts), qui portent leur graisse
// dans leur nom (« PlusJakartaSans_800ExtraBold.latin.<hash>.woff2 ») ; les fichiers non chargés au démarrage (ex. 400)
// sont dans la sortie mais ne sont pas préchargés. Une graisse trouvée en plusieurs fichiers : le WOFF2 seul.
const FONT_PLACEHOLDER = '/*YAAR_FONT_PRELOAD*/[]';
const fontsSrc = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src', 'fonts.ts'), 'utf8');
const weightsMatch = /export const LOADED_WEIGHTS[^=]*=\s*\[([^\]]*)\]/.exec(fontsSrc);
const loadedWeights = new Set((weightsMatch?.[1] ?? '').split(',').map((w) => w.trim()).filter(Boolean));
const fontFiles = [];
const walkFonts = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFonts(p);
    else if (/\.(ttf|otf|woff2?)$/i.test(entry.name) && !/italic/i.test(entry.name)) {
      const w = /_(\d{3})[A-Za-z]*\./.exec(entry.name)?.[1];
      if (w && loadedWeights.has(w)) fontFiles.push(`/${path.relative(outDir, p).split(path.sep).join('/')}`);
    }
  }
};
if (fs.existsSync(path.join(outDir, 'assets'))) walkFonts(path.join(outDir, 'assets'));
{
  // Une graisse, un fichier : le plus léger format (woff2 > woff > otf/ttf) si un TTF est aussi dans la sortie.
  const rank = (u) => (/\.woff2$/i.test(u) ? 0 : /\.woff$/i.test(u) ? 1 : 2);
  const byWeight = new Map();
  for (const u of fontFiles) {
    const w = /_(\d{3})[A-Za-z]*\./.exec(path.basename(u))?.[1];
    const prev = byWeight.get(w);
    if (!prev || rank(u) < rank(prev)) byWeight.set(w, u);
  }
  if (byWeight.size < fontFiles.length) console.warn(`web-postexport : ${fontFiles.length - byWeight.size} police(s) en double ignorée(s) (le WOFF2 est préchargé)`);
  fontFiles.splice(0, fontFiles.length, ...byWeight.values());
}
fontFiles.sort();
{
  const html = fs.readFileSync(indexPath, 'utf8');
  if (!html.includes(FONT_PLACEHOLDER)) console.log('web-postexport : pas de liste de polices dans index.html (modèle public/index.html absent ?)');
  else {
    fs.writeFileSync(indexPath, html.replace(FONT_PLACEHOLDER, `/*YAAR_FONT_PRELOAD*/${JSON.stringify(fontFiles)}`));
    const kb = fontFiles.reduce((sum, u) => sum + fs.statSync(path.join(outDir, u)).size, 0) / 1024;
    console.log(`web-postexport : ${fontFiles.length} police(s) préchargée(s) (graisses ${[...loadedWeights].join(', ') || '?'} ; ${kb.toFixed(0)} ko)`);
    if (!fontFiles.length) console.warn('web-postexport : AUCUNE police trouvée pour LOADED_WEIGHTS (src/fonts.ts) : vérifier les noms de fichiers');
  }
}

/* ------------------------------------------------------------------ */
/* Préchargement de la page publique de suivi                          */
/* ------------------------------------------------------------------ */

const PLACEHOLDER = '/*YAAR_SUIVI_PRELOAD*/[]';
const JS_PREFIX = '/_expo/static/js/web/';

/** Objet JSON équilibré qui commence à `start` (accolade ouvrante). */
function balancedJson(src, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  return null;
}

/**
 * Blocs JS requis par une route (contexte des routes d'Expo Router dans le bloc d'entrée) : la clé « ./suivi/[token].tsx »
 * pointe vers `d[N]`, la table des dépendances du module donne son identifiant et `paths` la liste des fichiers.
 */
function routeChunks(entrySrc, routeKey) {
  const esc = routeKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`"${esc}":\\{[^{}]*?\\(d\\[(\\d+)\\],d\\.paths\\)`).exec(entrySrc);
  if (!m) return [];
  const pathsAt = entrySrc.indexOf(',"paths":{', m.index);
  if (pathsAt < 0) return [];
  const start = entrySrc.lastIndexOf('{"0":', pathsAt);
  const json = start >= 0 ? balancedJson(entrySrc, start) : null;
  if (!json) return [];
  try {
    const deps = JSON.parse(json);
    const id = deps[m[1]];
    const files = deps.paths?.[id];
    return (Array.isArray(files) ? files : files ? [files] : []).filter((u) => typeof u === 'string');
  } catch {
    return [];
  }
}

const jsDir = path.join(outDir, '_expo', 'static', 'js', 'web');
const jsFiles = fs.existsSync(jsDir) ? fs.readdirSync(jsDir).filter((f) => f.endsWith('.js')) : [];
const html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes(PLACEHOLDER)) {
  console.log('web-postexport : pas de liste de préchargement dans index.html (modèle public/index.html absent ?)');
} else {
  const entryFile = jsFiles.find((f) => f.startsWith('entry-'));
  const entrySrc = entryFile ? fs.readFileSync(path.join(jsDir, entryFile), 'utf8') : '';
  const urls = [...routeChunks(entrySrc, './_layout.tsx'), ...routeChunks(entrySrc, './suivi/[token].tsx')];
  // MapLibre : import() de lib/map/maplibre.web.ts (liste complète des blocs en découpage « granular », sinon le fichier seul).
  for (const f of jsFiles) {
    const src = fs.readFileSync(path.join(jsDir, f), 'utf8');
    const list = /\["\/_expo\/static\/js\/web\/maplibre-gl-[^\]]*\]/.exec(src);
    if (list) {
      try {
        urls.push(...JSON.parse(list[0]));
        continue;
      } catch {
        /* liste illisible : fichier seul ci-dessous */
      }
    }
  }
  const maplibre = jsFiles.find((f) => f.startsWith('maplibre-gl-'));
  if (maplibre) urls.push(`${JS_PREFIX}${maplibre}`);
  // Déjà chargés par les balises <script> de la page.
  const linked = new Set([...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]));
  const unique = [...new Set(urls)].filter((u) => u.startsWith(JS_PREFIX) && !linked.has(u) && fs.existsSync(path.join(outDir, u)));
  fs.writeFileSync(indexPath, html.replace(PLACEHOLDER, `/*YAAR_SUIVI_PRELOAD*/${JSON.stringify(unique)}`));
  const kb = unique.reduce((sum, u) => sum + fs.statSync(path.join(outDir, u)).size, 0) / 1024;
  console.log(`web-postexport : /suivi/ précharge ${unique.length} bloc(s) JS (${kb.toFixed(0)} ko non compressés)`);
}
