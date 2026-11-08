import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import {
  ACTIVE_ORDER_STATUSES,
  OUAGADOUGOU_CENTER,
  VEHICLE_TYPES,
  assignDriverSchema,
  auditLogQuerySchema,
  cashDepositSchema,
  cashLedgerQuerySchema,
  controllerStoreListQuerySchema,
  createStaffSchema,
  exportQuerySchema,
  optionalReasonSchema,
  driverListQuerySchema,
  incidentListQuerySchema,
  incidentUpdateSchema,
  pricingRuleUpdateSchema,
  reasonSchema,
  userListQuerySchema,
  vehicleTypeSchema,
  type AuditLogDto,
  type CashLedgerEntryDto,
  type CashOverviewDto,
  type DashboardDto,
  type DriverCandidateDto,
  type DriverProfileDto,
  type IncidentDto,
  type MapDataDto,
  type OrderDto,
  type Paginated,
  type PendingOrderDto,
  type PricingRuleDto,
  type StoreDto,
  type UserDto,
  type VehicleType,
} from '@yaar/shared';
import { z } from 'zod';
import type { AppContext } from '../context';
import { getAuth, guard } from '../lib/auth';
import { AppError, conflict, forbidden, notFound } from '../lib/errors';
import { sendFile } from '../lib/files';
import { iso, isoOrNull, startOfDayUtc } from '../lib/time';
import { pageArgs, paginated, parse } from '../lib/validation';
import { AuditAction, writeAudit } from '../services/audit';
import type { BusinessBalanceDto } from '../services/deliveries';
import { headingForDto } from '../services/heading';
import { ratingStats } from '../services/ratings';
import { currentRoute, toRouteDto } from '../services/routes';
import {
  incidentInclude,
  kycState,
  ledgerInclude,
  toAuditDto,
  toDriverProfileDto,
  toIncidentDto,
  toLedgerDto,
  toPricingRuleDto,
  toStoreDto,
  toUserDto,
} from '../services/serializers';
import { loadDriverProfileDto } from './driver';

const idParams = z.object({ id: z.string().min(1) });
const docParams = z.object({ id: z.string().min(1), documentId: z.string().min(1) });
const vehicleParams = z.object({ vehicleType: vehicleTypeSchema });
const EXPORT_MAX_ROWS = 10_000;

/** Cellule CSV (séparateur « ; » pour Excel en français), protégée contre l'injection de formules. */
function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  let t = String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
function toCsv(header: string[], rows: Array<Array<string | number | null | undefined>>): string {
  // BOM UTF-8 pour un affichage correct des accents dans Excel.
  return '\uFEFF' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
function dateRange(q: { from?: string; to?: string }): { gte?: Date; lt?: Date } | undefined {
  if (!q.from && !q.to) return undefined;
  return { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) };
}

const storeAdminUpdateSchema = z
  .object({ commissionPercent: z.number().min(0).max(100), isOpen: z.boolean() })
  .partial();

export async function controllerRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { prisma, config, clock } = ctx;
  const backOffice = guard(prisma, config.jwtSecret, ['CONTROLLER', 'ADMIN']);
  const adminOnly = guard(prisma, config.jwtSecret, ['ADMIN']);
  const opts = { preHandler: backOffice };

  /* ------------------------------ Tableau de bord ------------------------------ */

  app.get('/controller/dashboard', opts, async (): Promise<DashboardDto> => {
    const now = clock.now();
    const since = startOfDayUtc(now);
    const fiveMinAgo = new Date(now.getTime() - 5 * 60_000);
    const [online, activeOrders, waiting, waitingOld, deliveredToday, cancelledToday, cash, atLimit, pendingKyc, openIncidents] =
      await Promise.all([
        prisma.driverProfile.findMany({ where: { isOnline: true }, select: { vehicleType: true, isBusy: true } }),
        prisma.order.count({ where: { status: { in: [...ACTIVE_ORDER_STATUSES] } } }),
        prisma.order.count({ where: { status: 'SEARCHING_DRIVER' } }),
        prisma.order.count({ where: { status: 'SEARCHING_DRIVER', searchingSince: { lt: fiveMinAgo } } }),
        prisma.order.findMany({
          where: { status: 'DELIVERED', deliveredAt: { gte: since } },
          select: { createdAt: true, deliveredAt: true },
        }),
        prisma.order.count({ where: { status: 'CANCELLED', cancelledAt: { gte: since } } }),
        prisma.driverProfile.aggregate({ _sum: { cashHeld: true } }),
        prisma.driverProfile.count({ where: { cashHeld: { gte: config.cashLimit } } }),
        prisma.driverProfile.count({ where: { status: 'PENDING' } }),
        prisma.incident.count({ where: { status: { not: 'RESOLVED' } } }),
      ]);
    const byVehicle = Object.fromEntries(VEHICLE_TYPES.map((v) => [v, 0])) as Record<VehicleType, number>;
    for (const d of online) byVehicle[d.vehicleType]++;
    const durations = deliveredToday.map((o) => (o.deliveredAt!.getTime() - o.createdAt.getTime()) / 60000);
    return {
      onlineDrivers: { total: online.length, byVehicle, busy: online.filter((d) => d.isBusy).length },
      activeOrders,
      waitingForDriver: waiting,
      waitingOver5Min: waitingOld,
      deliveredToday: deliveredToday.length,
      cancelledToday,
      avgDeliveryMinutesToday: durations.length
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null,
      cashHeldTotal: cash._sum.cashHeld ?? 0,
      driversAtCashLimit: atLimit,
      pendingKyc,
      openIncidents,
      generatedAt: iso(now),
    };
  });

  app.get('/controller/map', opts, async (): Promise<MapDataDto> => {
    const [drivers, orders, stores, sos] = await Promise.all([
      prisma.driverProfile.findMany({
        where: { isOnline: true, lastLat: { not: null }, lastLng: { not: null } },
        include: { user: true },
      }),
      prisma.order.findMany({
        where: { status: { in: [...ACTIVE_ORDER_STATUSES] } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.store.findMany(),
      prisma.incident.findMany({
        where: { type: 'SOS', status: { not: 'RESOLVED' } },
        include: incidentInclude,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const activeByDriver = new Map(orders.filter((o) => o.driverId).map((o) => [o.driverId!, o.id]));
    return {
      center: { ...OUAGADOUGOU_CENTER },
      drivers: drivers.map((d) => ({
        id: d.userId,
        name: d.user.name,
        vehicleType: d.vehicleType,
        isBusy: d.isBusy,
        lat: d.lastLat!,
        lng: d.lastLng!,
        lastLocationAt: isoOrNull(d.lastLocationAt),
        activeOrderId: activeByDriver.get(d.userId) ?? null,
        heading: headingForDto(d.lastHeading),
      })),
      orders: orders.map((o) => ({
        id: o.id,
        number: o.number,
        type: o.type,
        status: o.status,
        vehicleType: o.vehicleType,
        pickup: { lat: o.pickupLat, lng: o.pickupLng, address: o.pickupAddress },
        dropoff: { lat: o.dropoffLat, lng: o.dropoffLng, address: o.dropoffAddress },
        driverId: o.driverId,
        createdAt: iso(o.createdAt),
        // Itinéraire en cache uniquement (aucun appel au service d'itinéraire depuis la carte).
        route: (() => {
          const r = currentRoute(o);
          return r ? toRouteDto(r) : null;
        })(),
      })),
      stores: stores.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, isOpen: s.isOpen })),
      openSos: sos.map(toIncidentDto),
    };
  });

  /* ------------------------------ Commandes ------------------------------ */

  app.get('/controller/orders/pending', opts, async (): Promise<PendingOrderDto[]> => {
    const now = clock.now();
    const rows = await prisma.order.findMany({
      where: { status: 'SEARCHING_DRIVER' },
      include: {
        offers: { where: { status: 'OFFERED', expiresAt: { gt: now } }, include: { driver: true } },
      },
      orderBy: { searchingSince: 'asc' },
    });
    return rows.map((o) => {
      const offer = o.offers[0];
      return {
        id: o.id,
        number: o.number,
        type: o.type,
        status: o.status,
        vehicleType: o.vehicleType,
        pickupAddress: o.pickupAddress,
        dropoffAddress: o.dropoffAddress,
        total: o.total,
        waitingSeconds: Math.max(0, Math.round((now.getTime() - (o.searchingSince ?? o.createdAt).getTime()) / 1000)),
        currentOffer: offer
          ? { driverId: offer.driverId, driverName: offer.driver.name, expiresAt: iso(offer.expiresAt) }
          : null,
        createdAt: iso(o.createdAt),
      };
    });
  });

  app.get('/controller/orders/:id/candidates', opts, async (req): Promise<DriverCandidateDto[]> => {
    const { id } = parse(idParams, req.params);
    return ctx.dispatch.manualCandidates(id);
  });

  app.post('/controller/orders/:id/assign', opts, async (req): Promise<OrderDto> => {
    const { id } = parse(idParams, req.params);
    const { driverId } = parse(assignDriverSchema, req.body);
    const user = getAuth(req);
    await ctx.dispatch.manualAssign(id, driverId, { id: user.id, role: user.role }, req.ip);
    return ctx.orders.getDto(id, user);
  });

  /** Reprise d'une course PICKED_UP bloquée : livraison validée par le support (audité). */
  app.post('/controller/orders/:id/force-deliver', opts, async (req): Promise<OrderDto> => {
    const { id } = parse(idParams, req.params);
    const { reason } = parse(reasonSchema, req.body);
    return ctx.orders.forceDeliver(id, getAuth(req), reason, req.ip);
  });

  /** Débloque le code de livraison après 5 essais (audité). */
  app.post('/controller/orders/:id/reset-delivery-code', opts, async (req): Promise<OrderDto> => {
    const { id } = parse(idParams, req.params);
    const { reason } = parse(optionalReasonSchema, req.body);
    return ctx.orders.resetDeliveryCode(id, getAuth(req), reason, req.ip);
  });

  /* ------------------------------ Livreurs / KYC ------------------------------ */

  app.get('/controller/drivers', opts, async (req): Promise<Paginated<DriverProfileDto>> => {
    const q = parse(driverListQuerySchema, req.query);
    const where: Prisma.DriverProfileWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.vehicleType) where.vehicleType = q.vehicleType;
    if (q.online !== undefined) where.isOnline = q.online;
    if (q.q)
      where.OR = [
        { user: { phone: { contains: q.q } } },
        { user: { name: { contains: q.q, mode: 'insensitive' } } },
        { plate: { contains: q.q, mode: 'insensitive' } },
      ];
    const [rows, total] = await Promise.all([
      prisma.driverProfile.findMany({
        where,
        include: { user: true, documents: true },
        orderBy: { createdAt: 'asc' },
        ...pageArgs(q),
      }),
      prisma.driverProfile.count({ where }),
    ]);
    const stats = await ratingStats(prisma, rows.map((r) => r.userId));
    const now = clock.now();
    return paginated(
      rows.map((p) => toDriverProfileDto(p, { now, cashLimit: config.cashLimit, rating: stats.get(p.userId) })),
      total,
      q,
    );
  });

  app.get('/controller/drivers/:id', opts, async (req): Promise<DriverProfileDto> => {
    const { id } = parse(idParams, req.params);
    return loadDriverProfileDto(ctx, id);
  });

  /** Consultation d'une pièce KYC : chaque consultation est journalisée (AuditLog). */
  app.get('/controller/drivers/:id/documents/:documentId', opts, async (req, reply) => {
    const { id, documentId } = parse(docParams, req.params);
    const user = getAuth(req);
    const doc = await prisma.driverDocument.findUnique({ where: { id: documentId } });
    if (!doc || doc.driverId !== id) throw notFound('Document introuvable');
    const data = await ctx.storage.get(doc.storageKey);
    await writeAudit(prisma, {
      actorId: user.id,
      action: AuditAction.DRIVER_DOCUMENT_VIEWED,
      entityType: 'DriverDocument',
      entityId: doc.id,
      metadata: { driverId: id, documentType: doc.type },
      ip: req.ip,
    });
    return sendFile(reply, data, doc.mimeType, `${doc.type.toLowerCase()}-${id}`);
  });

  async function driverWithDocs(id: string) {
    const p = await prisma.driverProfile.findUnique({ where: { userId: id }, include: { user: true, documents: true } });
    if (!p) throw notFound('Livreur introuvable');
    return p;
  }

  app.post('/controller/drivers/:id/approve', opts, async (req): Promise<DriverProfileDto> => {
    const { id } = parse(idParams, req.params);
    const user = getAuth(req);
    const p = await driverWithDocs(id);
    if (p.status !== 'PENDING' && p.status !== 'REJECTED')
      throw conflict(`Impossible de valider un dossier au statut ${p.status}`);
    const kyc = kycState(p, clock.now());
    if (!kyc.complete)
      throw new AppError(409, 'KYC_INCOMPLETE', `Dossier incomplet ou pièce expirée : ${kyc.missing.join(', ') || 'immatriculation'}`);
    await prisma.$transaction(async (tx) => {
      await tx.driverProfile.update({
        where: { userId: id },
        data: { status: 'APPROVED', approvedAt: clock.now(), approvedById: user.id, rejectionReason: null },
      });
      await writeAudit(tx, { actorId: user.id, action: AuditAction.DRIVER_APPROVED, entityType: 'DriverProfile', entityId: id, ip: req.ip });
    });
    return loadDriverProfileDto(ctx, id);
  });

  app.post('/controller/drivers/:id/reject', opts, async (req): Promise<DriverProfileDto> => {
    const { id } = parse(idParams, req.params);
    const { reason } = parse(reasonSchema, req.body);
    const user = getAuth(req);
    const p = await driverWithDocs(id);
    if (p.status !== 'PENDING') throw conflict('Seul un dossier en attente peut être refusé');
    await prisma.$transaction(async (tx) => {
      await tx.driverProfile.update({ where: { userId: id }, data: { status: 'REJECTED', rejectionReason: reason } });
      await writeAudit(tx, {
        actorId: user.id,
        action: AuditAction.DRIVER_REJECTED,
        entityType: 'DriverProfile',
        entityId: id,
        metadata: { reason },
        ip: req.ip,
      });
    });
    return loadDriverProfileDto(ctx, id);
  });

  app.post('/controller/drivers/:id/suspend', opts, async (req): Promise<DriverProfileDto> => {
    const { id } = parse(idParams, req.params);
    const { reason } = parse(reasonSchema, req.body);
    const user = getAuth(req);
    const p = await driverWithDocs(id);
    if (p.status !== 'APPROVED') throw conflict('Seul un livreur validé peut être suspendu');
    if (p.isBusy)
      throw conflict('Ce livreur a une course en cours : réaffectez-la, validez-la ou annulez-la d’abord', 'DRIVER_BUSY');
    await prisma.$transaction(async (tx) => {
      await tx.driverProfile.update({
        where: { userId: id },
        data: {
          status: 'SUSPENDED',
          suspensionReason: reason,
          isOnline: false,
          onlineSince: null,
          lastLat: null,
          lastLng: null,
          lastLocationAt: null,
          lastHeading: null,
        },
      });
      await writeAudit(tx, {
        actorId: user.id,
        action: AuditAction.DRIVER_SUSPENDED,
        entityType: 'DriverProfile',
        entityId: id,
        metadata: { reason, wasBusy: p.isBusy },
        ip: req.ip,
      });
    });
    await ctx.dispatch.withdrawDriverOffers(id);
    ctx.realtime.driverStatus({ driverId: id, isOnline: false, isBusy: p.isBusy });
    return loadDriverProfileDto(ctx, id);
  });

  app.post('/controller/drivers/:id/reinstate', opts, async (req): Promise<DriverProfileDto> => {
    const { id } = parse(idParams, req.params);
    const user = getAuth(req);
    const p = await driverWithDocs(id);
    if (p.status !== 'SUSPENDED') throw conflict('Ce livreur n’est pas suspendu');
    await prisma.$transaction(async (tx) => {
      await tx.driverProfile.update({ where: { userId: id }, data: { status: 'APPROVED', suspensionReason: null } });
      await writeAudit(tx, { actorId: user.id, action: AuditAction.DRIVER_REINSTATED, entityType: 'DriverProfile', entityId: id, ip: req.ip });
    });
    return loadDriverProfileDto(ctx, id);
  });

  /* ------------------------------ Utilisateurs ------------------------------ */

  app.get('/controller/users', opts, async (req): Promise<Paginated<UserDto>> => {
    const q = parse(userListQuerySchema, req.query);
    const where: Prisma.UserWhereInput = {};
    if (q.role) where.role = q.role;
    if (q.suspended !== undefined) where.isSuspended = q.suspended;
    if (q.q) where.OR = [{ phone: { contains: q.q } }, { name: { contains: q.q, mode: 'insensitive' } }];
    const [rows, total] = await Promise.all([
      prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
      prisma.user.count({ where }),
    ]);
    return paginated(rows.map(toUserDto), total, q);
  });

  async function setSuspended(req: { params: unknown; body: unknown; ip: string }, actor: { id: string; role: string }, suspend: boolean) {
    const { id } = parse(idParams, req.params);
    const reason = suspend ? parse(reasonSchema, req.body).reason : null;
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound('Utilisateur introuvable');
    if (target.id === actor.id) throw forbidden('Vous ne pouvez pas modifier votre propre compte');
    if ((target.role === 'CONTROLLER' || target.role === 'ADMIN') && actor.role !== 'ADMIN')
      throw forbidden('Seul un administrateur peut suspendre un compte de la console');
    if (suspend && target.role === 'DRIVER') {
      const busy = await prisma.driverProfile.findFirst({ where: { userId: id, isBusy: true } });
      if (busy)
        throw conflict('Ce livreur a une course en cours : réaffectez-la, validez-la ou annulez-la d’abord', 'DRIVER_BUSY');
    }
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id }, data: { isSuspended: suspend, suspensionReason: reason } });
      if (suspend && target.role === 'DRIVER')
        await tx.driverProfile.updateMany({
          where: { userId: id },
          data: { isOnline: false, onlineSince: null, lastLat: null, lastLng: null, lastLocationAt: null, lastHeading: null },
        });
      await writeAudit(tx, {
        actorId: actor.id,
        action: suspend ? AuditAction.USER_SUSPENDED : AuditAction.USER_UNSUSPENDED,
        entityType: 'User',
        entityId: id,
        metadata: { reason },
        ip: req.ip,
      });
      return u;
    });
    if (suspend && target.role === 'DRIVER') {
      await ctx.dispatch.withdrawDriverOffers(id);
      ctx.realtime.driverStatus({ driverId: id, isOnline: false, isBusy: false });
    }
    // Les sockets ouvertes d'un compte suspendu sont fermées (plus aucun événement reçu).
    if (suspend) ctx.realtime.disconnectUser(id);
    return toUserDto(updated);
  }

  app.post('/controller/users/:id/suspend', opts, async (req): Promise<UserDto> => setSuspended(req, getAuth(req), true));
  app.post('/controller/users/:id/unsuspend', opts, async (req): Promise<UserDto> => setSuspended(req, getAuth(req), false));

  app.post('/controller/staff', { preHandler: adminOnly }, async (req, reply): Promise<UserDto> => {
    const input = parse(createStaffSchema, req.body);
    const exists = await prisma.user.findUnique({ where: { phone: input.phone } });
    if (exists) throw conflict('Un compte existe déjà avec ce numéro');
    const actor = getAuth(req);
    const u = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: input });
      await writeAudit(tx, {
        actorId: actor.id,
        action: AuditAction.STAFF_CREATED,
        entityType: 'User',
        entityId: created.id,
        metadata: { role: input.role },
        ip: req.ip,
      });
      return created;
    });
    reply.code(201);
    return toUserDto(u);
  });

  /* ------------------------------ Boutiques ------------------------------ */

  app.get('/controller/stores', opts, async (req): Promise<Paginated<StoreDto>> => {
    const q = parse(controllerStoreListQuerySchema, req.query);
    const where: Prisma.StoreWhereInput = q.approvalStatus ? { approvalStatus: q.approvalStatus } : {};
    const [rows, total] = await Promise.all([
      prisma.store.findMany({ where, orderBy: { name: 'asc' }, ...pageArgs(q) }),
      prisma.store.count({ where }),
    ]);
    return paginated(rows.map((s) => toStoreDto(s, null, { internal: true })), total, q);
  });

  /** Validation d'une boutique (dossier vendeur) : elle devient visible des clients. */
  app.post('/controller/stores/:id/approve', opts, async (req): Promise<StoreDto> => {
    const { id } = parse(idParams, req.params);
    const actor = getAuth(req);
    const store = await prisma.store.findUnique({ where: { id } });
    if (!store) throw notFound('Boutique introuvable');
    if (store.approvalStatus === 'APPROVED') throw conflict('Cette boutique est déjà validée');
    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.store.update({
        where: { id },
        data: { approvalStatus: 'APPROVED', approvedAt: clock.now(), approvalNote: null },
      });
      await writeAudit(tx, {
        actorId: actor.id,
        action: AuditAction.STORE_APPROVED,
        entityType: 'Store',
        entityId: id,
        metadata: { previous: store.approvalStatus },
        ip: req.ip,
      });
      return s;
    });
    return toStoreDto(updated, null, { internal: true });
  });

  /** Suspension d'une boutique : retirée du catalogue et fermée. Les commandes en cours continuent. */
  app.post('/controller/stores/:id/suspend', opts, async (req): Promise<StoreDto> => {
    const { id } = parse(idParams, req.params);
    const { reason } = parse(reasonSchema, req.body);
    const actor = getAuth(req);
    const store = await prisma.store.findUnique({ where: { id } });
    if (!store) throw notFound('Boutique introuvable');
    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.store.update({
        where: { id },
        data: { approvalStatus: 'SUSPENDED', approvalNote: reason, isOpen: false },
      });
      await writeAudit(tx, {
        actorId: actor.id,
        action: AuditAction.STORE_SUSPENDED,
        entityType: 'Store',
        entityId: id,
        metadata: { reason, previous: store.approvalStatus },
        ip: req.ip,
      });
      return s;
    });
    return toStoreDto(updated, null, { internal: true });
  });

  app.patch('/controller/stores/:id', opts, async (req): Promise<StoreDto> => {
    const { id } = parse(idParams, req.params);
    const input = parse(storeAdminUpdateSchema, req.body);
    const store = await prisma.store.findUnique({ where: { id } });
    if (!store) throw notFound('Boutique introuvable');
    const actor = getAuth(req);
    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.store.update({ where: { id }, data: input });
      await writeAudit(tx, {
        actorId: actor.id,
        action: AuditAction.STORE_UPDATED_BY_CONTROLLER,
        entityType: 'Store',
        entityId: id,
        metadata: { ...input },
        ip: req.ip,
      });
      return s;
    });
    return toStoreDto(updated, null, { internal: true });
  });

  /* ------------------------------ Tarifs ------------------------------ */

  app.get('/controller/pricing-rules', opts, async (): Promise<PricingRuleDto[]> => {
    const rows = await prisma.pricingRule.findMany();
    const order = new Map(VEHICLE_TYPES.map((v, i) => [v, i]));
    return rows.sort((a, b) => order.get(a.vehicleType)! - order.get(b.vehicleType)!).map(toPricingRuleDto);
  });

  app.put('/controller/pricing-rules/:vehicleType', opts, async (req): Promise<PricingRuleDto> => {
    const { vehicleType } = parse(vehicleParams, req.params);
    const input = parse(pricingRuleUpdateSchema, req.body);
    const actor = getAuth(req);
    const before = await prisma.pricingRule.findUnique({ where: { vehicleType } });
    const rule = await prisma.$transaction(async (tx) => {
      const r = await tx.pricingRule.upsert({
        where: { vehicleType },
        create: { vehicleType, ...input, updatedById: actor.id },
        update: { ...input, updatedById: actor.id },
      });
      await writeAudit(tx, {
        actorId: actor.id,
        action: AuditAction.PRICING_RULE_UPDATED,
        entityType: 'PricingRule',
        entityId: vehicleType,
        metadata: {
          before: before
            ? { baseFare: before.baseFare, perKm: before.perKm, minimumFare: before.minimumFare, commissionPercent: before.commissionPercent, isActive: before.isActive }
            : null,
          after: { ...input },
        },
        ip: req.ip,
      });
      return r;
    });
    return toPricingRuleDto(rule);
  });

  /* ------------------------------ Caisse livreurs ------------------------------ */

  app.get('/controller/cash', opts, async (): Promise<CashOverviewDto> => {
    const drivers = await prisma.driverProfile.findMany({
      where: { OR: [{ cashHeld: { gt: 0 } }, { status: 'APPROVED' }] },
      include: { user: true },
      orderBy: { cashHeld: 'desc' },
    });
    const lastDeposits = await prisma.cashLedgerEntry.groupBy({
      by: ['driverId'],
      where: { type: 'DEPOSIT' },
      _max: { createdAt: true },
    });
    const lastByDriver = new Map(lastDeposits.map((d) => [d.driverId, d._max.createdAt]));
    return {
      cashLimit: config.cashLimit,
      totalHeld: drivers.reduce((s, d) => s + d.cashHeld, 0),
      drivers: drivers.map((d) => ({
        driverId: d.userId,
        name: d.user.name,
        phone: d.user.phone,
        vehicleType: d.vehicleType,
        cashHeld: d.cashHeld,
        cashBlocked: d.cashHeld >= config.cashLimit,
        lastDepositAt: isoOrNull(lastByDriver.get(d.userId) ?? null),
      })),
    };
  });

  /**
   * Livraisons d'entreprise : marchandise encaissée par les livreurs pour le compte de chaque entreprise (montant
   * dû, `owedToBusiness` des livraisons livrées). Pas encore de reversement enregistré (cf. docs/API.md).
   */
  app.get('/controller/cash/businesses', opts, async (): Promise<BusinessBalanceDto[]> => ctx.deliveries.balances());

  app.get('/controller/cash/ledger', opts, async (req): Promise<Paginated<CashLedgerEntryDto>> => {
    const q = parse(cashLedgerQuerySchema, req.query);
    const where: Prisma.CashLedgerEntryWhereInput = q.driverId ? { driverId: q.driverId } : {};
    const [rows, total] = await Promise.all([
      prisma.cashLedgerEntry.findMany({ where, include: ledgerInclude, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
      prisma.cashLedgerEntry.count({ where }),
    ]);
    return paginated(rows.map(toLedgerDto), total, q);
  });

  /** Versement d'espèces par un livreur, enregistré par un contrôleur. */
  app.post('/controller/drivers/:id/cash-deposits', opts, async (req, reply): Promise<CashLedgerEntryDto> => {
    const { id } = parse(idParams, req.params);
    const { amount, note } = parse(cashDepositSchema, req.body);
    const actor = getAuth(req);
    const entry = await prisma.$transaction(async (tx) => {
      // Décrément conditionnel atomique : deux versements simultanés ne rendent jamais le solde négatif.
      const dec = await tx.driverProfile.updateMany({
        where: { userId: id, cashHeld: { gte: amount } },
        data: { cashHeld: { decrement: amount } },
      });
      if (dec.count === 0) {
        const p = await tx.driverProfile.findUnique({ where: { userId: id } });
        if (!p) throw notFound('Livreur introuvable');
        throw conflict(`Le versement dépasse le solde détenu (${p.cashHeld} FCFA)`);
      }
      const updated = await tx.driverProfile.findUniqueOrThrow({ where: { userId: id } });
      const e = await tx.cashLedgerEntry.create({
        data: {
          driverId: id,
          type: 'DEPOSIT',
          amount: -amount,
          balanceAfter: updated.cashHeld,
          recordedById: actor.id,
          note: note ?? null,
          createdAt: clock.now(),
        },
        include: ledgerInclude,
      });
      await writeAudit(tx, {
        actorId: actor.id,
        action: AuditAction.CASH_DEPOSIT_RECORDED,
        entityType: 'DriverProfile',
        entityId: id,
        metadata: { amount, balanceAfter: updated.cashHeld },
        ip: req.ip,
      });
      return e;
    });
    reply.code(201);
    return toLedgerDto(entry);
  });

  /* ------------------------------ Incidents ------------------------------ */

  app.get('/controller/incidents', opts, async (req): Promise<Paginated<IncidentDto>> => {
    const q = parse(incidentListQuerySchema, req.query);
    const where: Prisma.IncidentWhereInput = {};
    // Un ou plusieurs statuts (`status=OPEN,IN_PROGRESS` : une seule requête pour la console en mode poll).
    if (q.status?.length) where.status = { in: q.status };
    if (q.type) where.type = q.type;
    const [rows, total] = await Promise.all([
      prisma.incident.findMany({ where, include: incidentInclude, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
      prisma.incident.count({ where }),
    ]);
    return paginated(rows.map(toIncidentDto), total, q);
  });

  app.patch('/controller/incidents/:id', opts, async (req): Promise<IncidentDto> => {
    const { id } = parse(idParams, req.params);
    const input = parse(incidentUpdateSchema, req.body);
    const actor = getAuth(req);
    const existing = await prisma.incident.findUnique({ where: { id } });
    if (!existing) throw notFound('Incident introuvable');
    const resolved = input.status === 'RESOLVED';
    const inc = await prisma.$transaction(async (tx) => {
      const i = await tx.incident.update({
        where: { id },
        data: {
          status: input.status,
          resolutionNote: input.resolutionNote ?? existing.resolutionNote,
          resolvedById: resolved ? actor.id : null,
          resolvedAt: resolved ? clock.now() : null,
        },
        include: incidentInclude,
      });
      await writeAudit(tx, {
        actorId: actor.id,
        action: AuditAction.INCIDENT_UPDATED,
        entityType: 'Incident',
        entityId: id,
        metadata: { from: existing.status, to: input.status },
        ip: req.ip,
      });
      return i;
    });
    const dto = toIncidentDto(inc);
    ctx.realtime.incidentUpdated(dto);
    return dto;
  });

  /* ------------------------------ Exports CSV ------------------------------ */

  async function auditExport(actorId: string, kind: string, q: { from?: string; to?: string }, rows: number, ip: string) {
    await writeAudit(prisma, {
      actorId,
      action: AuditAction.DATA_EXPORTED,
      entityType: 'Export',
      entityId: kind,
      metadata: { from: q.from ?? null, to: q.to ?? null, rows },
      ip,
    });
  }

  /** Export des commandes (sans adresses ni téléphones : données minimales pour la comptabilité). */
  app.get('/controller/exports/orders.csv', opts, async (req, reply) => {
    const q = parse(exportQuerySchema, req.query);
    const range = dateRange(q);
    const rows = await prisma.order.findMany({
      where: range ? { createdAt: range } : {},
      include: { store: { select: { name: true } }, driver: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
      take: EXPORT_MAX_ROWS,
    });
    await auditExport(getAuth(req).id, 'orders', q, rows.length, req.ip);
    const csv = toCsv(
      ['numero', 'date', 'type', 'statut', 'vehicule', 'boutique', 'livreur', 'distance_km', 'articles', 'livraison', 'total', 'commission', 'gain_livreur', 'reversement_vendeur', 'paiement', 'especes_encaissees', 'livree_le', 'annulee_le', 'frais_payes_par', 'marchandise_a_encaisser', 'du_entreprise'],
      rows.map((o) => [
        o.number, iso(o.createdAt), o.type, o.status, o.vehicleType, o.store?.name ?? '', o.driver?.name ?? '', o.distanceKm,
        o.itemsTotal, o.deliveryFee, o.total, o.commission, o.driverEarning, o.sellerPayout, o.paymentMethod,
        o.cashCollected, isoOrNull(o.deliveredAt), isoOrNull(o.cancelledAt), o.feePaidBy ?? '', o.cashToCollect, o.owedToBusiness,
      ]),
    );
    return reply
      .header('Cache-Control', 'no-store')
      .header('Content-Disposition', 'attachment; filename="yaar-commandes.csv"')
      .type('text/csv; charset=utf-8')
      .send(csv);
  });

  app.get('/controller/exports/cash-ledger.csv', opts, async (req, reply) => {
    const q = parse(exportQuerySchema, req.query);
    const range = dateRange(q);
    const rows = await prisma.cashLedgerEntry.findMany({
      where: range ? { createdAt: range } : {},
      include: ledgerInclude,
      orderBy: { createdAt: 'asc' },
      take: EXPORT_MAX_ROWS,
    });
    await auditExport(getAuth(req).id, 'cash-ledger', q, rows.length, req.ip);
    const csv = toCsv(
      ['date', 'livreur', 'telephone', 'type', 'montant', 'solde_apres', 'commande', 'note', 'enregistre_par'],
      rows.map((e) => [
        iso(e.createdAt), e.driver.name, e.driver.phone, e.type, e.amount, e.balanceAfter, e.order?.number ?? '', e.note,
        e.recordedBy?.name ?? '',
      ]),
    );
    return reply
      .header('Cache-Control', 'no-store')
      .header('Content-Disposition', 'attachment; filename="yaar-caisse.csv"')
      .type('text/csv; charset=utf-8')
      .send(csv);
  });

  /* ------------------------------ Journal d'audit ------------------------------ */

  app.get('/controller/audit-logs', opts, async (req): Promise<Paginated<AuditLogDto>> => {
    const q = parse(auditLogQuerySchema, req.query);
    const where: Prisma.AuditLogWhereInput = {};
    if (q.action) where.action = q.action;
    if (q.actorId) where.actorId = q.actorId;
    if (q.entityType) where.entityType = q.entityType;
    if (q.entityId) where.entityId = q.entityId;
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({ where, include: { actor: true }, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
      prisma.auditLog.count({ where }),
    ]);
    return paginated(rows.map(toAuditDto), total, q);
  });
}
