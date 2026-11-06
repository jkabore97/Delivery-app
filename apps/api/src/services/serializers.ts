import type {
  AuditLog,
  CashLedgerEntry,
  DispatchOffer,
  DriverDocument,
  DriverProfile,
  Incident,
  Prisma,
  PricingRule,
  Product,
  Store,
  User,
} from '@prisma/client';
import {
  AVERAGE_SPEED_KMH,
  DRIVER_ACTIVE_STATUSES,
  approximateZone,
  haversineKm,
  roadDistanceKm,
  requiredDocuments,
  plateRequired,
  type AuditLogDto,
  type CashLedgerEntryDto,
  type DriverDocumentDto,
  type DriverProfileDto,
  type IncidentDto,
  type OfferDto,
  type OrderDto,
  type PricingRuleDto,
  type ProductDto,
  type StoreDto,
  type UserDto,
  type DocumentType,
  type OrderStatus,
} from '@yaar/shared';
import type { AuthUser } from '../lib/auth';
import { iso, isoOrNull } from '../lib/time';

export function toUserDto(u: User): UserDto {
  return {
    id: u.id,
    phone: u.phone,
    name: u.name,
    role: u.role,
    isSuspended: u.isSuspended,
    suspensionReason: u.suspensionReason,
    createdAt: iso(u.createdAt),
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * `internal` (vendeur propriétaire, console) : commission et statut de validation.
 * Vue publique (clients, livreurs) : sans la commission ni la remarque de la console.
 */
export function toStoreDto(
  s: Store,
  from?: { lat: number; lng: number } | null,
  opts: { internal?: boolean } = {},
): StoreDto {
  const internal = opts.internal ?? false;
  return {
    id: s.id,
    ownerId: s.ownerId,
    name: s.name,
    description: s.description,
    phone: s.phone,
    address: s.address,
    landmark: s.landmark,
    lat: s.lat,
    lng: s.lng,
    isOpen: s.isOpen,
    prepTimeMinutes: s.prepTimeMinutes,
    openingHours: s.openingHours,
    commissionPercent: internal ? s.commissionPercent : null,
    distanceKm: from ? round1(haversineKm(from, s)) : null,
    approvalStatus: s.approvalStatus,
    approvalNote: internal ? s.approvalNote : null,
    createdAt: iso(s.createdAt),
  };
}

export function toProductDto(p: Product): ProductDto {
  return {
    id: p.id,
    storeId: p.storeId,
    name: p.name,
    description: p.description,
    category: p.category,
    price: p.price,
    isAvailable: p.isAvailable,
    photoUrl: p.imageKey ? `/products/${p.id}/photo` : null,
  };
}

/* ------------------------------ Commandes ------------------------------ */

export const orderInclude = {
  client: true,
  store: true,
  driver: { include: { driverProfile: true } },
  items: true,
  ratings: true,
} satisfies Prisma.OrderInclude;

export const orderDetailInclude = {
  ...orderInclude,
  events: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
export type OrderWithEvents = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;

function isDriverActive(status: OrderStatus): boolean {
  return DRIVER_ACTIVE_STATUSES.includes(status);
}

/**
 * Estimation d'arrivée (minutes) depuis la dernière position du livreur : ASSIGNED = trajet jusqu'au
 * retrait puis jusqu'à la livraison ; PICKED_UP = trajet jusqu'à la livraison. null sinon.
 */
export function estimateEtaMinutes(
  o: { status: OrderStatus; pickupLat: number; pickupLng: number; dropoffLat: number; dropoffLng: number; distanceKm: number },
  driver: { vehicleType: keyof typeof AVERAGE_SPEED_KMH; lastLat: number | null; lastLng: number | null } | null,
): number | null {
  if (!driver || driver.lastLat === null || driver.lastLng === null) return null;
  const here = { lat: driver.lastLat, lng: driver.lastLng };
  const pickup = { lat: o.pickupLat, lng: o.pickupLng };
  const dropoff = { lat: o.dropoffLat, lng: o.dropoffLng };
  let km: number;
  if (o.status === 'ASSIGNED') km = roadDistanceKm(here, pickup) + o.distanceKm;
  else if (o.status === 'PICKED_UP') km = roadDistanceKm(here, dropoff);
  else return null;
  return Math.max(1, Math.ceil((km / AVERAGE_SPEED_KMH[driver.vehicleType]) * 60));
}

/**
 * Sérialise une commande pour l'utilisateur `viewer` en appliquant les règles de visibilité :
 * - code de livraison : client propriétaire uniquement ;
 * - livreur : retrait / livraison / téléphone client seulement s'il est affecté et tant que la
 *   commande n'est pas livrée ;
 * - commission : contrôleurs ; gain livreur : livreur affecté + contrôleurs ; reversement vendeur :
 *   vendeur + contrôleurs.
 */
export function toOrderDto(
  o: OrderWithRelations | OrderWithEvents,
  viewer: AuthUser,
  opts: { driverRatingAvg?: number | null } = {},
): OrderDto {
  const role = viewer.role;
  const isController = role === 'CONTROLLER' || role === 'ADMIN';
  const isClient = role === 'CLIENT' && o.clientId === viewer.id;
  const isSeller = role === 'SELLER' && o.store?.ownerId === viewer.id;
  const isDriver = role === 'DRIVER' && o.driverId === viewer.id;
  const active = isDriverActive(o.status);
  const terminal = o.status === 'DELIVERED' || o.status === 'CANCELLED';

  const driverSeesDetails = isDriver && active;
  // Vendeur : adresse du client seulement le temps de la commande (pas d'historique des adresses clients).
  const showAddresses = isController || isClient || (isSeller && !terminal) || driverSeesDetails;
  const showClientPhone = isController || driverSeesDetails || (isSeller && !terminal);

  const profile = o.driver?.driverProfile ?? null;
  const showDriverLive = active && (isClient || isSeller || isController);
  const showDriverPhone = isController || ((isClient || isSeller) && active);

  const myRating = o.ratings.find((r) => r.fromUserId === viewer.id)?.score ?? null;
  const canRate =
    o.status === 'DELIVERED' && myRating === null && o.driverId !== null && (isClient || isDriver);

  const dto: OrderDto = {
    id: o.id,
    number: o.number,
    type: o.type,
    status: o.status,
    vehicleType: o.vehicleType,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    client: { id: o.client.id, name: o.client.name, phone: showClientPhone || isClient ? o.client.phone : null },
    store: o.store ? { id: o.store.id, name: o.store.name, phone: o.store.phone } : null,
    driver:
      o.driver && profile
        ? {
            id: o.driver.id,
            name: o.driver.name,
            phone: showDriverPhone || isDriver ? o.driver.phone : null,
            vehicleType: profile.vehicleType,
            plate: profile.plate,
            ratingAvg: opts.driverRatingAvg ?? null,
            lastLocation:
              showDriverLive && profile.lastLat !== null && profile.lastLng !== null && profile.lastLocationAt
                ? { lat: profile.lastLat, lng: profile.lastLng, at: iso(profile.lastLocationAt) }
                : null,
          }
        : null,
    pickup: showAddresses
      ? { lat: o.pickupLat, lng: o.pickupLng, address: o.pickupAddress, landmark: o.pickupLandmark }
      : null,
    dropoff: showAddresses
      ? { lat: o.dropoffLat, lng: o.dropoffLng, address: o.dropoffAddress, landmark: o.dropoffLandmark }
      : null,
    recipientName: showAddresses ? o.recipientName : null,
    recipientPhone: showAddresses && (showClientPhone || isClient) ? o.recipientPhone : null,
    parcelDescription: o.parcelDescription,
    notes: showAddresses ? o.notes : null,
    items: o.items.map((i) => ({
      productId: i.productId,
      name: i.name,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.unitPrice * i.quantity,
    })),
    distanceKm: o.distanceKm,
    itemsTotal: o.itemsTotal,
    deliveryFee: o.deliveryFee,
    total: o.total,
    commission: isController ? o.commission : null,
    driverEarning: isController || isDriver ? o.driverEarning : null,
    sellerPayout: isController || isSeller ? o.sellerPayout : null,
    deliveryCode: isClient && !terminal ? o.deliveryCode : null,
    cashCollected: o.cashCollected,
    prepTimeMinutes: o.prepTimeMinutes,
    hasProofPhoto: o.proofPhotoKey !== null,
    cancelReason: o.cancelReason,
    createdAt: iso(o.createdAt),
    acceptedAt: isoOrNull(o.acceptedAt),
    readyAt: isoOrNull(o.readyAt),
    assignedAt: isoOrNull(o.assignedAt),
    pickedUpAt: isoOrNull(o.pickedUpAt),
    deliveredAt: isoOrNull(o.deliveredAt),
    cancelledAt: isoOrNull(o.cancelledAt),
    myRating,
    canRate,
    etaMinutes: showDriverLive || driverSeesDetails ? estimateEtaMinutes(o, profile) : null,
  };
  if ('events' in o) {
    dto.events = o.events.map((e) => ({
      id: e.id,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      actorRole: e.actorRole,
      note: e.note,
      createdAt: iso(e.createdAt),
    }));
  }
  return dto;
}

/* ------------------------------ Livreurs ------------------------------ */

export function toDocumentDto(d: DriverDocument, now: Date): DriverDocumentDto {
  return {
    id: d.id,
    type: d.type,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    expiresAt: isoOrNull(d.expiresAt),
    isExpired: d.expiresAt !== null && d.expiresAt.getTime() < now.getTime(),
    uploadedAt: iso(d.uploadedAt),
  };
}

export type DriverWithRelations = DriverProfile & { user: User; documents: DriverDocument[] };

export function kycState(p: DriverProfile & { documents: DriverDocument[] }, now: Date) {
  const required = requiredDocuments(p.vehicleType);
  const valid = new Set<DocumentType>(
    p.documents.filter((d) => d.expiresAt === null || d.expiresAt.getTime() >= now.getTime()).map((d) => d.type),
  );
  const missing = required.filter((t) => !valid.has(t));
  const plateOk = !plateRequired(p.vehicleType) || !!p.plate;
  return { required, missing, complete: missing.length === 0 && plateOk };
}

export function toDriverProfileDto(
  p: DriverWithRelations,
  ctx: { now: Date; cashLimit: number; rating?: { avg: number | null; count: number } },
): DriverProfileDto {
  const kyc = kycState(p, ctx.now);
  return {
    userId: p.userId,
    name: p.user.name,
    phone: p.user.phone,
    vehicleType: p.vehicleType,
    plate: p.plate,
    status: p.status,
    isOnline: p.isOnline,
    isBusy: p.isBusy,
    isSuspendedUser: p.user.isSuspended,
    cashHeld: p.cashHeld,
    cashLimit: ctx.cashLimit,
    cashBlocked: p.cashHeld >= ctx.cashLimit,
    rejectionReason: p.rejectionReason,
    suspensionReason: p.suspensionReason,
    ratingAvg: ctx.rating?.avg ?? null,
    ratingCount: ctx.rating?.count ?? 0,
    documents: p.documents.map((d) => toDocumentDto(d, ctx.now)),
    requiredDocuments: kyc.required,
    missingDocuments: kyc.missing,
    kycComplete: kyc.complete,
    lastLocation:
      p.lastLat !== null && p.lastLng !== null && p.lastLocationAt
        ? { lat: p.lastLat, lng: p.lastLng, at: iso(p.lastLocationAt) }
        : null,
    approvedAt: isoOrNull(p.approvedAt),
    trackingConsentAt: isoOrNull(p.trackingConsentAt),
    createdAt: iso(p.createdAt),
  };
}

export type OfferWithOrder = DispatchOffer & { order: Prisma.OrderGetPayload<{ include: { store: true } }> };

/**
 * Offre envoyée à un livreur AVANT acceptation : aucune adresse ni coordonnée du client.
 * FOOD : nom et adresse de la boutique (lieu public) ; colis : zone approximative du retrait.
 * Livraison : zone approximative seulement (« Secteur Zogona »).
 */
export function toOfferDto(o: OfferWithOrder): OfferDto {
  const pickupZone = approximateZone({ lat: o.order.pickupLat, lng: o.order.pickupLng });
  const dropoffZone = approximateZone({ lat: o.order.dropoffLat, lng: o.order.dropoffLng });
  const isFood = o.order.type === 'FOOD' && o.order.store !== null;
  return {
    id: o.id,
    orderId: o.orderId,
    orderNumber: o.order.number,
    orderType: o.order.type,
    status: o.status,
    vehicleType: o.order.vehicleType,
    offeredAt: iso(o.offeredAt),
    expiresAt: iso(o.expiresAt),
    pickup: {
      address: isFood ? o.order.pickupAddress : pickupZone,
      name: o.order.store?.name ?? null,
      distanceFromDriverKm: o.distanceKm !== null ? round1(o.distanceKm) : null,
      zone: pickupZone,
    },
    dropoff: { address: dropoffZone, zone: dropoffZone },
    distanceKm: o.order.distanceKm,
    cashToCollect: o.order.paymentMethod === 'CASH' ? o.order.total : 0,
    driverEarning: o.order.driverEarning,
  };
}

/* ------------------------------ Divers ------------------------------ */

export type LedgerWithRelations = CashLedgerEntry & {
  driver: User;
  recordedBy: User | null;
  order: { number: number } | null;
};

export function toLedgerDto(e: LedgerWithRelations): CashLedgerEntryDto {
  return {
    id: e.id,
    driverId: e.driverId,
    driverName: e.driver.name,
    type: e.type,
    amount: e.amount,
    balanceAfter: e.balanceAfter,
    orderId: e.orderId,
    orderNumber: e.order?.number ?? null,
    note: e.note,
    recordedBy: e.recordedBy ? { id: e.recordedBy.id, name: e.recordedBy.name } : null,
    createdAt: iso(e.createdAt),
  };
}

export const ledgerInclude = {
  driver: true,
  recordedBy: true,
  order: { select: { number: true } },
} satisfies Prisma.CashLedgerEntryInclude;

export type IncidentWithRelations = Incident & {
  reporter: User;
  resolvedBy: User | null;
  order: { number: number } | null;
};

export const incidentInclude = {
  reporter: true,
  resolvedBy: true,
  order: { select: { number: true } },
} satisfies Prisma.IncidentInclude;

export function toIncidentDto(i: IncidentWithRelations): IncidentDto {
  return {
    id: i.id,
    type: i.type,
    status: i.status,
    description: i.description,
    lat: i.lat,
    lng: i.lng,
    orderId: i.orderId,
    orderNumber: i.order?.number ?? null,
    reporter: { id: i.reporter.id, name: i.reporter.name, phone: i.reporter.phone, role: i.reporter.role },
    resolutionNote: i.resolutionNote,
    resolvedBy: i.resolvedBy ? { id: i.resolvedBy.id, name: i.resolvedBy.name } : null,
    createdAt: iso(i.createdAt),
    resolvedAt: isoOrNull(i.resolvedAt),
  };
}

export function toPricingRuleDto(r: PricingRule): PricingRuleDto {
  return {
    vehicleType: r.vehicleType,
    baseFare: r.baseFare,
    perKm: r.perKm,
    minimumFare: r.minimumFare,
    commissionPercent: r.commissionPercent,
    isActive: r.isActive,
    updatedAt: iso(r.updatedAt),
  };
}

export function toAuditDto(a: AuditLog & { actor: User | null }): AuditLogDto {
  return {
    id: a.id,
    actor: a.actor ? { id: a.actor.id, name: a.actor.name, role: a.actor.role } : null,
    action: a.action,
    entityType: a.entityType,
    entityId: a.entityId,
    metadata:
      a.metadata && typeof a.metadata === 'object' && !Array.isArray(a.metadata)
        ? (a.metadata as Record<string, unknown>)
        : null,
    ip: a.ip,
    createdAt: iso(a.createdAt),
  };
}
