import type { FastifyInstance } from 'fastify';
import type { TrackingDto } from '@yaar/shared';
import { z } from 'zod';
import type { AppContext } from '../context';
import { notFound } from '../lib/errors';
import { FixedWindowLimiter } from '../lib/rateLimit';
import { TRACKING_NOT_FOUND } from '../services/deliveries';

const trackParams = z.object({ token: z.string().max(128) });

/**
 * En-têtes de TOUTES les réponses du suivi public (200, 404, 429, et 404 d'un jeton trop long renvoyée par le routeur,
 * cf. `frameworkErrors` dans app.ts) : jamais mises en cache, jamais de jeton dans un en-tête Referer.
 */
export const TRACKING_HEADERS = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } as const;

/**
 * Suivi public du destinataire, SANS authentification : GET /track/:token (lien envoyé au destinataire).
 * Limite par adresse IP (TRACK_RATE_LIMIT requêtes par minute, en mémoire par instance), réponse jamais mise en
 * cache (en-têtes posés avant la limite : un 429 les porte aussi). Jeton mal formé, trop long, inconnu ou expiré :
 * la même 404. Interrogé toutes les TRACKING_POLL_INTERVAL_MS (8 s) par la page de suivi pendant une course :
 * déclenche aussi le cycle d'affectation en mode poll (WORK_TRIGGER_ROUTES dans app.ts).
 */
export async function trackingRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const limiter = new FixedWindowLimiter(ctx.clock, ctx.config.trackRateLimit, 60_000);

  app.get('/track/:token', async (req, reply): Promise<TrackingDto> => {
    for (const [name, value] of Object.entries(TRACKING_HEADERS)) reply.header(name, value);
    limiter.hit(req.ip);
    const parsed = trackParams.safeParse(req.params);
    if (!parsed.success) throw notFound(TRACKING_NOT_FOUND);
    return ctx.deliveries.tracking(parsed.data.token);
  });
}
