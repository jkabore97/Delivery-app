/**
 * Livraisons demandées par une entreprise (modèle B2B, cf. docs/API.md « Livraisons d'entreprise ») : une
 * entreprise (compte SELLER dont la boutique, validée par la console, sert de profil d'entreprise) fait livrer un
 * colis à un destinataire (particulier ou entreprise) qui n'a pas de compte : il reçoit un lien public de suivi
 * (GET /track/:token) et le code de livraison.
 *
 * La commande est un colis (type PARCEL) rattaché à la boutique de l'entreprise ; l'entreprise en est le
 * « client » (`clientId`) pour les règles de visibilité, sans jamais voir le code de livraison. Elle passe
 * directement en recherche de livreur. Espèces : frais payés par l'entreprise au retrait (SENDER) ou par le
 * destinataire à la livraison (RECIPIENT) ; `cashToCollect` (marchandise) encaissé à la livraison et dû à
 * l'entreprise (`owedToBusiness`, reversement non encore géré).
 */
import { randomBytes } from 'node:crypto';
import type { Prisma, PrismaClient, Store } from '@prisma/client';
import {
  computeDeliveryPrice,
  computeOrderTotals,
  formatFcfa,
  isTerminal,
  roadDistanceKm,
  type AddressDto,
  type BusinessBalanceDto,
  type BusinessSummaryDto,
  type OrderDto,
  type OrderListQuery,
  type Paginated,
  type QuoteResponse,
  type TrackingDto,
  type createDeliverySchema,
  type deliveryQuoteSchema,
} from '@yaar/shared';
import type { z } from 'zod';
import type { AuthUser } from '../lib/auth';
import type { Clock } from '../lib/clock';
import { AppError, notFound } from '../lib/errors';
import { isoOrNull } from '../lib/time';
import type { PaymentRegistry } from '../providers/payment';
import type { RecipientMessage, RecipientNotifier } from '../providers/recipients';
import type { DispatchService } from './dispatch';
import { generateDeliveryCode, quoteOptions, type OrderService } from './orders';
import { ratingStats } from './ratings';
import {
  amountDueFromRecipient,
  firstName,
  isBusinessDelivery,
  toTrackingDto,
  trackingInclude,
  trackingUrlFor,
} from './serializers';
import { transitionOrder } from './transitions';
import type { BackgroundWork } from './work';

type CreateDeliveryInput = z.output<typeof createDeliverySchema>;
type DeliveryQuoteInput = z.output<typeof deliveryQuoteSchema>;

/** Jeton du lien de suivi : 18 octets aléatoires = 144 bits, 24 caractères base64url. */
export const TRACKING_TOKEN_BYTES = 18;
/** Forme acceptée par GET /track/:token (sinon 404 sans requête en base). */
export const TRACKING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;
/** Le lien expire 24 h après la livraison ou l'annulation… */
export const TRACKING_LINK_TTL_MS = 24 * 3600_000;
/** … et dans tous les cas 7 jours après la création (livraison jamais terminée : recherche ou course bloquée). */
export const TRACKING_LINK_MAX_AGE_MS = 7 * 24 * 3600_000;
export const TRACKING_NOT_FOUND = 'Lien de suivi introuvable ou expiré';

export function newTrackingToken(): string {
  return randomBytes(TRACKING_TOKEN_BYTES).toString('base64url');
}

export interface DeliveryServiceOptions {
  publicAppUrl: string;
}

export class DeliveryService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: Clock,
    private readonly orders: OrderService,
    private readonly dispatch: DispatchService,
    private readonly payments: PaymentRegistry,
    private readonly work: BackgroundWork,
    private readonly recipients: RecipientNotifier,
    private readonly opts: DeliveryServiceOptions,
    private readonly warn: (err: unknown, message: string) => void = () => {},
  ) {}

  /**
   * Profil d'entreprise : la boutique validée la plus ancienne du compte (une entreprise = une boutique dans le
   * modèle B2B). 403 STORE_NOT_APPROVED sans boutique ou avant la validation par la console.
   */
  async businessStore(userId: string): Promise<Store> {
    const stores = await this.prisma.store.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'asc' } });
    if (stores.length === 0)
      throw new AppError(403, 'STORE_NOT_APPROVED', 'Renseignez d’abord le profil de votre entreprise (nom, adresse de retrait)');
    const approved = stores.find((s) => s.approvalStatus === 'APPROVED');
    if (!approved)
      throw new AppError(403, 'STORE_NOT_APPROVED', 'Votre entreprise doit être validée par Yaar avant de demander une livraison');
    return approved;
  }

  private pickupOf(store: Store, pickup: DeliveryQuoteInput['pickup']): AddressDto {
    if (pickup) return { ...pickup, landmark: pickup.landmark ?? '' };
    return { lat: store.lat, lng: store.lng, address: store.address, landmark: store.landmark };
  }

  async quote(user: AuthUser, input: DeliveryQuoteInput): Promise<QuoteResponse> {
    const store = await this.businessStore(user.id);
    const pickup = this.pickupOf(store, input.pickup);
    const dropoff: AddressDto = { ...input.dropoff, landmark: input.dropoff.landmark ?? '' };
    const distanceKm = roadDistanceKm(pickup, dropoff);
    const options = quoteOptions(await this.prisma.pricingRule.findMany(), distanceKm, 0);
    if (!options.some((o) => o.available))
      throw new AppError(409, 'PRICING_UNAVAILABLE', 'Aucun tarif actif : contactez le support');
    return { type: 'PARCEL', distanceKm, itemsTotal: 0, pickup, dropoff, paymentMethods: ['CASH'], options };
  }

  /**
   * Crée la livraison (PENDING puis aussitôt SEARCHING_DRIVER, événements enregistrés), lance l'affectation et
   * envoie le lien de suivi au destinataire en arrière-plan (jamais bloquant).
   */
  async create(user: AuthUser, input: CreateDeliveryInput): Promise<OrderDto> {
    const store = await this.businessStore(user.id);
    this.payments.get('CASH').assertAvailable();
    const pickup = this.pickupOf(store, input.pickup);
    const dropoff: AddressDto = { ...input.dropoff, landmark: input.dropoff.landmark ?? '' };
    const distanceKm = roadDistanceKm(pickup, dropoff);
    const rule = await this.prisma.pricingRule.findUnique({ where: { vehicleType: input.vehicleType } });
    if (!rule || !rule.isActive)
      throw new AppError(409, 'PRICING_UNAVAILABLE', 'Ce type de véhicule n’est pas disponible actuellement');
    const price = computeDeliveryPrice(rule, distanceKm);
    // Marchandise encaissée pour l'entreprise : itemsTotal = cashToCollect, sans commission (la plateforme
    // prend sa commission sur les frais de livraison) ; total = frais + marchandise = espèces de la course.
    const totals = computeOrderTotals(price, input.cashToCollect, 0);
    const now = this.clock.now();
    const actor = { id: user.id, role: user.role };
    const token = newTrackingToken();
    const deliveryCode = generateDeliveryCode();

    const created = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          type: 'PARCEL',
          status: 'PENDING',
          clientId: user.id,
          storeId: store.id,
          vehicleType: input.vehicleType,
          pickupLat: pickup.lat,
          pickupLng: pickup.lng,
          pickupAddress: pickup.address,
          pickupLandmark: pickup.landmark,
          dropoffLat: dropoff.lat,
          dropoffLng: dropoff.lng,
          dropoffAddress: dropoff.address,
          dropoffLandmark: dropoff.landmark,
          recipientName: input.recipientName,
          recipientPhone: input.recipientPhone,
          recipientIsBusiness: input.recipientIsBusiness,
          parcelDescription: input.packageDescription,
          notes: input.notes ?? null,
          distanceKm,
          itemsTotal: totals.itemsTotal,
          deliveryFee: totals.deliveryFee,
          commission: totals.commission,
          driverEarning: totals.driverEarning,
          sellerPayout: totals.sellerPayout,
          total: totals.total,
          paymentMethod: 'CASH',
          feePaidBy: input.feePaidBy,
          cashToCollect: input.cashToCollect,
          trackingToken: token,
          deliveryCode,
          createdAt: now,
        },
      });
      await tx.orderEvent.create({
        data: { orderId: order.id, fromStatus: null, toStatus: 'PENDING', actorId: user.id, actorRole: user.role, note: 'Livraison demandée par l’entreprise', createdAt: now },
      });
      await transitionOrder(tx, order, 'SEARCHING_DRIVER', actor, { searchingSince: now }, 'Recherche d’un livreur', now);
      return order;
    });
    await this.payments.get('CASH').initiate({ orderId: created.id, amount: created.total, clientPhone: user.phone });
    await this.orders.notify(created.id);
    await this.dispatch.startSearch(created.id);

    const url = trackingUrlFor(this.opts.publicAppUrl, token);
    const amount = amountDueFromRecipient(created);
    const intro = `Yaar Livraison : ${store.name} vous envoie un colis (${input.packageDescription}). `;
    const toPay =
      amount > 0 ? `À payer au livreur à la réception : ${formatFcfa(amount)} en espèces.` : 'Rien à payer à la réception.';
    await this.sendToRecipient(input.recipientPhone, {
      text: `${intro}Suivez la livraison en direct : ${url} . Code à donner au livreur à la réception : ${deliveryCode}. ${toPay}`,
      logText: `${intro}[lien de suivi et code de livraison masqués] ${toPay}`,
    });
    return this.orders.getDto(created.id, user);
  }

  /** Message au destinataire au retrait du colis (livraisons d'entreprise uniquement). */
  async notifyPickedUp(orderId: string): Promise<void> {
    const o = await this.prisma.order.findUnique({ where: { id: orderId }, include: { store: true, driver: true } });
    if (!o || !isBusinessDelivery(o) || !o.recipientPhone || !o.trackingToken) return;
    const driver = firstName(o.driver?.name ?? null);
    const intro = `Yaar Livraison : votre colis de ${o.store?.name ?? 'votre expéditeur'} est en route${driver ? ` avec ${driver}` : ''}. `;
    await this.sendToRecipient(o.recipientPhone, {
      text: `${intro}Suivi en direct : ${trackingUrlFor(this.opts.publicAppUrl, o.trackingToken)}`,
      logText: `${intro}[lien de suivi masqué]`,
    });
  }

  /**
   * Message au destinataire quand la livraison est annulée (par l'entreprise ou par la console) : il attendait le
   * colis depuis le premier message. Sans le motif (remarque interne de l'entreprise ou du support).
   */
  async notifyCancelled(orderId: string): Promise<void> {
    const o = await this.prisma.order.findUnique({ where: { id: orderId }, include: { store: true } });
    if (!o || !isBusinessDelivery(o) || !o.recipientPhone || o.status !== 'CANCELLED') return;
    const text =
      `Yaar Livraison : la livraison de votre colis de ${o.store?.name ?? 'votre expéditeur'} (n° ${o.number}) a été annulée. ` +
      'Rien à payer. Pour toute question, contactez l’expéditeur.';
    await this.sendToRecipient(o.recipientPhone, { text, logText: text });
  }

  /** Envoi en arrière-plan (keepAlive / waitUntil) : un échec est journalisé, jamais remonté à la requête. */
  private sendToRecipient(phone: string, message: RecipientMessage): Promise<void> {
    return this.work.defer(() => this.recipients.send(phone, message), 0, (err) =>
      this.warn(err, `Message au destinataire non envoyé (${this.recipients.channel})`),
    );
  }

  list(user: AuthUser, q: OrderListQuery): Promise<Paginated<OrderDto>> {
    return this.orders.list(user, q, { requesterId: user.id });
  }

  /**
   * Tableau de bord de l'entreprise (GET /business/summary) : livraisons en cours et chiffres du jour UTC
   * (Ouagadougou = UTC+0), sur les mêmes livraisons que GET /business/deliveries (demandées par ce compte, tous ses
   * établissements). Espèces : même modèle que les sérialiseurs et l'application (`amountsToCollect`) : marchandise
   * = `cashToCollect` (encaissée pour l'entreprise, que Yaar lui reverse), frais = `deliveryFee`. `goodsCollected` est
   * le chiffre du JOUR (reparti de 0 à minuit UTC) : le reversement n'est pas suivi, l'application l'affiche donc
   * « Encaissé pour vous aujourd'hui », jamais « à reverser ».
   */
  async summary(user: AuthUser): Promise<BusinessSummaryDto> {
    const now = this.clock.now();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const end = new Date(start.getTime() + 24 * 3600_000);
    const today = { gte: start, lt: end };
    // Même portée qu'OrderService.list pour un SELLER avec `requesterId` (GET /business/deliveries).
    const mine: Prisma.OrderWhereInput = { clientId: user.id, feePaidBy: { not: null }, store: { ownerId: user.id } };
    const [active, cancelled, delivered] = await Promise.all([
      this.prisma.order.count({ where: { ...mine, status: { notIn: ['DELIVERED', 'CANCELLED'] } } }),
      this.prisma.order.count({ where: { ...mine, status: 'CANCELLED', cancelledAt: today } }),
      this.prisma.order.findMany({
        where: { ...mine, status: 'DELIVERED', deliveredAt: today },
        select: { createdAt: true, deliveredAt: true, cashToCollect: true, deliveryFee: true },
      }),
    ]);
    let durationMs = 0;
    let goodsCollected = 0;
    let deliveryFees = 0;
    for (const o of delivered) {
      durationMs += Math.max(0, (o.deliveredAt ?? o.createdAt).getTime() - o.createdAt.getTime());
      goodsCollected += Math.max(0, o.cashToCollect ?? 0);
      deliveryFees += o.deliveryFee;
    }
    return {
      date: start.toISOString().slice(0, 10),
      active,
      today: {
        delivered: delivered.length,
        cancelled,
        avgDeliveryMinutes: delivered.length > 0 ? Math.round(durationMs / delivered.length / 60_000) : null,
        goodsCollected,
        deliveryFees,
      },
    };
  }

  /**
   * Suivi public : 404 (même réponse) pour un jeton mal formé ou inconnu, 24 h après la livraison ou l'annulation, et
   * 7 jours après la création quel que soit le statut (une livraison jamais terminée n'expose pas indéfiniment le code,
   * l'adresse et la position du livreur).
   */
  async tracking(token: string): Promise<TrackingDto> {
    if (!TRACKING_TOKEN_PATTERN.test(token)) throw notFound(TRACKING_NOT_FOUND);
    const o = await this.prisma.order.findUnique({ where: { trackingToken: token }, include: trackingInclude });
    if (!o || !isBusinessDelivery(o)) throw notFound(TRACKING_NOT_FOUND);
    const now = this.clock.now().getTime();
    if (now - o.createdAt.getTime() > TRACKING_LINK_MAX_AGE_MS) throw notFound(TRACKING_NOT_FOUND);
    if (isTerminal(o.status)) {
      const endedAt = o.deliveredAt ?? o.cancelledAt ?? o.updatedAt;
      if (now - endedAt.getTime() > TRACKING_LINK_TTL_MS) throw notFound(TRACKING_NOT_FOUND);
    }
    const showDriver = (o.status === 'ASSIGNED' || o.status === 'PICKED_UP') && o.driverId !== null;
    const stats = showDriver ? await ratingStats(this.prisma, [o.driverId!]) : null;
    return toTrackingDto(o, { driverRatingAvg: stats?.get(o.driverId!)?.avg ?? null });
  }

  /** Console : ce que la plateforme doit à chaque entreprise (marchandise encaissée), du plus élevé au plus bas. */
  async balances(): Promise<BusinessBalanceDto[]> {
    const rows = await this.prisma.order.groupBy({
      by: ['storeId'],
      where: { status: 'DELIVERED', owedToBusiness: { gt: 0 }, storeId: { not: null } },
      _sum: { owedToBusiness: true },
      _count: { _all: true },
      _max: { deliveredAt: true },
    });
    const ids = rows.map((r) => r.storeId).filter((x): x is string => x !== null);
    const stores = await this.prisma.store.findMany({ where: { id: { in: ids } }, include: { owner: true } });
    const byId = new Map(stores.map((s) => [s.id, s]));
    return rows
      .flatMap((r) => {
        const s = r.storeId ? byId.get(r.storeId) : undefined;
        if (!s) return [];
        return [
          {
            storeId: s.id,
            storeName: s.name,
            ownerId: s.ownerId,
            ownerName: s.owner.name,
            phone: s.phone ?? s.owner.phone,
            owedTotal: r._sum.owedToBusiness ?? 0,
            deliveries: r._count._all,
            lastDeliveredAt: isoOrNull(r._max.deliveredAt),
          },
        ];
      })
      .sort((a, b) => b.owedTotal - a.owedTotal);
  }
}
