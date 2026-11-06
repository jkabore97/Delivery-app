import { OrderStatus, OrderType } from './enums';

/**
 * Machine à états des commandes.
 *
 *   FOOD   : PENDING -> ACCEPTED -> READY -> SEARCHING_DRIVER -> ASSIGNED -> PICKED_UP -> DELIVERED
 *   PARCEL : PENDING -> SEARCHING_DRIVER -> ASSIGNED -> PICKED_UP -> DELIVERED
 *   ASSIGNED -> SEARCHING_DRIVER : le livreur est retiré (réaffectation par un contrôleur).
 *   CANCELLED : possible depuis PENDING, ACCEPTED, READY, SEARCHING_DRIVER, ASSIGNED ;
 *   PICKED_UP -> CANCELLED : réservé à la console (colis perdu, livreur injoignable), avec incident.
 *   PICKED_UP -> DELIVERED : par le livreur avec le code, ou forcé par la console (audité).
 */
const COMMON: Partial<Record<OrderStatus, readonly OrderStatus[]>> = {
  SEARCHING_DRIVER: [OrderStatus.ASSIGNED, OrderStatus.CANCELLED],
  ASSIGNED: [OrderStatus.PICKED_UP, OrderStatus.SEARCHING_DRIVER, OrderStatus.CANCELLED],
  PICKED_UP: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  DELIVERED: [],
  CANCELLED: [],
};

export const ORDER_TRANSITIONS: Record<OrderType, Record<OrderStatus, readonly OrderStatus[]>> = {
  FOOD: {
    PENDING: [OrderStatus.ACCEPTED, OrderStatus.CANCELLED],
    ACCEPTED: [OrderStatus.READY, OrderStatus.CANCELLED],
    READY: [OrderStatus.SEARCHING_DRIVER, OrderStatus.CANCELLED],
    SEARCHING_DRIVER: COMMON.SEARCHING_DRIVER!,
    ASSIGNED: COMMON.ASSIGNED!,
    PICKED_UP: COMMON.PICKED_UP!,
    DELIVERED: [],
    CANCELLED: [],
  },
  PARCEL: {
    PENDING: [OrderStatus.SEARCHING_DRIVER, OrderStatus.CANCELLED],
    ACCEPTED: [],
    READY: [],
    SEARCHING_DRIVER: COMMON.SEARCHING_DRIVER!,
    ASSIGNED: COMMON.ASSIGNED!,
    PICKED_UP: COMMON.PICKED_UP!,
    DELIVERED: [],
    CANCELLED: [],
  },
};

export function nextStatuses(type: OrderType, from: OrderStatus): readonly OrderStatus[] {
  return ORDER_TRANSITIONS[type][from];
}

export function canTransition(type: OrderType, from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[type][from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly type: OrderType,
    public readonly from: OrderStatus,
    public readonly to: OrderStatus,
  ) {
    super(`Transition impossible : ${from} → ${to} (commande ${type})`);
    this.name = 'InvalidTransitionError';
  }
}

/** Lève `InvalidTransitionError` si la transition est interdite. */
export function assertTransition(type: OrderType, from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(type, from, to)) throw new InvalidTransitionError(type, from, to);
}

/** Statut initial d'une commande à sa création (avant l'éventuel passage automatique). */
export function initialStatus(type: OrderType): OrderStatus {
  return type === OrderType.PARCEL ? OrderStatus.SEARCHING_DRIVER : OrderStatus.PENDING;
}

/** Statuts depuis lesquels le client peut annuler lui-même. */
export const CLIENT_CANCELLABLE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.ACCEPTED,
  OrderStatus.READY,
  OrderStatus.SEARCHING_DRIVER,
];

/** Statuts depuis lesquels un contrôleur peut annuler (PICKED_UP : reprise par la console, avec incident). */
export const CONTROLLER_CANCELLABLE_STATUSES: readonly OrderStatus[] = [
  ...CLIENT_CANCELLABLE_STATUSES,
  OrderStatus.ASSIGNED,
  OrderStatus.PICKED_UP,
];

/** Statuts depuis lesquels un contrôleur peut forcer la livraison (code bloqué, client sans téléphone…). */
export const CONTROLLER_FORCE_DELIVER_STATUSES: readonly OrderStatus[] = [OrderStatus.PICKED_UP];

/** Commandes en cours (ni livrées ni annulées). */
export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.ACCEPTED,
  OrderStatus.READY,
  OrderStatus.SEARCHING_DRIVER,
  OrderStatus.ASSIGNED,
  OrderStatus.PICKED_UP,
];

/** Statuts pendant lesquels un livreur est affecté et suivi. */
export const DRIVER_ACTIVE_STATUSES: readonly OrderStatus[] = [OrderStatus.ASSIGNED, OrderStatus.PICKED_UP];

export function isTerminal(status: OrderStatus): boolean {
  return status === OrderStatus.DELIVERED || status === OrderStatus.CANCELLED;
}
