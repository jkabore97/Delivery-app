import type { FastifyInstance } from 'fastify';
import type { TrackingDto } from '@yaar/shared';
import { z } from 'zod';
import type { AppContext } from '../context';
import { notFound } from '../lib/errors';
import { FixedWindowLimiter } from '../lib/rateLimit';
import { TRACKING_NOT_FOUND } from '../services/deliveries';

const trackParams = z.object({ token: z.string().max(128) });

/**
 * Suivi public du destinataire, SANS authentification : GET /track/:token (lien envoyé au destinataire).
 * Limite par adresse IP (TRACK_RATE_LIMIT requêtes par minute, en mémoire par instance), réponse jamais mise en
 * cache. Interrogé toutes les ~4 s par la page de suivi : déclenche aussi le cycle d'affectation en mode poll
 * (WORK_TRIGGER_ROUTES dans app.ts).
 */
export async function trackingRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const limiter = new FixedWindowLimiter(ctx.clock, ctx.config.trackRateLimit, 60_000);

  app.get('/track/:token', async (req, reply): Promise<TrackingDto> => {
    limiter.hit(req.ip);
    reply.header('Cache-Control', 'no-store');
    reply.header('Referrer-Policy', 'no-referrer');
    const parsed = trackParams.safeParse(req.params);
    if (!parsed.success) throw notFound(TRACKING_NOT_FOUND);
    return ctx.deliveries.tracking(parsed.data.token);
  });
}
