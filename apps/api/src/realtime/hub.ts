import type { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  DriverLocationEvent,
  DriverStatusEvent,
  IncidentDto,
  OfferClosedEvent,
  OfferDto,
  OrderMessageDto,
  OrderUpdatedEvent,
  ServerToClientEvents,
} from '@yaar/shared';

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents>;

export interface OrderAudience {
  orderId: string;
  clientId: string;
  sellerId: string | null;
  driverId: string | null;
}

export const rooms = {
  order: (id: string) => `order:${id}`,
  driver: (id: string) => `driver:${id}`,
  user: (id: string) => `user:${id}`,
  controllers: 'controllers',
} as const;

/**
 * Point d'émission des événements temps réel. Sans serveur Socket.IO attaché
 * (scripts, certains tests), les émissions sont ignorées.
 */
export class RealtimeHub {
  private io: IoServer | null = null;
  /** Journal des émissions (utile aux tests). */
  readonly emitted: Array<{ event: string; rooms: string[]; payload: unknown }> = [];
  private recordEmits = false;

  attach(io: IoServer): void {
    this.io = io;
  }

  record(enabled = true): void {
    this.recordEmits = enabled;
  }

  private emit<E extends keyof ServerToClientEvents>(
    targets: string[],
    event: E,
    payload: Parameters<ServerToClientEvents[E]>[0],
  ): void {
    if (this.recordEmits) this.emitted.push({ event, rooms: targets, payload });
    if (!this.io || targets.length === 0) return;
    // `to()` sur plusieurs salles : chaque socket ne reçoit l'événement qu'une fois.
    const op = this.io.to(targets);
    (op.emit as (ev: string, p: unknown) => boolean)(event, payload);
  }

  orderUpdated(a: OrderAudience, e: OrderUpdatedEvent): void {
    const targets = [rooms.order(a.orderId), rooms.user(a.clientId), rooms.controllers];
    if (a.sellerId) targets.push(rooms.user(a.sellerId));
    if (a.driverId) targets.push(rooms.user(a.driverId));
    this.emit(targets, 'order.updated', e);
  }

  /** Aux contrôleurs toujours ; à la salle de la commande seulement si le livreur y est affecté. */
  driverLocation(e: DriverLocationEvent): void {
    const targets: string[] = [rooms.controllers];
    if (e.orderId) targets.push(rooms.order(e.orderId));
    this.emit(targets, 'driver.location', e);
  }

  driverStatus(e: DriverStatusEvent): void {
    this.emit([rooms.controllers, rooms.driver(e.driverId)], 'driver.status', e);
  }

  offerNew(driverId: string, offer: OfferDto): void {
    this.emit([rooms.driver(driverId)], 'offer.new', offer);
  }

  offerClosed(driverId: string, e: OfferClosedEvent): void {
    this.emit([rooms.driver(driverId)], 'offer.closed', e);
  }

  sos(incident: IncidentDto): void {
    this.emit([rooms.controllers], 'sos', { incident });
  }

  incidentUpdated(incident: IncidentDto): void {
    this.emit([rooms.controllers], 'incident.updated', { incident });
  }

  /** Message client ↔ livreur : aux deux participants seulement (pas au vendeur abonné à la commande). */
  orderMessage(participants: string[], m: OrderMessageDto): void {
    this.emit(participants.map(rooms.user), 'order.message', m);
  }

  /**
   * Retire toutes les sockets d'un utilisateur de la salle d'une commande (livreur réaffecté,
   * course terminée) : il ne reçoit plus ni les événements ni la position du nouveau livreur.
   */
  evictFromOrder(orderId: string, userId: string): void {
    if (this.recordEmits) this.evictions.push({ orderId, userId });
    this.io?.in(rooms.user(userId)).socketsLeave(rooms.order(orderId));
  }

  /** Déconnecte toutes les sockets d'un utilisateur (suspension). */
  disconnectUser(userId: string): void {
    this.io?.in(rooms.user(userId)).disconnectSockets(true);
  }

  /** Journal des évictions (tests). */
  readonly evictions: Array<{ orderId: string; userId: string }> = [];
}
