import 'dotenv/config';
import { buildApp } from './app';
import { runRetention } from './jobs/retention';

const DAY_MS = 24 * 3600 * 1000;

async function main(): Promise<void> {
  const { app, ctx } = await buildApp();
  const { config } = ctx;

  // Tâche d'affectation : expiration des offres (30 s) et relance des commandes en attente.
  const runTick = () =>
    ctx.dispatch.tick().catch((err: unknown) => app.log.error({ err }, 'Échec du cycle d’affectation'));
  void runTick();
  const dispatchTimer = setInterval(() => void runTick(), config.dispatchTickMs);

  // Rétention : purge quotidienne des positions GPS de plus de 12 mois.
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
    clearInterval(retentionTimer);
    await ctx.prisma.$disconnect();
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      app.close().finally(() => process.exit(0));
    });
  }

  await app.listen({ port: config.port, host: config.host });
  if (config.otpDevBypass) app.log.warn('OTP_DEV_BYPASS actif : le code 123456 est accepté (développement uniquement)');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
