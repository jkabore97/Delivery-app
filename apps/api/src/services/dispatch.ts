import type { DriverProfile, OrderStatus, OrderType, PrismaClient, User } from '@prisma/client';
import { haversineKm, type DriverCandidateDto, type VehicleType } from '@yaar/shared';
import type { Clock } from '../lib/clock';
import { AppError, conflict, notFound } from '../lib/errors';
import type { Notifier } from '../providers/push';
import type { RealtimeHub } from '../realtime/hub';
import { AuditAction, writeAudit } from './audit';
import { toOfferDto } from './serializers';
import { transitionOrder, type Actor } from './transitions';

export interface DispatchConfig {
  radiusKm: number;
  offerTimeoutSeconds: number;
  cashLimit: number;
  /** Délai avant de reproposer la même commande à un livreur qui l'a refusée / laissée expirer. */
  reofferCooldownSeconds: number;
  /** Un livreur en ligne sans position depuis ce délai n'est plus sollicité puis est remis hors ligne. */
  staleMinutes: number;
}

export interface Candidate {
  profile: DriverProfile & { user: User };
  distanceKm: number;
}

export interface TickResult {
  expired: number;
  offered: number;
  /** Livreurs remis hors ligne faute de position récente. */
  staleOffline: number;
}

/**
 * Affectation des courses : propose la commande au livreur APPROUVÉ, en ligne, libre,
 * sous le plafond d'espèces, avec le bon type de véhicule, le plus proche du point de retrait
 * (dans le rayon). Une offre expire après `offerTimeoutSeconds`, puis le livreur suivant est sollicité.
 * L'horloge est injectée pour les tests ; `tick()` est appelé périodiquement par le serveur.
 */
export class DispatchService {
  /** Appelé après une affectation (pour notifier les abonnés de la commande). */
  onAssigned: (orderId: string) => Promise<void> = async () => {};

  /** File d'exécution : une seule création d'offre à la fois (pas de doublon d'offres ouvertes). */
  private queue: Promise<unknown> = Promise.resolve();
  /** Cycle en cours (un seul `tick()` à la fois). */
  private running: Promise<TickResult> | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: Clock,
    private readonly realtime: RealtimeHub,
    private readonly cfg: DispatchConfig,
    private readonly notifier: Notifier | null = null,
  ) {}

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private staleCutoff(now: Date): Date {
    return new Date(now.getTime() - this.cfg.staleMinutes * 60_000);
  }

  /** Livreurs éligibles pour une commande, triés par distance croissante. */
  async findCandidates(
    order: { id: string; vehicleType: VehicleType; pickupLat: number; pickupLng: number },
    excludeDriverIds: string[] = [],
  ): Promise<Candidate[]> {
    const now = this.clock.now();
    const busyWithOffer = await this.prisma.dispatchOffer.findMany({
      where: { status: 'OFFERED', expiresAt: { gt: now } },
      select: { driverId: true },
    });
    const exclude = new Set([...excludeDriverIds, ...busyWithOffer.map((o) => o.driverId)]);
    const profiles = await this.prisma.driverProfile.findMany({
      where: {
        status: 'APPROVED',
        isOnline: true,
        isBusy: false,
        vehicleType: order.vehicleType,
        cashHeld: { lt: this.cfg.cashLimit },
        lastLat: { not: null },
        lastLng: { not: null },
        lastLocationAt: { gte: this.staleCutoff(now) },
        user: { isSuspended: false },
        userId: { notIn: [...exclude] },
      },
      include: { user: true },
    });
    const pickup = { lat: order.pickupLat, lng: order.pickupLng };
    return profiles
      .map((p) => ({ profile: p, distanceKm: haversineKm(pickup, { lat: p.lastLat!, lng: p.lastLng! }) }))
      .filter((c) => c.distanceKm <= this.cfg.radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }

  /**
   * Propose la commande au prochain livreur éligible. Renvoie l'id de l'offre créée ou null.
   * Les appels sont sérialisés : un livreur ne reçoit jamais deux offres ouvertes, ni une commande
   * deux offres simultanées (Lot 1 : une seule instance d'API).
   */
  offerNext(orderId: string): Promise<string | null> {
    return this.serial(() => this.offerNextUnlocked(orderId));
  }

  private async offerNextUnlocked(orderId: string): Promise<string | null> {
    const now = this.clock.now();
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.status !== 'SEARCHING_DRIVER') return null;
    const active = await this.prisma.dispatchOffer.findFirst({
      where: { orderId, status: 'OFFERED', expiresAt: { gt: now } },
    });
    if (active) return null;

    const cooldownStart = new Date(now.getTime() - this.cfg.reofferCooldownSeconds * 1000);
    const recent = await this.prisma.dispatchOffer.findMany({
      where: { orderId, status: { in: ['REJECTED', 'EXPIRED'] }, respondedAt: { gte: cooldownStart } },
      select: { driverId: true },
    });
    const candidates = await this.findCandidates(order, recent.map((r) => r.driverId));
    const best = candidates[0];
    if (!best) return null;

    const offer = await this.prisma.dispatchOffer.create({
      data: {
        orderId,
        driverId: best.profile.userId,
        distanceKm: best.distanceKm,
        offeredAt: now,
        expiresAt: new Date(now.getTime() + this.cfg.offerTimeoutSeconds * 1000),
      },
      include: { order: { include: { store: true } } },
    });
    this.realtime.offerNew(offer.driverId, toOfferDto(offer));
    if (this.notifier)
      void this.notifier.toUser(offer.driverId, {
        title: 'Nouvelle course',
        body: `Course #${offer.order.number} à ${Math.round(best.distanceKm * 10) / 10} km : répondez dans ${this.cfg.offerTimeoutSeconds} s.`,
        data: { offerId: offer.id, orderId, type: 'offer.new' },
      });
    return offer.id;
  }

  /** Lance la recherche pour une commande qui vient de passer en SEARCHING_DRIVER. */
  async startSearch(orderId: string): Promise<string | null> {
    return this.offerNext(orderId);
  }

  /** Expire les offres échues puis relance la recherche pour toutes les commandes en attente. */
  tick(): Promise<TickResult> {
    if (this.running) return this.running;
    this.running = this.runTick().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runTick(): Promise<TickResult> {
    const now = this.clock.now();
    const staleOffline = await this.timeoutStaleDrivers(now);
    const expired = await this.prisma.dispatchOffer.findMany({
      where: { status: 'OFFERED', expiresAt: { lte: now } },
    });
    for (const o of expired) {
      const r = await this.prisma.dispatchOffer.updateMany({
        where: { id: o.id, status: 'OFFERED' },
        data: { status: 'EXPIRED', respondedAt: now },
      });
      if (r.count > 0) this.realtime.offerClosed(o.driverId, { offerId: o.id, orderId: o.orderId, status: 'EXPIRED' });
    }
    const waiting = await this.prisma.order.findMany({
      where: { status: 'SEARCHING_DRIVER' },
      orderBy: { searchingSince: 'asc' },
      select: { id: true },
    });
    let offered = 0;
    for (const w of waiting) {
      if (await this.offerNext(w.id)) offered++;
    }
    return { expired: expired.length, offered, staleOffline };
  }

  /**
   * Livreurs « en ligne » dont l'application ne donne plus de position (application tuée, réseau
   * perdu) : remis hors ligne et dernière position effacée. Les livreurs en course ne sont pas touchés.
   */
  private async timeoutStaleDrivers(now: Date): Promise<number> {
    const cutoff = this.staleCutoff(now);
    const stale = await this.prisma.driverProfile.findMany({
      where: {
        isOnline: true,
        isBusy: false,
        OR: [
          { lastLocationAt: { lt: cutoff } },
          { lastLocationAt: null, OR: [{ onlineSince: null }, { onlineSince: { lt: cutoff } }] },
        ],
      },
      select: { userId: true },
    });
    if (stale.length === 0) return 0;
    const ids = stale.map((d) => d.userId);
    await this.prisma.driverProfile.updateMany({
      where: { userId: { in: ids }, isBusy: false },
      data: { isOnline: false, onlineSince: null, lastLat: null, lastLng: null, lastLocationAt: null },
    });
    for (const id of ids) {
      await this.withdrawDriverOffers(id);
      this.realtime.driverStatus({ driverId: id, isOnline: false, isBusy: false });
    }
    return ids.length;
  }

  async acceptOffer(offerId: string, driverId: string): Promise<string> {
    const now = this.clock.now();
    const offer = await this.prisma.dispatchOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.driverId !== driverId) throw notFound('Offre introuvable');
    if (offer.status !== 'OFFERED') throw conflict('Cette offre n’est plus disponible', 'OFFER_EXPIRED');
    if (offer.expiresAt.getTime() <= now.getTime()) {
      await this.prisma.dispatchOffer.updateMany({
        where: { id: offerId, status: 'OFFERED' },
        data: { status: 'EXPIRED', respondedAt: now },
      });
      throw conflict('Offre expirée', 'OFFER_EXPIRED');
    }
    const actor: Actor = { id: driverId, role: 'DRIVER' };
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({ where: { id: offer.orderId } });
      if (order.status !== 'SEARCHING_DRIVER') throw conflict('Commande déjà attribuée ou annulée', 'OFFER_EXPIRED');
      const busy = await tx.driverProfile.updateMany({
        where: { userId: driverId, isBusy: false, isOnline: true, status: 'APPROVED' },
        data: { isBusy: true },
      });
      if (busy.count === 0) throw conflict('Vous devez être en ligne et libre pour accepter', 'DRIVER_BUSY');
      await tx.dispatchOffer.update({ where: { id: offerId }, data: { status: 'ACCEPTED', respondedAt: now } });
      await transitionOrder(tx, order, 'ASSIGNED', actor, { driverId, assignedAt: now }, 'Offre acceptée', now);
    });
    await this.onAssigned(offer.orderId);
    this.realtime.driverStatus({ driverId, isOnline: true, isBusy: true });
    return offer.orderId;
  }

  async rejectOffer(offerId: string, driverId: string): Promise<void> {
    const now = this.clock.now();
    const offer = await this.prisma.dispatchOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.driverId !== driverId) throw notFound('Offre introuvable');
    if (offer.status !== 'OFFERED') throw conflict('Cette offre n’est plus disponible', 'OFFER_EXPIRED');
    await this.prisma.dispatchOffer.update({ where: { id: offerId }, data: { status: 'REJECTED', respondedAt: now } });
    await this.offerNext(offer.orderId);
  }

  /** Annule les offres en cours d'une commande (affectation manuelle, annulation). */
  async cancelOpenOffers(orderId: string): Promise<void> {
    const open = await this.prisma.dispatchOffer.findMany({ where: { orderId, status: 'OFFERED' } });
    if (open.length === 0) return;
    await this.prisma.dispatchOffer.updateMany({
      where: { orderId, status: 'OFFERED' },
      data: { status: 'CANCELLED', respondedAt: this.clock.now() },
    });
    for (const o of open) this.realtime.offerClosed(o.driverId, { offerId: o.id, orderId, status: 'CANCELLED' });
  }

  /** Annule les offres en cours d'un livreur (passage hors ligne, suspension) et relance la recherche. */
  async withdrawDriverOffers(driverId: string): Promise<void> {
    const open = await this.prisma.dispatchOffer.findMany({ where: { driverId, status: 'OFFERED' } });
    if (open.length === 0) return;
    await this.prisma.dispatchOffer.updateMany({
      where: { driverId, status: 'OFFERED' },
      data: { status: 'CANCELLED', respondedAt: this.clock.now() },
    });
    for (const o of open) {
      this.realtime.offerClosed(driverId, { offerId: o.id, orderId: o.orderId, status: 'CANCELLED' });
      await this.offerNext(o.orderId);
    }
  }

  /** Livreurs proposables manuellement par un contrôleur (même type de véhicule, validés). */
  async manualCandidates(orderId: string): Promise<DriverCandidateDto[]> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw notFound('Commande introuvable');
    const profiles = await this.prisma.driverProfile.findMany({
      where: { status: 'APPROVED', vehicleType: order.vehicleType, user: { isSuspended: false } },
      include: { user: true },
    });
    const pickup = { lat: order.pickupLat, lng: order.pickupLng };
    return profiles
      .map((p) => ({
        id: p.userId,
        name: p.user.name,
        phone: p.user.phone,
        vehicleType: p.vehicleType,
        isOnline: p.isOnline,
        isBusy: p.isBusy,
        cashBlocked: p.cashHeld >= this.cfg.cashLimit,
        distanceKm:
          p.isOnline && p.lastLat !== null && p.lastLng !== null
            ? Math.round(haversineKm(pickup, { lat: p.lastLat, lng: p.lastLng }) * 10) / 10
            : null,
      }))
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }

  /**
   * Affectation (ou réaffectation) manuelle par un contrôleur. Le livreur doit être validé,
   * non suspendu, libre, sous le plafond d'espèces et avoir le bon type de véhicule.
   */
  async manualAssign(orderId: string, driverId: string, actor: Actor, ip?: string): Promise<void> {
    const now = this.clock.now();
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw notFound('Commande introuvable');
    if (order.status !== 'SEARCHING_DRIVER' && order.status !== 'ASSIGNED') {
      throw new AppError(409, 'INVALID_TRANSITION', 'La commande ne peut pas être (ré)affectée dans son état actuel');
    }
    if (order.driverId === driverId) throw conflict('Ce livreur est déjà affecté à la commande');
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId: driverId }, include: { user: true } });
    if (!profile) throw notFound('Livreur introuvable');
    if (profile.status !== 'APPROVED' || profile.user.isSuspended)
      throw new AppError(409, 'DRIVER_NOT_APPROVED', 'Livreur non validé ou suspendu');
    if (profile.vehicleType !== order.vehicleType) throw conflict('Type de véhicule différent de celui de la commande');
    // Un livreur hors ligne n'envoie pas de position (suivi impossible) et ne voit pas la course.
    if (!profile.isOnline) throw conflict('Ce livreur est hors ligne', 'DRIVER_OFFLINE');
    if (profile.isBusy) throw conflict('Ce livreur est déjà en course', 'DRIVER_BUSY');
    if (profile.cashHeld >= this.cfg.cashLimit)
      throw conflict('Ce livreur a atteint le plafond d’espèces', 'CASH_LIMIT_REACHED');

    await this.cancelOpenOffers(orderId);
    const previousDriverId = order.driverId;
    await this.prisma.$transaction(async (tx) => {
      let current: { id: string; type: OrderType; status: OrderStatus } = order;
      if (current.status === 'ASSIGNED') {
        current = await transitionOrder(tx, current, 'SEARCHING_DRIVER', actor, { driverId: null, assignedAt: null }, 'Réaffectation par un contrôleur', now);
        if (previousDriverId) await tx.driverProfile.update({ where: { userId: previousDriverId }, data: { isBusy: false } });
      }
      const busy = await tx.driverProfile.updateMany({
        where: { userId: driverId, isBusy: false, isOnline: true },
        data: { isBusy: true },
      });
      if (busy.count === 0) throw conflict('Ce livreur est déjà en course', 'DRIVER_BUSY');
      await transitionOrder(tx, current, 'ASSIGNED', actor, { driverId, assignedAt: now }, 'Affectation manuelle', now);
      await writeAudit(tx, {
        actorId: actor.id,
        action: AuditAction.ORDER_MANUALLY_ASSIGNED,
        entityType: 'Order',
        entityId: orderId,
        metadata: { driverId, previousDriverId },
        ip: ip ?? null,
      });
    });
    // L'ancien livreur quitte la salle de la commande : il ne reçoit plus ses événements ni la position du nouveau.
    if (previousDriverId) this.realtime.evictFromOrder(orderId, previousDriverId);
    await this.onAssigned(orderId);
    this.realtime.driverStatus({ driverId, isOnline: profile.isOnline, isBusy: true });
    if (previousDriverId) {
      const prev = await this.prisma.driverProfile.findUnique({ where: { userId: previousDriverId } });
      this.realtime.driverStatus({ driverId: previousDriverId, isOnline: prev?.isOnline ?? false, isBusy: false });
      if (this.notifier)
        void this.notifier.toUser(previousDriverId, {
          title: 'Course réaffectée',
          body: `La course #${order.number} a été confiée à un autre livreur par le support.`,
          data: { orderId, type: 'order.reassigned' },
        });
    }
    if (this.notifier)
      void this.notifier.toUser(driverId, {
        title: 'Course affectée',
        body: `Le support vous a affecté la course #${order.number}.`,
        data: { orderId, type: 'order.assigned' },
      });
  }
}
