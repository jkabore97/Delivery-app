import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp, type BuiltApp } from './app';

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

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let app: BuiltApp['app'];
  try {
    ({ app } = await getApp());
  } catch (err) {
    console.error('Démarrage de l’API impossible', err);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Démarrage de l’API impossible' } }));
    return;
  }
  app.server.emit('request', req, res);
}
