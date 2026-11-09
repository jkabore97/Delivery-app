import 'dotenv/config';
import { buildApp } from './app';
import { runRetention } from './jobs/retention';
import { DEMO_MOTION_STEP_MS } from './services/demoMotion';

const DAY_MS = 24 * 3600 * 1000;

async function main(): Promise<void> {
  const { app, ctx } = await buildApp();
  const { config } = ctx;

  // Tâche d'affectation : expiration des offres (30 s) et relance des commandes en attente.
  // Mode socket (serveur persistant, une instance) : appel périodique. Mode poll : déclenchée par les
  // requêtes (ctx.work.kick(), cf. app.ts), comme sur Vercel ; pas d'intervalle.
  let dispatchTimer: NodeJS.Timeout | undefined;
  if (config.realtimeMode === 'socket') {
    const runTick = () =>
      ctx.dispatch.tick().catch((err: unknown) => app.log.error({ err }, 'Échec du cycle d’affectation'));
    void runTick();
    dispatchTimer = setInterval(() => void runTick(), config.dispatchTickMs);
  }

  // Démonstration (DEMO_MODE=true) en mode socket : déplacement simulé des livreurs du seed en course toutes les 4 s
  // (événements `driver.location` comme une vraie position). Mode poll : dans runDueWork(), déclenché par les requêtes.
  let demoMotionTimer: NodeJS.Timeout | undefined;
  if (config.realtimeMode === 'socket' && ctx.demoMotion.enabled) {
    const runMotion = () =>
      ctx.demoMotion
        .step()
        .catch((err: unknown) => app.log.error({ err }, 'Échec de la simulation de déplacement des livreurs de démonstration'));
    demoMotionTimer = setInterval(() => void runMotion(), DEMO_MOTION_STEP_MS);
  }

  // Rétention : purge quotidienne (12 mois). Sur Vercel : GET /cron/daily (Vercel Cron).
  const retention = async () => {
    try {
      const r = await runRetention(ctx.prisma, ctx.clock);
      app.log.info(r, 'Purge de rétention effectuée');
    } catch (err) {
      app.log.error({ err }, 'Échec de la purge de rétention');
    }
  };
  void retention();
  const retentionTimer = setInterval(() => void retention(), DAY_MS);

  app.addHook('onClose', async () => {
    clearInterval(dispatchTimer);
    clearInterval(demoMotionTimer);
    clearInterval(retentionTimer);
    await ctx.prisma.$disconnect();
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      app.close().finally(() => process.exit(0));
    });
  }

  await app.listen({ port: config.port, host: config.host });
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
