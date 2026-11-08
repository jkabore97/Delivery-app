/**
 * Origines CORS autorisées (variable CORS_ORIGINS, séparées par des virgules).
 * - `*` : toutes les origines (développement uniquement, refusé en production) ;
 * - une origine exacte : `https://yaar-console.vercel.app` ;
 * - un motif simple où `*` remplace une partie d'UN SEUL segment du nom d'hôte (jamais un point) :
 *   `https://yaar-console-*-wendtoin-jairus-kabore-s-projects.vercel.app` (déploiements de prévisualisation).
 * Utilisé par @fastify/cors, Socket.IO et la réponse d'erreur de démarrage de la fonction Vercel.
 */
export type CorsOrigins = '*' | string[];

const ENTRY = /^(https?):\/\/([^/?#]+)$/i;
const HOST_LABEL = /^[a-z0-9*-]+$/i;

/** Lit CORS_ORIGINS ; lève une erreur (message en français) pour une entrée mal formée. */
export function parseCorsOrigins(raw: string): CorsOrigins {
  if (raw.trim() === '*') return '*';
  const entries = raw
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  for (const e of entries) {
    if (!e.includes('*')) continue;
    const m = ENTRY.exec(e);
    const hostAndPort = m?.[2] ?? '';
    const [host = '', port] = hostAndPort.split(':');
    if (!m || (port !== undefined && !/^\d+$/.test(port)) || !host.split('.').every((l) => l !== '' && HOST_LABEL.test(l)))
      throw new Error(
        `CORS_ORIGINS : motif « ${e} » invalide (forme attendue https://debut-*-fin.domaine.tld, « * » dans le nom d'hôte uniquement)`,
      );
  }
  return entries;
}

/** Vrai si l'entrée contient un joker `*`. */
export function isCorsPattern(entry: string): boolean {
  return entry.includes('*');
}

/** Motif → expression régulière : `*` = un ou plusieurs caractères d'un même segment (lettres, chiffres, tirets). */
export function corsPatternToRegExp(entry: string): RegExp {
  const escaped = entry
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))
    .join('[a-z0-9-]+');
  return new RegExp(`^${escaped}$`, 'i');
}

/**
 * Règles supplémentaires en production : pas de `*` seul, ni de motif dont un segment entier est `*`
 * (ex. `https://*.vercel.app` autoriserait n'importe quel projet Vercel).
 */
export function assertCorsOriginsForProduction(origins: CorsOrigins): void {
  if (origins === '*') throw new Error('CORS_ORIGINS=* est interdit en production : listez les origines autorisées');
  for (const e of origins.filter(isCorsPattern)) {
    const host = (ENTRY.exec(e)?.[2] ?? '').split(':')[0] ?? '';
    if (host.split('.').some((label) => label === '*'))
      throw new Error(
        `CORS_ORIGINS : motif « ${e} » trop large en production (un segment entier « * ») : gardez un préfixe fixe, ex. https://yaar-console-*-equipe.vercel.app`,
      );
  }
}

/** Option `origin` de @fastify/cors et de Socket.IO : `true` (toutes) ou liste de chaînes exactes / RegExp. */
export function corsOriginOption(origins: CorsOrigins): true | Array<string | RegExp> {
  if (origins === '*') return true;
  return origins.map((e) => (isCorsPattern(e) ? corsPatternToRegExp(e) : e));
}

/** L'origine de la requête est-elle autorisée ? */
export function isOriginAllowed(origin: string | undefined, origins: CorsOrigins): boolean {
  if (!origin) return false;
  if (origins === '*') return true;
  return origins.some((e) => (isCorsPattern(e) ? corsPatternToRegExp(e).test(origin) : e === origin));
}
