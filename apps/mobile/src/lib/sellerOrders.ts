import { OrderStatus, type OrderDto } from '@yaar/shared';

/** Statuts suivis sur l'écran « Commandes du jour » du vendeur. */
export const SELLER_ACTIVE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.ACCEPTED,
  OrderStatus.READY,
  OrderStatus.SEARCHING_DRIVER,
  OrderStatus.ASSIGNED,
  OrderStatus.PICKED_UP,
];

const PRIORITY: Partial<Record<OrderStatus, number>> = {
  PENDING: 0,
  ACCEPTED: 1,
  READY: 2,
  SEARCHING_DRIVER: 2,
  ASSIGNED: 3,
  PICKED_UP: 4,
};

/** Nouvelles commandes d'abord, puis en préparation, etc. ; à statut égal, la plus ancienne d'abord. */
export function sortSellerOrders(orders: OrderDto[]): OrderDto[] {
  return [...orders].sort((a, b) => {
    const pa = PRIORITY[a.status] ?? 9;
    const pb = PRIORITY[b.status] ?? 9;
    if (pa !== pb) return pa - pb;
    return Date.parse(a.createdAt) - Date.parse(b.createdAt);
  });
}

export function ordersOfStore(orders: OrderDto[], storeId: string): OrderDto[] {
  return orders.filter((o) => o.store?.id === storeId);
}

/** Bornes du temps de préparation annoncé à l'acceptation. */
export function clampPrepTime(minutes: number): number {
  return Math.min(180, Math.max(5, Math.round(minutes)));
}

/** Validation du prix saisi (entier FCFA, > 0). */
export function parsePrice(input: string): number | null {
  const digits = input.replace(/[\s.]/g, '').replace(/F(CFA)?$/i, '');
  if (!/^\d+$/.test(digits)) return null;
  const n = Number(digits);
  return n > 0 && n <= 10_000_000 ? n : null;
}
