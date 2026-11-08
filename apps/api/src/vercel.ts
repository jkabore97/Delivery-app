import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp, CORS_MAX_AGE_SECONDS, type BuiltApp } from './app';
import { isOriginAllowed, parseCorsOrigins, type CorsOrigins } from './lib/cors';

/**
 * Point d'entrée des fonctions Vercel (Node, Fluid compute). Pré-compilé par esbuild dans
 * `dist/vercel.mjs` (script `vercel-build`) puis importé par `api/index.js`.
 * L'application Fastify est construite une fois par instance et réutilisée entre requêtes ;
 * aucun `listen()` : chaque requête Node est transmise au serveur HTTP interne de Fastify.
 * Variables d'environnement : celles du projet Vercel (pas de fichier .env).
 */
let built: Promise<BuiltApp> | null = null;

function getApp(): Promise<BuiltApp> {
  if (!built) {
    built = buildApp().then(async (b) => {
      await b.app.ready();
      return b;
    });
    // Échec au démarrage (configuration invalide, base injoignable) : nouvel essai à la requête suivante.
    built.catch(() => {
      built = null;
    });
  }
  return built;
}

/** CORS_ORIGINS lu directement (la configuration complète peut être justement invalide). */
function startupCorsOrigins(): CorsOrigins {
  try {
    return parseCorsOrigins(process.env.CORS_ORIGINS?.trim() || '*');
  } catch {
    return [];
  }
}

/**
 * Réponse quand l'API ne démarre pas : JSON au format d'erreur habituel, avec les en-têtes CORS pour les
 * origines autorisées (sinon le navigateur masque l'erreur à la console et à l'application web), y compris
 * la réponse au préflight OPTIONS des requêtes authentifiées.
 */
export function sendStartupFailure(req: IncomingMessage, res: ServerResponse): void {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  if (isOriginAllowed(origin, startupCorsOrigins())) {
    res.setHeader('Access-Control-Allow-Origin', origin!);
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS' && req.headers['access-control-request-method']) {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      const requested = req.headers['access-control-request-headers'];
      if (typeof requested === 'string') res.setHeader('Access-Control-Allow-Headers', requested);
      // Pas de mise en cache longue d'un préflight servi pendant une panne.
      res.setHeader('Access-Control-Max-Age', String(Math.min(60, CORS_MAX_AGE_SECONDS)));
      res.statusCode = 204;
      res.setHeader('Content-Length', '0');
      res.end();
      return;
    }
  }
  res.statusCode = 500;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Démarrage de l’API impossible' } }));
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let app: BuiltApp['app'];
  try {
    ({ app } = await getApp());
  } catch (err) {
    console.error('Démarrage de l’API impossible', err);
    sendStartupFailure(req, res);
    return;
  }
  app.server.emit('request', req, res);
}
