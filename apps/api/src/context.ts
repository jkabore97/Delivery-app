import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from './config';
import type { Clock } from './lib/clock';
import type { SmsProvider } from './providers/sms';
import type { StorageProvider } from './providers/storage';
import type { PaymentRegistry } from './providers/payment';
import type { Notifier, PushProvider } from './providers/push';
import type { RealtimeHub } from './realtime/hub';
import type { DispatchService } from './services/dispatch';
import type { OrderService } from './services/orders';

/** Dépendances partagées par les routes et services (injectées, donc remplaçables en test). */
export interface AppContext {
  prisma: PrismaClient;
  config: AppConfig;
  clock: Clock;
  sms: SmsProvider;
  storage: StorageProvider;
  payments: PaymentRegistry;
  push: PushProvider;
  notifier: Notifier;
  realtime: RealtimeHub;
  dispatch: DispatchService;
  orders: OrderService;
}
