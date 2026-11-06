import { AVERAGE_SPEED_KMH, OrderStatus, roadDistanceKm, type LatLng, type OrderDto, type OrderType } from '@yaar/shared';

export interface ProgressStep {
  key: string;
  label: string;
  done: boolean;
  current: boolean;
}

const RANK: Record<OrderStatus, number> = {
  PENDING: 0,
  ACCEPTED: 1,
  READY: 2,
  SEARCHING_DRIVER: 2,
  ASSIGNED: 3,
  PICKED_UP: 4,
  DELIVERED: 5,
  CANCELLED: -1,
};

/**
 * Étapes affichées au client (maquette « Votre livreur arrive ») :
 * FOOD : Commande acceptée · Préparée · En route · Livrée
 * PARCEL : Livreur trouvé · Colis récupéré · Livré
 */
export function progressSteps(type: OrderType, status: OrderStatus): ProgressStep[] {
  const rank = RANK[status];
  const defs: { key: string; label: string; reachedAt: number }[] =
    type === 'FOOD'
      ? [
          { key: 'accepted', label: 'Commande acceptée', reachedAt: 1 },
          { key: 'ready', label: 'Préparée', reachedAt: 2 },
          { key: 'onTheWay', label: 'En route', reachedAt: 4 },
          { key: 'delivered', label: 'Livrée', reachedAt: 5 },
        ]
      : [
          { key: 'assigned', label: 'Livreur trouvé', reachedAt: 3 },
          { key: 'pickedUp', label: 'Colis récupéré', reachedAt: 4 },
          { key: 'delivered', label: 'Livré', reachedAt: 5 },
        ];
  const firstPending = defs.findIndex((d) => rank < d.reachedAt);
  return defs.map((d, i) => ({
    key: d.key,
    label: d.label,
    done: rank >= d.reachedAt,
    current: i === firstPending && rank >= 0,
  }));
}

/** Titre principal de l'écran de suivi. */
export function trackingTitle(status: OrderStatus): string {
  switch (status) {
    case OrderStatus.PENDING:
      return 'En attente du vendeur';
    case OrderStatus.ACCEPTED:
      return 'Votre commande est en préparation';
    case OrderStatus.READY:
    case OrderStatus.SEARCHING_DRIVER:
      return 'Recherche d’un livreur';
    case OrderStatus.ASSIGNED:
      return 'Votre livreur arrive';
    case OrderStatus.PICKED_UP:
      return 'Votre livreur est en route';
    case OrderStatus.DELIVERED:
      return 'Commande livrée';
    case OrderStatus.CANCELLED:
      return 'Commande annulée';
  }
}

/** Le suivi du livreur (position, téléphone) n'a de sens que pendant ASSIGNED / PICKED_UP. */
export function isDriverTracked(status: OrderStatus): boolean {
  return status === OrderStatus.ASSIGNED || status === OrderStatus.PICKED_UP;
}

/** Statut affiché en pastille côté vendeur (maquette « Commandes du jour »). */
export function sellerBadge(status: OrderStatus): { label: string; tone: 'orange' | 'blue' | 'green' | 'grey' | 'red' } {
  switch (status) {
    case OrderStatus.PENDING:
      return { label: 'NOUVELLE', tone: 'orange' };
    case OrderStatus.ACCEPTED:
      return { label: 'EN PRÉPARATION', tone: 'blue' };
    case OrderStatus.READY:
    case OrderStatus.SEARCHING_DRIVER:
      return { label: 'ATTENTE LIVREUR', tone: 'orange' };
    case OrderStatus.ASSIGNED:
      return { label: 'LIVREUR EN ROUTE', tone: 'blue' };
    case OrderStatus.PICKED_UP:
      return { label: 'EN LIVRAISON', tone: 'green' };
    case OrderStatus.DELIVERED:
      return { label: 'LIVRÉE', tone: 'grey' };
    case OrderStatus.CANCELLED:
      return { label: 'ANNULÉE', tone: 'red' };
  }
}

/**
 * Temps d'arrivée estimé (minutes) affiché au client (pastille « 8 min » de la maquette).
 * Avec une position live du livreur : distance routière estimée (haversine × 1,3) à vitesse moyenne du véhicule
 * (ASSIGNED : livreur → retrait → livraison ; PICKED_UP : livreur → livraison). Sinon, estimation de l'API.
 * Renvoie null hors suivi (statut autre que ASSIGNED / PICKED_UP) ou sans donnée exploitable.
 */
export function estimateEtaMinutes(
  order: Pick<OrderDto, 'status' | 'vehicleType' | 'pickup' | 'dropoff' | 'etaMinutes'>,
  driver: LatLng | null,
): number | null {
  if (!isDriverTracked(order.status)) return null;
  if (driver && order.dropoff) {
    let km: number;
    if (order.status === OrderStatus.ASSIGNED && order.pickup) {
      km = roadDistanceKm(driver, order.pickup) + roadDistanceKm(order.pickup, order.dropoff);
    } else {
      km = roadDistanceKm(driver, order.dropoff);
    }
    return Math.max(1, Math.ceil((km / AVERAGE_SPEED_KMH[order.vehicleType]) * 60));
  }
  return order.etaMinutes ?? null;
}
