/**
 * Journaux de requêtes sans secret porteur : le jeton du lien public de suivi (`/track/<jeton>`) donne accès au code
 * de livraison et à la position du livreur ; il est masqué dans l'URL journalisée par Fastify.
 */

/** `/track/<jeton>?…` → `/track/[jeton]?…` ; toute autre URL inchangée. */
export function redactUrl(url: string): string {
  return url.replace(/^\/track\/[^?#]*/, '/track/[jeton]');
}

interface LoggedRequest {
  method: string;
  url: string;
  host?: string;
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remotePort?: number } | null;
}

/** Sérialiseur `req` des journaux Fastify : celui par défaut (fastify/lib/logger-pino.js), URL masquée. */
export function requestLogSerializer(req: LoggedRequest): {
  method: string;
  url: string;
  version?: string;
  host?: string;
  remoteAddress?: string;
  remotePort?: number;
} {
  const version = req.headers?.['accept-version'];
  return {
    method: req.method,
    url: redactUrl(req.url),
    version: typeof version === 'string' ? version : undefined,
    host: req.host,
    remoteAddress: req.ip,
    remotePort: req.socket ? req.socket.remotePort : undefined,
  };
}
