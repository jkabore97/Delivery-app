import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { PrismaClient, Prisma } from '@prisma/client';
import { InvalidTransitionError, type ApiErrorBody } from '@yaar/shared';
import { ZodError } from 'zod';
import { loadConfig, type AppConfig } from './config';
import type { AppContext } from './context';
import { systemClock, type Clock } from './lib/clock';
import { AppError } from './lib/errors';
import { CashPaymentProvider, MobileMoneyProvider, PaymentRegistry } from './providers/payment';
import { ConsolePushProvider, Notifier, type PushProvider } from './providers/push';
import { ConsoleSmsProvider, type SmsProvider } from './providers/sms';
import { LocalDiskStorage, type StorageProvider } from './providers/storage';
import { createSocketServer } from './realtime/gateway';
import { RealtimeHub, type IoServer } from './realtime/hub';
import { authRoutes } from './routes/auth';
import { controllerRoutes } from './routes/controller';
import { driverRoutes } from './routes/driver';
import { meRoutes } from './routes/me';
import { orderRoutes } from './routes/orders';
import { storeRoutes } from './routes/stores';
import { DispatchService } from './services/dispatch';
import { OrderService } from './services/orders';

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
  io: IoServer;
}

/** Taille max d'une requête JSON : une pièce de 5 Mo encodée en base64 + marge. */
const BODY_LIMIT = 8 * 1024 * 1024;

function errorBody(code: ApiErrorBody['error']['code'], message: string, details?: Record<string, string[]>): ApiErrorBody {
  return { error: details ? { code, message, details } : { code, message } };
}

export async function buildApp(opts: BuildOptions = {}): Promise<BuiltApp> {
  const config = opts.config ?? loadConfig();
  const prisma = opts.prisma ?? new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });
  const clock = opts.clock ?? systemClock;
  const app = Fastify({
    logger: opts.logger === false ? false : { level: config.logLevel },
    bodyLimit: BODY_LIMIT,
    // Désactivé par défaut : sinon X-Forwarded-For (IP journalisées dans l'audit) serait falsifiable.
    trustProxy: config.trustProxy,
  });

  const realtime = new RealtimeHub();
  const storage = opts.storage ?? new LocalDiskStorage(config.storageDir, config.storageEncryptionKey);
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
  const orders = new OrderService(prisma, clock, realtime, dispatch, payments, storage, notifier);
  dispatch.onAssigned = (orderId) => orders.notify(orderId);
  const sms = opts.sms ?? new ConsoleSmsProvider((m) => app.log.info(m));

  const ctx: AppContext = { prisma, config, clock, sms, storage, payments, push, notifier, realtime, dispatch, orders };

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
    origin: config.corsOrigins === '*' ? true : config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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
      return reply.status(413).send(errorBody('PAYLOAD_TOO_LARGE', 'Requête trop volumineuse'));
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

  await authRoutes(app, ctx);
  await meRoutes(app, ctx);
  await storeRoutes(app, ctx);
  await orderRoutes(app, ctx);
  await driverRoutes(app, ctx);
  await controllerRoutes(app, ctx);

  const io = createSocketServer(app.server, {
    prisma,
    jwtSecret: config.jwtSecret,
    hub: realtime,
    corsOrigins: config.corsOrigins,
  });
  app.addHook('onClose', async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });

  return { app, ctx, io };
}
