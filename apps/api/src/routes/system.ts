import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { CronDailyResultDto, PublicConfigDto } from '@yaar/shared';
import type { AppContext } from '../context';
import { runRetention } from '../jobs/retention';
import { AppError } from '../lib/errors';
import { iso } from '../lib/time';

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Routes techniques : configuration publique des applications et tâches planifiées. */
export async function systemRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { config, clock, prisma } = ctx;

  /** Public : les applications le lisent au démarrage (mode temps réel, démo, canal OTP). */
  app.get('/config', async (): Promise<PublicConfigDto> => ({
    realtime: config.realtimeMode,
    pollIntervalMs: config.pollIntervalMs,
    demoMode: config.demoMode,
    otpChannel: ctx.sms.channel ?? 'console',
  }));

  /**
   * Tâche quotidienne (Vercel Cron, plan Hobby : une fois par jour) : purge de rétention 12 mois
   * puis un cycle d'affectation. Protégée par CRON_SECRET (`Authorization: Bearer <CRON_SECRET>`).
   */
  app.get('/cron/daily', async (req): Promise<CronDailyResultDto> => {
    const secret = config.cronSecret;
    const header = req.headers.authorization ?? '';
    const given = header.replace(/^Bearer\s+/i, '');
    if (!secret || !header.match(/^Bearer\s+/i) || !sameSecret(given, secret))
      throw new AppError(401, 'UNAUTHENTICATED', 'Secret de tâche planifiée invalide');
    const r = await runRetention(prisma, clock);
    req.log.info(r, 'Purge de rétention effectuée');
    const work = await ctx.work.runDueWork();
    return {
      retention: { ...r, cutoff: iso(r.cutoff) },
      dispatch: work.ran ? { ran: true, ...work.tick } : { ran: false, expired: 0, offered: 0, staleOffline: 0 },
      ranAt: iso(clock.now()),
    };
  });
}
