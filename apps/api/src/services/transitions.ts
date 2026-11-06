import type { OrderStatus, OrderType, Prisma, Role } from '@prisma/client';
import { assertTransition } from '@yaar/shared';
import { conflict } from '../lib/errors';
import type { Db } from './db';

export interface Actor {
  id: string;
  role: Role;
}

/**
 * Applique une transition de statut validée par la machine à états partagée,
 * avec verrou optimiste sur le statut courant, et l'enregistre dans OrderEvent.
 */
export async function transitionOrder(
  db: Db,
  order: { id: string; type: OrderType; status: OrderStatus },
  to: OrderStatus,
  actor: Actor | null,
  data: Prisma.OrderUncheckedUpdateManyInput = {},
  note?: string,
  /** Horodatage de l'événement (horloge injectée). */
  at: Date = new Date(),
): Promise<{ id: string; type: OrderType; status: OrderStatus }> {
  assertTransition(order.type, order.status, to);
  const res = await db.order.updateMany({
    where: { id: order.id, status: order.status },
    data: { ...data, status: to },
  });
  if (res.count === 0) throw conflict('La commande a été modifiée entre-temps, veuillez réessayer');
  await db.orderEvent.create({
    data: {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: to,
      actorId: actor?.id ?? null,
      actorRole: actor?.role ?? null,
      note: note ?? null,
      createdAt: at,
    },
  });
  return { id: order.id, type: order.type, status: to };
}
