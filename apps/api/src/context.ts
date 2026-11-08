import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from './config';
import type { Clock } from './lib/clock';
import type { SmsProvider } from './providers/sms';
import type { StorageProvider } from './providers/storage';
import type { PaymentRegistry } from './providers/payment';
import type { Notifier, PushProvider } from './providers/push';
import type { RecipientNotifier } from './providers/recipients';
import type { RoutingProvider } from './providers/routing';
import type { RealtimeHub } from './realtime/hub';
import type { DeliveryService } from './services/deliveries';
import type { DispatchService } from './services/dispatch';
import type { OrderService } from './services/orders';
import type { RouteService } from './services/routes';
import type { BackgroundWork } from './services/work';

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
  /** Tâches de fond déclenchées à la demande (mode poll) et par le cron. */
  work: BackgroundWork;
  /** Calcul d'itinéraire (OSRM ou ligne droite). */
  routing: RoutingProvider;
  /** Itinéraires en cache des courses (carte de suivi, ETA). */
  routes: RouteService;
  /** Livraisons demandées par les entreprises (B2B) et suivi public des destinataires. */
  deliveries: DeliveryService;
  /** Messages aux destinataires (lien de suivi, code). */
  recipients: RecipientNotifier;
}
