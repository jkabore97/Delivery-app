import type { Prisma } from '@prisma/client';
import type { Db } from './db';

/** Actions sensibles journalisées (consultables dans la console). */
export const AuditAction = {
  DRIVER_DOCUMENT_VIEWED: 'DRIVER_DOCUMENT_VIEWED',
  DRIVER_APPROVED: 'DRIVER_APPROVED',
  DRIVER_REJECTED: 'DRIVER_REJECTED',
  DRIVER_SUSPENDED: 'DRIVER_SUSPENDED',
  DRIVER_REINSTATED: 'DRIVER_REINSTATED',
  USER_SUSPENDED: 'USER_SUSPENDED',
  USER_UNSUSPENDED: 'USER_UNSUSPENDED',
  STAFF_CREATED: 'STAFF_CREATED',
  PRICING_RULE_UPDATED: 'PRICING_RULE_UPDATED',
  STORE_UPDATED_BY_CONTROLLER: 'STORE_UPDATED_BY_CONTROLLER',
  CASH_DEPOSIT_RECORDED: 'CASH_DEPOSIT_RECORDED',
  ORDER_MANUALLY_ASSIGNED: 'ORDER_MANUALLY_ASSIGNED',
  ORDER_CANCELLED_BY_CONTROLLER: 'ORDER_CANCELLED_BY_CONTROLLER',
  ORDER_PROOF_VIEWED: 'ORDER_PROOF_VIEWED',
  ORDER_FORCE_DELIVERED: 'ORDER_FORCE_DELIVERED',
  ORDER_DELIVERY_CODE_RESET: 'ORDER_DELIVERY_CODE_RESET',
  STORE_APPROVED: 'STORE_APPROVED',
  STORE_SUSPENDED: 'STORE_SUSPENDED',
  DATA_EXPORTED: 'DATA_EXPORTED',
  INCIDENT_UPDATED: 'INCIDENT_UPDATED',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export async function writeAudit(
  db: Db,
  entry: {
    actorId: string | null;
    action: AuditAction;
    entityType: string;
    entityId?: string | null;
    metadata?: Prisma.InputJsonObject;
    ip?: string | null;
  },
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ?? undefined,
      ip: entry.ip ?? null,
    },
  });
}
