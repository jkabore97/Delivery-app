import { randomInt, timingSafeEqual } from 'node:crypto';
import type { Order, OrderStatus, PricingRule, Prisma, PrismaClient } from '@prisma/client';
import {
  CLIENT_CANCELLABLE_STATUSES,
  CONTROLLER_CANCELLABLE_STATUSES,
  CONTROLLER_FORCE_DELIVER_STATUSES,
  DRIVER_ACTIVE_STATUSES,
  MAX_DELIVERY_CODE_ATTEMPTS,
  MAX_UPLOAD_BYTES,
  VEHICLE_TYPES,
  computeDeliveryPrice,
  computeOrderTotals,
  roadDistanceKm,
  type AddressDto,
  type OrderDto,
  type QuoteResponse,
  type createOrderSchema,
  type quoteSchema,
  type deliverOrderSchema,
  type OrderListQuery,
  type Paginated,
  type IncidentDto,
  type OrderMessageDto,
  type QuoteOptionDto,
  type RatingDto,
} from '@yaar/shared';
import type { z } from 'zod';
import type { AuthUser } from '../lib/auth';
import type { Clock } from '../lib/clock';
import { AppError, conflict, forbidden, notFound } from '../lib/errors';
import { decodeUpload, mimeFromKey } from '../lib/files';
import { iso } from '../lib/time';
import { pageArgs } from '../lib/validation';
import type { PaymentRegistry } from '../providers/payment';
import type { Notifier, PushMessage } from '../providers/push';
import { extensionFor, type StorageProvider } from '../providers/storage';
import type { RealtimeHub } from '../realtime/hub';
import { AuditAction, writeAudit } from './audit';
import type { DispatchService } from './dispatch';
import { ratingStats } from './ratings';
import {
  incidentInclude,
  isBusinessDelivery,
  orderDetailInclude,
  orderInclude,
  toIncidentDto,
  toOrderDto,
} from './serializers';
import { transitionOrder, type Actor } from './transitions';

type QuoteInput = z.output<typeof quoteSchema>;
type CreateOrderInput = z.output<typeof createOrderSchema>;
type DeliverInput = z.output<typeof deliverOrderSchema>;
type OrderWithStore = Order & { store: { ownerId: string } | null };

interface ResolvedQuote {
  pickup: AddressDto;
  dropoff: AddressDto;
  distanceKm: number;
  itemsTotal: number;
  storeCommissionPercent: number;
  storeId: string | null;
  items: Array<{ productId: string; name: string; unitPrice: number; quantity: number }>;
}

const toActor = (u: AuthUser): Actor => ({ id: u.id, role: u.role });

/** Statuts depuis lesquels l'entreprise annule elle-même une livraison (avant le retrait du colis). */
export const BUSINESS_CANCELLABLE_STATUSES: readonly OrderStatus[] = ['SEARCHING_DRIVER', 'ASSIGNED'];

/** Espèces encaissées au retrait : frais de livraison payés par l'entreprise (SENDER). */
export function cashAtPickup(o: Pick<Order, 'feePaidBy' | 'deliveryFee' | 'paymentMethod'>): number {
  return o.paymentMethod === 'CASH' && o.feePaidBy === 'SENDER' ? o.deliveryFee : 0;
}

/** Espèces encaissées à la livraison d'une livraison d'entreprise : marchandise + frais si le destinataire paie. */
export function cashAtDelivery(o: Pick<Order, 'feePaidBy' | 'deliveryFee' | 'cashToCollect'>): number {
  return (o.cashToCollect ?? 0) + (o.feePaidBy === 'RECIPIENT' ? o.deliveryFee : 0);
}

export function generateDeliveryCode(): string {
  return randomInt(0, 10_000).toString().padStart(4, '0');
}

/** Options de prix par type de véhicule (devis client et devis d'une livraison d'entreprise). */
export function quoteOptions(rules: PricingRule[], distanceKm: number, itemsTotal: number): QuoteOptionDto[] {
  const byType = new Map(rules.map((x) => [x.vehicleType, x]));
  return VEHICLE_TYPES.map((vt) => {
    const rule = byType.get(vt);
    if (!rule) return { vehicleType: vt, available: false, deliveryFee: 0, total: 0, estimatedMinutes: 0 };
    const price = computeDeliveryPrice(rule, distanceKm);
    return {
      vehicleType: vt,
      available: rule.isActive,
      deliveryFee: price.deliveryFee,
      total: itemsTotal + price.deliveryFee,
      estimatedMinutes: price.estimatedMinutes,
    };
  });
}

/** Notification push à l'entreprise qui a demandé une livraison, à chaque étape. */
function businessPush(o: { number: number; status: OrderStatus; recipientName: string | null }): PushMessage | null {
  const n = `#${o.number}`;
  const to = o.recipientName ? ` à ${o.recipientName}` : '';
  switch (o.status) {
    case 'ASSIGNED':
      return { title: 'Livreur en route', body: `Un livreur vient récupérer la livraison ${n}.` };
    case 'PICKED_UP':
      return { title: 'Colis récupéré', body: `La livraison ${n} est en route${to ? ` vers ${o.recipientName}` : ''}.` };
    case 'DELIVERED':
      return { title: 'Livrée', body: `La livraison ${n} a été remise${to}.` };
    case 'CANCELLED':
      return { title: 'Livraison annulée', body: `La livraison ${n} a été annulée.` };
    default:
      return null;
  }
}

/** Notification push envoyée au client à chaque changement de statut. */
function clientPush(o: { number: number; status: OrderStatus }): PushMessage | null {
  const n = `#${o.number}`;
  switch (o.status) {
    case 'ACCEPTED':
      return { title: 'Commande acceptée', body: `Votre commande ${n} est en préparation.` };
    case 'ASSIGNED':
      return { title: 'Livreur trouvé', body: `Un livreur a accepté votre commande ${n}.` };
    case 'PICKED_UP':
      return { title: 'En route', body: `Votre commande ${n} est en route. Préparez votre code de livraison.` };
    case 'DELIVERED':
      return { title: 'Livrée', body: `Votre commande ${n} a été livrée. Merci d’avoir choisi Yaar !` };
    case 'CANCELLED':
      return { title: 'Commande annulée', body: `Votre commande ${n} a été annulée.` };
    default:
      return null;
  }
}

/**
 * Marge appliquée à `updatedSince` (GET /orders) : une modification écrite juste avant la précédente
 * réponse mais validée (commit) juste après, ou horodatée par une autre instance à l'horloge un peu
 * décalée, n'est pas perdue. Les commandes déjà reçues reviennent : fusion par `id`, sans effet.
 */
export const UPDATED_SINCE_OVERLAP_MS = 2000;

export interface OrderServiceOptions {
  /** Taille maximale d'une photo de preuve décodée (`config.maxUploadBytes`). */
  maxUploadBytes?: number;
  /** URL publique de l'application (liens de suivi des destinataires, `config.publicAppUrl`). */
  publicAppUrl?: string;
}

/** Portée supplémentaire d'une liste de commandes (GET /business/deliveries : livraisons demandées par l'entreprise). */
export interface OrderListScope {
  requesterId?: string;
}

export class OrderService {
  /** Après un retrait (PICKED_UP) : itinéraire vers le destinataire, message au destinataire (app.ts). */
  onPickedUp: (orderId: string) => Promise<void> = async () => {};
  private readonly maxUploadBytes: number;
  private readonly publicAppUrl: string | undefined;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: Clock,
    private readonly realtime: RealtimeHub,
    private readonly dispatch: DispatchService,
    private readonly payments: PaymentRegistry,
    private readonly storage: StorageProvider,
    private readonly notifier: Notifier,
    opts: OrderServiceOptions = {},
  ) {
    this.maxUploadBytes = opts.maxUploadBytes ?? MAX_UPLOAD_BYTES;
    this.publicAppUrl = opts.publicAppUrl;
  }

  /* ----------------------------- Devis ----------------------------- */

  private async resolve(input: QuoteInput): Promise<ResolvedQuote> {
    const dropoff: AddressDto = { ...input.dropoff, landmark: input.dropoff.landmark ?? '' };
    if (input.type === 'PARCEL') {
      const p = input.pickup!;
      const pickup: AddressDto = { ...p, landmark: p.landmark ?? '' };
      return {
        pickup,
        dropoff,
        distanceKm: roadDistanceKm(pickup, dropoff),
        itemsTotal: 0,
        storeCommissionPercent: 0,
        storeId: null,
        items: [],
      };
    }
    const store = await this.prisma.store.findUnique({ where: { id: input.storeId! } });
    if (!store || store.approvalStatus !== 'APPROVED') throw notFound('Boutique introuvable');
    if (!store.isOpen) throw new AppError(409, 'STORE_CLOSED', 'Cette boutique est fermée pour le moment');
    const wanted = input.items ?? [];
    const products = await this.prisma.product.findMany({
      where: { id: { in: wanted.map((i) => i.productId) }, storeId: store.id, isDeleted: false },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const items = wanted.map((w) => {
      const p = byId.get(w.productId);
      if (!p) throw notFound(`Produit introuvable dans cette boutique : ${w.productId}`);
      if (!p.isAvailable) throw new AppError(409, 'PRODUCT_UNAVAILABLE', `« ${p.name} » n’est plus disponible`);
      return { productId: p.id, name: p.name, unitPrice: p.price, quantity: w.quantity };
    });
    const pickup: AddressDto = { lat: store.lat, lng: store.lng, address: store.address, landmark: store.landmark };
    return {
      pickup,
      dropoff,
      distanceKm: roadDistanceKm(pickup, dropoff),
      itemsTotal: items.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
      storeCommissionPercent: store.commissionPercent,
      storeId: store.id,
      items,
    };
  }

  async quote(input: QuoteInput): Promise<QuoteResponse> {
    const r = await this.resolve(input);
    const rules = await this.prisma.pricingRule.findMany();
    const options = quoteOptions(rules, r.distanceKm, r.itemsTotal);
    if (!options.some((o) => o.available))
      throw new AppError(409, 'PRICING_UNAVAILABLE', 'Aucun tarif actif : contactez le support');
    return {
      type: input.type,
      distanceKm: r.distanceKm,
      itemsTotal: r.itemsTotal,
      pickup: r.pickup,
      dropoff: r.dropoff,
      paymentMethods: ['CASH'],
      options,
    };
  }

  /* ----------------------------- Création ----------------------------- */

  async create(client: AuthUser, input: CreateOrderInput): Promise<OrderDto> {
    this.payments.get(input.paymentMethod).assertAvailable();
    const r = await this.resolve(input);
    const rule = await this.prisma.pricingRule.findUnique({ where: { vehicleType: input.vehicleType } });
    if (!rule || !rule.isActive)
      throw new AppError(409, 'PRICING_UNAVAILABLE', 'Ce type de véhicule n’est pas disponible actuellement');
    const price = computeDeliveryPrice(rule, r.distanceKm);
    const totals = computeOrderTotals(price, r.itemsTotal, r.storeCommissionPercent);
    const now = this.clock.now();
    const actor = toActor(client);

    const created = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          type: input.type,
          status: 'PENDING',
          clientId: client.id,
          storeId: r.storeId,
          vehicleType: input.vehicleType,
          pickupLat: r.pickup.lat,
          pickupLng: r.pickup.lng,
          pickupAddress: r.pickup.address,
          pickupLandmark: r.pickup.landmark,
          dropoffLat: r.dropoff.lat,
          dropoffLng: r.dropoff.lng,
          dropoffAddress: r.dropoff.address,
          dropoffLandmark: r.dropoff.landmark,
          recipientName: input.recipientName ?? null,
          recipientPhone: input.recipientPhone ?? null,
          parcelDescription: input.parcelDescription ?? null,
          notes: input.notes ?? null,
          distanceKm: r.distanceKm,
          itemsTotal: totals.itemsTotal,
          deliveryFee: totals.deliveryFee,
          commission: totals.commission,
          driverEarning: totals.driverEarning,
          sellerPayout: totals.sellerPayout,
          total: totals.total,
          paymentMethod: input.paymentMethod,
          deliveryCode: generateDeliveryCode(),
          createdAt: now,
          items: { create: r.items },
        },
      });
      await tx.orderEvent.create({
        data: { orderId: order.id, fromStatus: null, toStatus: 'PENDING', actorId: client.id, actorRole: client.role, createdAt: now },
      });
      if (input.type === 'PARCEL') {
        await transitionOrder(tx, order, 'SEARCHING_DRIVER', actor, { searchingSince: now }, 'Colis : recherche d’un livreur', now);
      }
      return order;
    });
    await this.payments.get(input.paymentMethod).initiate({
      orderId: created.id,
      amount: created.total,
      clientPhone: client.phone,
    });
    await this.notify(created.id);
    if (input.type === 'PARCEL') await this.dispatch.startSearch(created.id);
    return this.getDto(created.id, client);
  }

  /* ----------------------------- Lecture ----------------------------- */

  /** Vérifie l'accès ; renvoie 404 (et non 403) pour ne pas révéler l'existence de la commande. */
  private assertCanView(o: OrderWithStore, viewer: AuthUser): void {
    switch (viewer.role) {
      case 'CONTROLLER':
      case 'ADMIN':
        return;
      case 'CLIENT':
        if (o.clientId === viewer.id) return;
        break;
      case 'SELLER':
        // Boutique du vendeur, ou entreprise qui a demandé la livraison.
        if (o.store?.ownerId === viewer.id || (isBusinessDelivery(o) && o.clientId === viewer.id)) return;
        break;
      case 'DRIVER':
        if (o.driverId === viewer.id) return;
        break;
    }
    throw notFound('Commande introuvable');
  }

  async getDto(id: string, viewer: AuthUser): Promise<OrderDto> {
    const o = await this.prisma.order.findUnique({ where: { id }, include: orderDetailInclude });
    if (!o) throw notFound('Commande introuvable');
    this.assertCanView(o, viewer);
    const stats = o.driverId ? await ratingStats(this.prisma, [o.driverId]) : new Map();
    return toOrderDto(o, viewer, {
      driverRatingAvg: o.driverId ? (stats.get(o.driverId)?.avg ?? null) : null,
      publicAppUrl: this.publicAppUrl,
    });
  }

  async list(viewer: AuthUser, q: OrderListQuery, scope: OrderListScope = {}): Promise<Paginated<OrderDto>> {
    const where: Prisma.OrderWhereInput = {};
    if (scope.requesterId) {
      where.clientId = scope.requesterId;
      where.feePaidBy = { not: null };
    }
    if (q.updatedSince) {
      // Synchronisation incrémentale (mode poll) : TOUTES les commandes de l'appelant modifiées depuis
      // `updatedSince` moins une marge, quel que soit `status` (une commande qui sort de la liste suivie,
      // ex. DELIVERED, doit être vue pour être retirée). Le client fusionne par `id`.
      where.updatedAt = { gte: new Date(Date.parse(q.updatedSince) - UPDATED_SINCE_OVERLAP_MS) };
    } else if (q.status?.length) {
      where.status = { in: q.status };
    }
    if (q.type) where.type = q.type;
    switch (viewer.role) {
      case 'CLIENT':
        where.clientId = viewer.id;
        break;
      case 'SELLER':
        where.store = { ownerId: viewer.id };
        break;
      case 'DRIVER':
        where.driverId = viewer.id;
        break;
      default:
        if (q.q) {
          const n = Number.parseInt(q.q.replace(/^#/, ''), 10);
          where.OR = [
            ...(Number.isFinite(n) ? [{ number: n }] : []),
            { client: { phone: { contains: q.q } } },
            { client: { name: { contains: q.q, mode: 'insensitive' as const } } },
          ];
        }
    }
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        // Avec updatedSince : du plus ancien changement au plus récent, pour que le plus grand `updatedAt`
        // reçu ne fasse sauter aucun changement (au-delà d'une page, le client recharge sa liste : docs/API.md).
        orderBy: q.updatedSince ? [{ updatedAt: 'asc' }, { id: 'asc' }] : { createdAt: 'desc' },
        ...pageArgs(q),
      }),
      this.prisma.order.count({ where }),
    ]);
    const driverIds = [...new Set(rows.map((r) => r.driverId).filter((x): x is string => !!x))];
    const stats = await ratingStats(this.prisma, driverIds);
    return {
      // Listes : sans tracé (charge utile réduite) ; GET /orders/:id renvoie l'itinéraire.
      items: rows.map((o) =>
        toOrderDto(o, viewer, {
          driverRatingAvg: o.driverId ? (stats.get(o.driverId)?.avg ?? null) : null,
          publicAppUrl: this.publicAppUrl,
          includeRoute: false,
        }),
      ),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }

  /**
   * Émet `order.updated` vers toutes les parties prenantes, puis les notifications push
   * (client à chaque étape, vendeur pour une nouvelle commande ou une annulation).
   */
  async notify(orderId: string): Promise<void> {
    const o = await this.prisma.order.findUnique({ where: { id: orderId }, include: { store: true } });
    if (!o) return;
    this.emitOrderUpdated(o);
    const business = isBusinessDelivery(o);
    // Livraison d'entreprise : le « client » de la commande est l'entreprise elle-même.
    const forClient = business ? businessPush(o) : clientPush(o);
    const data = { orderId: o.id, status: o.status };
    if (forClient) void this.notifier.toUser(o.clientId, { ...forClient, data });
    const sellerId = business ? null : o.store?.ownerId;
    if (sellerId && o.status === 'PENDING')
      void this.notifier.toUser(sellerId, { title: 'Nouvelle commande', body: `Commande #${o.number} à accepter.`, data });
    if (sellerId && o.status === 'CANCELLED')
      void this.notifier.toUser(sellerId, { title: 'Commande annulée', body: `La commande #${o.number} a été annulée.`, data });
  }

  /** `order.updated` seul, sans notification push (nouvel itinéraire : les abonnés rechargent la commande). */
  async emitUpdated(orderId: string): Promise<void> {
    const o = await this.prisma.order.findUnique({ where: { id: orderId }, include: { store: true } });
    if (o) this.emitOrderUpdated(o);
  }

  private emitOrderUpdated(o: Order & { store: { ownerId: string } | null }): void {
    this.realtime.orderUpdated(
      { orderId: o.id, clientId: o.clientId, sellerId: o.store?.ownerId ?? null, driverId: o.driverId },
      { orderId: o.id, number: o.number, status: o.status, driverId: o.driverId, updatedAt: iso(o.updatedAt) },
    );
  }

  /* ----------------------------- Vendeur ----------------------------- */

  private async loadForSeller(id: string, seller: AuthUser) {
    const o = await this.prisma.order.findUnique({ where: { id }, include: { store: true } });
    if (!o || o.store?.ownerId !== seller.id) throw notFound('Commande introuvable');
    return o;
  }

  async sellerAccept(id: string, seller: AuthUser, prepTimeMinutes?: number): Promise<OrderDto> {
    const o = await this.loadForSeller(id, seller);
    const prep = prepTimeMinutes ?? o.store?.prepTimeMinutes ?? 15;
    await this.prisma.$transaction((tx) =>
      transitionOrder(tx, o, 'ACCEPTED', toActor(seller), { acceptedAt: this.clock.now(), prepTimeMinutes: prep }, `Préparation : ${prep} min`, this.clock.now()),
    );
    await this.notify(id);
    return this.getDto(id, seller);
  }

  async sellerReject(id: string, seller: AuthUser, reason: string): Promise<OrderDto> {
    const o = await this.loadForSeller(id, seller);
    if (o.status !== 'PENDING') throw new AppError(409, 'INVALID_TRANSITION', 'Seule une nouvelle commande peut être refusée');
    await this.prisma.$transaction((tx) =>
      transitionOrder(
        tx,
        o,
        'CANCELLED',
        toActor(seller),
        { cancelledAt: this.clock.now(), cancelReason: `Refusée par le vendeur : ${reason}`, paymentStatus: 'CANCELLED' },
        reason,
        this.clock.now(),
      ),
    );
    await this.notify(id);
    return this.getDto(id, seller);
  }

  /** La commande est prête : passage READY puis immédiatement SEARCHING_DRIVER (appel d'un livreur). */
  async sellerReady(id: string, seller: AuthUser): Promise<OrderDto> {
    const o = await this.loadForSeller(id, seller);
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      const ready = await transitionOrder(tx, o, 'READY', toActor(seller), { readyAt: now }, undefined, now);
      await transitionOrder(tx, ready, 'SEARCHING_DRIVER', toActor(seller), { searchingSince: now }, 'Appel d’un livreur', now);
    });
    await this.notify(id);
    await this.dispatch.startSearch(id);
    return this.getDto(id, seller);
  }

  /* ----------------------------- Annulation ----------------------------- */

  async cancel(id: string, user: AuthUser, reason: string | undefined, ip?: string): Promise<OrderDto> {
    const o = await this.prisma.order.findUnique({ where: { id }, include: { store: true } });
    if (!o) throw notFound('Commande introuvable');
    const isController = user.role === 'CONTROLLER' || user.role === 'ADMIN';
    const isRequester = user.role === 'SELLER' && isBusinessDelivery(o) && o.clientId === user.id;
    if (isRequester) {
      // Entreprise : annulation possible tant que le colis n'est pas récupéré (le livreur en route est libéré).
      if (!BUSINESS_CANCELLABLE_STATUSES.includes(o.status))
        throw new AppError(409, 'INVALID_TRANSITION', 'Le colis a déjà été récupéré : contactez le support pour annuler');
    } else if (!isController) {
      if (user.role !== 'CLIENT' || o.clientId !== user.id) throw notFound('Commande introuvable');
      if (!CLIENT_CANCELLABLE_STATUSES.includes(o.status))
        throw new AppError(409, 'INVALID_TRANSITION', 'La commande ne peut plus être annulée : contactez le support');
    } else if (!CONTROLLER_CANCELLABLE_STATUSES.includes(o.status)) {
      throw new AppError(409, 'INVALID_TRANSITION', 'La commande ne peut plus être annulée');
    }
    await this.dispatch.cancelOpenOffers(id);
    const now = this.clock.now();
    const afterPickup = o.status === 'PICKED_UP';
    let incident: IncidentDto | null = null;
    await this.prisma.$transaction(async (tx) => {
      await transitionOrder(
        tx,
        o,
        'CANCELLED',
        toActor(user),
        {
          cancelledAt: now,
          cancelReason: reason ?? (isController ? 'Annulée par le support' : isRequester ? 'Annulée par l’entreprise' : 'Annulée par le client'),
          paymentStatus: 'CANCELLED',
        },
        reason,
        now,
      );
      if (o.driverId) await tx.driverProfile.update({ where: { userId: o.driverId }, data: { isBusy: false } });
      if (isController)
        await writeAudit(tx, {
          actorId: user.id,
          action: AuditAction.ORDER_CANCELLED_BY_CONTROLLER,
          entityType: 'Order',
          entityId: id,
          metadata: { reason: reason ?? null, previousStatus: o.status },
          ip: ip ?? null,
        });
      // Annulation après retrait : la marchandise est chez le livreur, un incident est ouvert pour le suivi.
      if (afterPickup) {
        const inc = await tx.incident.create({
          data: {
            type: 'OTHER',
            reporterId: user.id,
            orderId: id,
            description: `Course #${o.number} annulée après retrait par la console : récupérer la marchandise auprès du livreur. Motif : ${reason ?? 'non précisé'}`,
            createdAt: now,
          },
          include: incidentInclude,
        });
        incident = toIncidentDto(inc);
      }
    });
    await this.notify(id);
    if (incident) this.realtime.incidentUpdated(incident);
    if (o.driverId) await this.releaseDriver(id, o.driverId);
    return this.getDto(id, user);
  }

  /** Après une course terminée ou annulée : le livreur quitte la salle de la commande et redevient libre. */
  private async releaseDriver(orderId: string, driverId: string): Promise<void> {
    this.realtime.evictFromOrder(orderId, driverId);
    const p = await this.prisma.driverProfile.findUnique({ where: { userId: driverId } });
    if (p) this.realtime.driverStatus({ driverId, isOnline: p.isOnline, isBusy: p.isBusy });
  }

  /* ----------------------------- Livreur ----------------------------- */

  private async loadForDriver(id: string, driver: AuthUser) {
    const o = await this.prisma.order.findUnique({ where: { id } });
    if (!o || o.driverId !== driver.id) throw notFound('Commande introuvable');
    return o;
  }

  async pickup(id: string, driver: AuthUser): Promise<OrderDto> {
    const o = await this.loadForDriver(id, driver);
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      await transitionOrder(tx, o, 'PICKED_UP', toActor(driver), { pickedUpAt: now }, undefined, now);
      // Livraison d'entreprise, frais payés par l'expéditeur : encaissés en espèces au retrait.
      const atPickup = cashAtPickup(o);
      if (atPickup > 0) await this.collectCash(tx, o, driver.id, atPickup, now, `Frais de livraison payés par l’expéditeur, livraison #${o.number}`);
    });
    await this.notify(id);
    await this.onPickedUp(id);
    return this.getDto(id, driver);
  }

  /** Encaissement en espèces par le livreur : solde détenu + écriture COLLECTION du journal de caisse. */
  private async collectCash(
    tx: Prisma.TransactionClient,
    o: Order,
    driverId: string,
    amount: number,
    now: Date,
    note: string,
  ): Promise<void> {
    const profile = await tx.driverProfile.update({ where: { userId: driverId }, data: { cashHeld: { increment: amount } } });
    await tx.cashLedgerEntry.create({
      data: { driverId, type: 'COLLECTION', amount, balanceAfter: profile.cashHeld, orderId: o.id, note, createdAt: now },
    });
  }

  /**
   * Livraison : le livreur saisit le code donné par le client. Pour un paiement en espèces,
   * le montant total est ajouté au solde d'espèces du livreur (journal de caisse).
   *
   * Anti-fraude : l'essai est réservé de façon atomique (UPDATE … WHERE essais < 5) AVANT la
   * comparaison, si bien que des requêtes parallèles ne peuvent pas dépasser 5 essais au total.
   */
  async deliver(id: string, driver: AuthUser, input: DeliverInput): Promise<OrderDto> {
    const o = await this.loadForDriver(id, driver);
    if (o.status !== 'PICKED_UP')
      throw new AppError(409, 'INVALID_TRANSITION', 'Confirmez d’abord la récupération de la commande');
    const reserved = await this.prisma.order.updateMany({
      where: { id, driverId: driver.id, status: 'PICKED_UP', deliveryCodeAttempts: { lt: MAX_DELIVERY_CODE_ATTEMPTS } },
      data: { deliveryCodeAttempts: { increment: 1 } },
    });
    if (reserved.count === 0) {
      const fresh = await this.loadForDriver(id, driver);
      if (fresh.status !== 'PICKED_UP')
        throw new AppError(409, 'INVALID_TRANSITION', 'La commande n’est plus en cours de livraison');
      throw new AppError(423, 'DELIVERY_CODE_LOCKED', 'Trop d’essais : contactez le support pour valider la livraison');
    }
    const ok =
      input.code.length === o.deliveryCode.length &&
      timingSafeEqual(Buffer.from(input.code), Buffer.from(o.deliveryCode));
    if (!ok) {
      const after = await this.prisma.order.findUnique({ where: { id }, select: { deliveryCodeAttempts: true } });
      const left = MAX_DELIVERY_CODE_ATTEMPTS - (after?.deliveryCodeAttempts ?? MAX_DELIVERY_CODE_ATTEMPTS);
      throw new AppError(400, 'DELIVERY_CODE_INVALID', `Code de livraison incorrect (${Math.max(0, left)} essai(s) restant(s))`);
    }

    const now = this.clock.now();
    let proofKey: string | null = null;
    if (input.proofPhoto) {
      const buf = decodeUpload(input.proofPhoto.dataBase64, input.proofPhoto.mimeType, this.maxUploadBytes);
      proofKey = `proofs/${id}-${now.getTime()}.${extensionFor(input.proofPhoto.mimeType)}`;
      await this.storage.put(proofKey, buf);
    }
    await this.prisma.$transaction((tx) => this.completeDelivery(tx, o, toActor(driver), now, { proofKey }));
    await this.notify(id);
    await this.releaseDriver(id, driver.id);
    return this.getDto(id, driver);
  }

  /**
   * Passage DELIVERED + journal de caisse (espèces) + livreur libéré.
   * Livraison d'entreprise : encaissement à la livraison = marchandise (`cashToCollect`) + frais si le
   * destinataire les paie (sinon déjà encaissés au retrait) ; `cashCollected` = tout ce que le livreur a encaissé
   * pour la course ; `owedToBusiness` = marchandise encaissée pour le compte de l'entreprise.
   */
  private async completeDelivery(
    tx: Prisma.TransactionClient,
    o: Order,
    actor: Actor,
    now: Date,
    opts: { proofKey?: string | null; note?: string },
  ): Promise<void> {
    const driverId = o.driverId;
    if (!driverId) throw conflict('Aucun livreur affecté à cette commande');
    const isCash = o.paymentMethod === 'CASH';
    const business = isBusinessDelivery(o);
    const atDelivery = isCash ? (business ? cashAtDelivery(o) : o.total) : 0;
    await transitionOrder(
      tx,
      o,
      'DELIVERED',
      actor,
      {
        deliveredAt: now,
        proofPhotoKey: opts.proofKey ?? null,
        paymentStatus: 'PAID',
        cashCollected: isCash ? o.total : null,
        ...(business ? { owedToBusiness: o.cashToCollect ?? 0 } : {}),
      },
      opts.note,
      now,
    );
    await tx.driverProfile.update({ where: { userId: driverId }, data: { isBusy: false } });
    if (atDelivery > 0) {
      const note = business
        ? `Encaissement à la livraison #${o.number} (marchandise ${o.cashToCollect ?? 0} FCFA${o.feePaidBy === 'RECIPIENT' ? ` + frais ${o.deliveryFee} FCFA` : ''})`
        : `Encaissement commande #${o.number}`;
      await this.collectCash(tx, o, driverId, atDelivery, now, note);
    }
  }

  /* ----------------------------- Reprise par la console ----------------------------- */

  /**
   * Livraison forcée par un contrôleur (code bloqué, client joint par téléphone…). Même effet
   * qu'une livraison normale (journal de caisse compris), journalisée dans l'audit.
   */
  async forceDeliver(id: string, controller: AuthUser, reason: string, ip?: string): Promise<OrderDto> {
    const o = await this.prisma.order.findUnique({ where: { id } });
    if (!o) throw notFound('Commande introuvable');
    if (!CONTROLLER_FORCE_DELIVER_STATUSES.includes(o.status))
      throw new AppError(409, 'INVALID_TRANSITION', 'Seule une commande récupérée par le livreur peut être validée');
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      await this.completeDelivery(tx, o, toActor(controller), now, { note: `Livraison validée par le support : ${reason}` });
      await writeAudit(tx, {
        actorId: controller.id,
        action: AuditAction.ORDER_FORCE_DELIVERED,
        entityType: 'Order',
        entityId: id,
        metadata: { reason, driverId: o.driverId, deliveryCodeAttempts: o.deliveryCodeAttempts },
        ip: ip ?? null,
      });
    });
    await this.notify(id);
    if (o.driverId) await this.releaseDriver(id, o.driverId);
    return this.getDto(id, controller);
  }

  /** Remet à zéro le compteur d'essais du code de livraison (après vérification par le support). */
  async resetDeliveryCode(id: string, controller: AuthUser, reason: string | undefined, ip?: string): Promise<OrderDto> {
    const o = await this.prisma.order.findUnique({ where: { id } });
    if (!o) throw notFound('Commande introuvable');
    if (o.status !== 'PICKED_UP')
      throw new AppError(409, 'INVALID_TRANSITION', 'Le code ne peut être débloqué que pendant la livraison');
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id }, data: { deliveryCodeAttempts: 0 } });
      await writeAudit(tx, {
        actorId: controller.id,
        action: AuditAction.ORDER_DELIVERY_CODE_RESET,
        entityType: 'Order',
        entityId: id,
        metadata: { reason: reason ?? null, previousAttempts: o.deliveryCodeAttempts },
        ip: ip ?? null,
      });
    });
    return this.getDto(id, controller);
  }

  /* ----------------------------- Messagerie client ↔ livreur ----------------------------- */

  private async loadForMessages(id: string, user: AuthUser) {
    const o = await this.prisma.order.findUnique({ where: { id } });
    if (!o) throw notFound('Commande introuvable');
    const back = user.role === 'CONTROLLER' || user.role === 'ADMIN';
    const isClient = user.role === 'CLIENT' && o.clientId === user.id;
    const isDriver = user.role === 'DRIVER' && o.driverId === user.id;
    // Le livreur n'a accès à la conversation que pendant la course (même règle que les adresses).
    if (!back && !isClient && !(isDriver && DRIVER_ACTIVE_STATUSES.includes(o.status))) throw notFound('Commande introuvable');
    return { o, back, isClient, isDriver };
  }

  async listMessages(id: string, user: AuthUser): Promise<OrderMessageDto[]> {
    await this.loadForMessages(id, user);
    const rows = await this.prisma.orderMessage.findMany({
      where: { orderId: id },
      include: { sender: true },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return rows.map((m) => ({
      id: m.id,
      orderId: m.orderId,
      sender: { id: m.sender.id, name: m.sender.name, role: m.senderRole },
      body: m.body,
      createdAt: iso(m.createdAt),
    }));
  }

  async postMessage(id: string, user: AuthUser, body: string): Promise<OrderMessageDto> {
    const { o, isClient, isDriver } = await this.loadForMessages(id, user);
    if (!isClient && !isDriver) throw forbidden('Seuls le client et le livreur échangent des messages');
    if (!DRIVER_ACTIVE_STATUSES.includes(o.status) || !o.driverId)
      throw new AppError(409, 'ORDER_NOT_ACTIVE', 'La messagerie est ouverte uniquement pendant la course');
    const m = await this.prisma.orderMessage.create({
      data: { orderId: id, senderId: user.id, senderRole: user.role, body, createdAt: this.clock.now() },
    });
    const dto: OrderMessageDto = {
      id: m.id,
      orderId: id,
      sender: { id: user.id, name: user.name, role: user.role },
      body: m.body,
      createdAt: iso(m.createdAt),
    };
    this.realtime.orderMessage([o.clientId, o.driverId], dto);
    const recipient = isClient ? o.driverId : o.clientId;
    void this.notifier.toUser(recipient, {
      title: isClient ? 'Message du client' : 'Message du livreur',
      body: body.length > 120 ? `${body.slice(0, 117)}…` : body,
      data: { orderId: id, type: 'order.message' },
    });
    return dto;
  }

  /** Photo de preuve (client propriétaire, livreur affecté, contrôleurs). */
  async proofPhoto(id: string, viewer: AuthUser, ip?: string): Promise<{ data: Buffer; mimeType: string }> {
    const o = await this.prisma.order.findUnique({ where: { id }, include: { store: true } });
    if (!o) throw notFound('Commande introuvable');
    this.assertCanView(o, viewer);
    // Vendeur : pas de photo du client ; l'entreprise qui a demandé la livraison voit sa preuve de remise.
    if (viewer.role === 'SELLER' && !(isBusinessDelivery(o) && o.clientId === viewer.id)) throw forbidden();
    if (!o.proofPhotoKey) throw notFound('Pas de photo de preuve pour cette commande');
    if (viewer.role === 'CONTROLLER' || viewer.role === 'ADMIN') {
      await writeAudit(this.prisma, {
        actorId: viewer.id,
        action: AuditAction.ORDER_PROOF_VIEWED,
        entityType: 'Order',
        entityId: id,
        ip: ip ?? null,
      });
    }
    return { data: await this.storage.get(o.proofPhotoKey), mimeType: mimeFromKey(o.proofPhotoKey) };
  }

  /* ----------------------------- Notes et litiges ----------------------------- */

  async rate(id: string, user: AuthUser, score: number, comment?: string): Promise<RatingDto> {
    const o = await this.prisma.order.findUnique({ where: { id } });
    if (!o) throw notFound('Commande introuvable');
    let toUserId: string | null = null;
    if (user.role === 'CLIENT' && o.clientId === user.id) toUserId = o.driverId;
    else if (user.role === 'DRIVER' && o.driverId === user.id) toUserId = o.clientId;
    else throw notFound('Commande introuvable');
    if (o.status !== 'DELIVERED' || !toUserId)
      throw new AppError(409, 'INVALID_TRANSITION', 'La notation est possible après la livraison');
    const existing = await this.prisma.rating.findUnique({ where: { orderId_fromUserId: { orderId: id, fromUserId: user.id } } });
    if (existing) throw conflict('Vous avez déjà noté cette course', 'ALREADY_RATED');
    const r = await this.prisma.rating.create({
      data: { orderId: id, fromUserId: user.id, toUserId, score, comment: comment ?? null, createdAt: this.clock.now() },
    });
    return {
      id: r.id,
      orderId: r.orderId,
      fromUserId: r.fromUserId,
      toUserId: r.toUserId,
      score: r.score,
      comment: r.comment,
      createdAt: iso(r.createdAt),
    };
  }

  async dispute(id: string, user: AuthUser, description: string): Promise<IncidentDto> {
    const o = await this.prisma.order.findUnique({ where: { id }, include: { store: true } });
    if (!o) throw notFound('Commande introuvable');
    this.assertCanView(o, user);
    const incident = await this.prisma.incident.create({
      data: { type: 'DISPUTE', reporterId: user.id, orderId: id, description, createdAt: this.clock.now() },
      include: incidentInclude,
    });
    const dto = toIncidentDto(incident);
    this.realtime.incidentUpdated(dto);
    return dto;
  }
}
