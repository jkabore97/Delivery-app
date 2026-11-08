import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { PrismaClient, Prisma } from '@prisma/client';
import { InvalidTransitionError, type ApiErrorBody } from '@yaar/shared';
import { ZodError } from 'zod';
import { loadConfig, type AppConfig } from './config';
import type { AppContext } from './context';
import { systemClock, type Clock } from './lib/clock';
import { corsOriginOption } from './lib/cors';
import { AppError } from './lib/errors';
import { formatMegabytes } from './lib/files';
import { CashPaymentProvider, MobileMoneyProvider, PaymentRegistry } from './providers/payment';
import { ConsolePushProvider, Notifier, type PushProvider } from './providers/push';
import { ConsoleSmsProvider, type SmsProvider } from './providers/sms';
import { createStorage, type StorageProvider } from './providers/storage';
import { WhatsAppOtpProvider } from './providers/whatsapp';
import { createSocketServer } from './realtime/gateway';
import { RealtimeHub, type IoServer } from './realtime/hub';
import { authRoutes } from './routes/auth';
import { controllerRoutes } from './routes/controller';
import { driverRoutes } from './routes/driver';
import { meRoutes } from './routes/me';
import { orderRoutes } from './routes/orders';
import { storeRoutes } from './routes/stores';
import { systemRoutes } from './routes/system';
import { DispatchService } from './services/dispatch';
import { OrderService } from './services/orders';
import { BackgroundWork } from './services/work';

export interface BuildOptions {
  config?: AppConfig;
  prisma?: PrismaClient;
  clock?: Clock;
  sms?: SmsProvider;
  storage?: StorageProvider;
  push?: PushProvider;
  logger?: boolean;
}

export interface BuiltApp {
  app: FastifyInstance;
  ctx: AppContext;
  /** Serveur Socket.IO ; null en mode poll (REALTIME_MODE=poll, Vercel). */
  io: IoServer | null;
}

/** Routes qui déclenchent `runDueWork()` en mode poll (écrans qui attendent une affectation). */
export const WORK_TRIGGER_ROUTES = new Set([
  'GET /driver/offers',
  'GET /driver/profile',
  'GET /driver/current-order',
  'POST /driver/location',
  'PATCH /driver/availability',
  'POST /orders',
  'GET /orders/:id',
  'POST /orders/:id/ready',
  'GET /controller/map',
  'GET /controller/orders/pending',
  'GET /controller/dashboard',
]);

/**
 * Préflights CORS mis en cache 2 h par le navigateur (maximum de Chrome) : sans cela, chaque requête
 * authentifiée d'un écran qui interroge l'API (mode poll) coûte une requête OPTIONS de plus.
 */
export const CORS_MAX_AGE_SECONDS = 7200;

function errorBody(code: ApiErrorBody['error']['code'], message: string, details?: Record<string, string[]>): ApiErrorBody {
  return { error: details ? { code, message, details } : { code, message } };
}

export async function buildApp(opts: BuildOptions = {}): Promise<BuiltApp> {
  const config = opts.config ?? loadConfig();
  const prisma = opts.prisma ?? new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });
  const clock = opts.clock ?? systemClock;
  const app = Fastify({
    logger: opts.logger === false ? false : { level: config.logLevel },
    // Un fichier de maxUploadBytes encodé en base64 + marge (Vercel : 4,25 Mo, sous sa limite de 4,5 Mo).
    bodyLimit: config.bodyLimitBytes,
    // Désactivé par défaut : sinon X-Forwarded-For (IP journalisées dans l'audit) serait falsifiable.
    trustProxy: config.trustProxy,
  });

  const realtime = new RealtimeHub();
  const storage = opts.storage ?? createStorage(config, prisma);
  const payments = new PaymentRegistry([new CashPaymentProvider(), new MobileMoneyProvider()]);
  const push = opts.push ?? new ConsolePushProvider((m) => app.log.info(m));
  const notifier = new Notifier(prisma, push, (err) => app.log.warn({ err }, 'Échec d’envoi de notification push'));
  const dispatch = new DispatchService(
    prisma,
    clock,
    realtime,
    {
      radiusKm: config.dispatchRadiusKm,
      offerTimeoutSeconds: config.offerTimeoutSeconds,
      cashLimit: config.cashLimit,
      reofferCooldownSeconds: 300,
      staleMinutes: config.driverStaleMinutes,
    },
    notifier,
  );
  const orders = new OrderService(prisma, clock, realtime, dispatch, payments, storage, notifier, config.maxUploadBytes);
  dispatch.onAssigned = (orderId) => orders.notify(orderId);
  const sms =
    opts.sms ??
    (config.otpProvider === 'whatsapp' ? new WhatsAppOtpProvider() : new ConsoleSmsProvider((m) => app.log.info(m)));
  const work = new BackgroundWork(
    prisma,
    clock,
    dispatch,
    { throttleMs: config.workThrottleMs, budgetMs: config.workBudgetMs, leaseMs: 30_000 },
    (err) => app.log.error({ err }, 'Échec du cycle d’affectation (runDueWork)'),
  );

  const ctx: AppContext = { prisma, config, clock, sms, storage, payments, push, notifier, realtime, dispatch, orders, work };

  if (config.demoMode) {
    app.log.warn(
      '⚠⚠⚠ DEMO_MODE=true : le code OTP 123456 est accepté pour les clients, vendeurs, livreurs et nouveaux comptes (y compris en production), DEMO_STAFF_CODE pour les comptes de console, et le seed de démonstration est autorisé. Ne jamais utiliser avec de vrais utilisateurs. ⚠⚠⚠',
    );
  } else if (config.otpDevBypass) {
    app.log.warn('OTP_DEV_BYPASS actif : le code 123456 est accepté (développement uniquement)');
  }

  // JSON tolérant : un corps vide (actions POST sans paramètre) est lu comme `{}`.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    if (text.trim() === '') return done(null, {});
    try {
      done(null, JSON.parse(text) as unknown);
    } catch {
      done(new AppError(400, 'VALIDATION_ERROR', 'JSON invalide'), undefined);
    }
  });

  await app.register(cors, {
    origin: corsOriginOption(config.corsOrigins),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: CORS_MAX_AGE_SECONDS,
  });

  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send(errorBody(err.code, err.message, err.details));
    }
    if (err instanceof InvalidTransitionError) {
      return reply.status(409).send(errorBody('INVALID_TRANSITION', err.message));
    }
    if (err instanceof ZodError) {
      return reply.status(400).send(errorBody('VALIDATION_ERROR', 'Données invalides'));
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') return reply.status(404).send(errorBody('NOT_FOUND', 'Ressource introuvable'));
      if (err.code === 'P2002') return reply.status(409).send(errorBody('CONFLICT', 'Cette ressource existe déjà'));
    }
    const fe = err as FastifyError;
    if (fe.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply
        .status(413)
        .send(
          errorBody(
            'PAYLOAD_TOO_LARGE',
            `Requête trop volumineuse : envoyez un fichier de ${formatMegabytes(config.maxUploadBytes)} Mo maximum.`,
          ),
        );
    }
    if (fe.statusCode && fe.statusCode >= 400 && fe.statusCode < 500) {
      return reply.status(fe.statusCode).send(errorBody('VALIDATION_ERROR', fe.message));
    }
    req.log.error(err);
    return reply.status(500).send(errorBody('INTERNAL_ERROR', 'Erreur interne du serveur'));
  });

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send(errorBody('NOT_FOUND', `Route introuvable : ${req.method} ${req.url.split('?')[0]}`));
  });

  app.get('/health', async () => ({ status: 'ok', time: clock.now().toISOString() }));

  if (config.realtimeMode === 'poll') {
    // Pas de processus permanent : les requêtes des écrans qui attendent une affectation déclenchent
    // le cycle d'affectation (au plus une fois par WORK_THROTTLE_MS, toutes instances confondues).
    app.addHook('onRequest', async (req) => {
      const route = `${req.method} ${req.routeOptions.url ?? ''}`;
      if (WORK_TRIGGER_ROUTES.has(route)) await work.kick();
    });
  }

  await systemRoutes(app, ctx);
  await authRoutes(app, ctx);
  await meRoutes(app, ctx);
  await storeRoutes(app, ctx);
  await orderRoutes(app, ctx);
  await driverRoutes(app, ctx);
  await controllerRoutes(app, ctx);

  // Mode poll : pas de Socket.IO, les émissions du RealtimeHub sont ignorées (aucun serveur attaché).
  let io: IoServer | null = null;
  if (config.realtimeMode === 'socket') {
    const server = createSocketServer(app.server, {
      prisma,
      jwtSecret: config.jwtSecret,
      hub: realtime,
      corsOrigins: config.corsOrigins,
    });
    io = server;
    app.addHook('onClose', async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
  }

  return { app, ctx, io };
}
