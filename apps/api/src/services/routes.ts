/**
 * Itinéraire de l'étape en cours d'une course, mis en cache sur la commande (colonnes `route*`).
 *
 * Calcul (fournisseur `RoutingProvider`, OSRM par défaut, ligne droite de secours) :
 * - à l'affectation (ASSIGNED) : vers le point de retrait, depuis la dernière position du livreur (si connue),
 *   et une fois la durée retrait → livraison (`deliveryLegDurationS`) pour l'ETA pendant ASSIGNED ;
 * - au retrait (PICKED_UP) : vers le destinataire, depuis la position du livreur si elle a moins de 2 min,
 *   sinon depuis le point de retrait ;
 * - aux positions GPS du livreur (POST /driver/location) quand la cible ne correspond plus au statut, quand le
 *   livreur s'écarte de plus de 120 m du tracé ou quand l'itinéraire a plus de 3 min ; jamais plus d'une fois
 *   par 30 s et par commande, toutes instances confondues (`routeAttemptAt` pris par un UPDATE conditionnel).
 * Les calculs passent par `BackgroundWork.defer()` (budget de temps, puis `waitUntil` sur Vercel) : la réponse
 * à une position n'attend jamais le service d'itinéraire.
 * Écritures en SQL brut : `updatedAt` ne bouge pas (il signale les changements métier, cf. updatedSince).
 */
import { Prisma, type OrderStatus, type PrismaClient, type VehicleType } from '@prisma/client';
import type { LatLng, RouteDto } from '@yaar/shared';
import type { Clock } from '../lib/clock';
import { projectOnPolyline, remainingFraction, round5, type LatLngTuple } from '../lib/geo';
import { iso } from '../lib/time';
import { straightRoute, type RouteResult, type RoutingProvider } from '../providers/routing';
import type { BackgroundWork } from './work';

/** Âge au-delà duquel l'itinéraire est recalculé à la position suivante. */
export const ROUTE_MAX_AGE_MS = 3 * 60_000;
/** Au plus une tentative de calcul par commande sur cette durée (toutes instances). */
export const ROUTE_MIN_INTERVAL_MS = 30_000;
/** Écart au tracé au-delà duquel le livreur est considéré hors itinéraire. */
export const OFF_ROUTE_THRESHOLD_M = 120;
/** ETA pendant ASSIGNED : temps de remise du colis au point de retrait. */
export const HANDOVER_ALLOWANCE_S = 120;
/** Au retrait : position du livreur utilisée comme départ si elle a moins de 2 min, sinon le point de retrait. */
export const DROPOFF_ORIGIN_MAX_AGE_MS = 2 * 60_000;

export type RouteTarget = 'PICKUP' | 'DROPOFF';
export type RecomputeReason = 'target' | 'age' | 'off_route';

export function targetForStatus(status: OrderStatus): RouteTarget | null {
  if (status === 'ASSIGNED') return 'PICKUP';
  if (status === 'PICKED_UP') return 'DROPOFF';
  return null;
}

/** Colonnes de l'itinéraire en cache (sous-ensemble d'une ligne Order). */
export interface RouteColumns {
  status: OrderStatus;
  routeTarget: string | null;
  routePoints: Prisma.JsonValue | null;
  routeDistanceM: number | null;
  routeDurationS: number | null;
  routeSource: string | null;
  routeComputedAt: Date | null;
}

export interface CachedRoute {
  target: RouteTarget;
  points: LatLngTuple[];
  distanceM: number;
  durationS: number;
  source: 'osrm' | 'straight';
  computedAt: Date;
}

function isPoint(v: unknown): v is LatLngTuple {
  return Array.isArray(v) && v.length === 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]);
}

/** Lit l'itinéraire en cache ; null s'il est absent ou incohérent. */
export function parseCachedRoute(o: RouteColumns): CachedRoute | null {
  const target = o.routeTarget;
  const source = o.routeSource;
  if (target !== 'PICKUP' && target !== 'DROPOFF') return null;
  if (source !== 'osrm' && source !== 'straight') return null;
  if (o.routeDistanceM === null || o.routeDurationS === null || o.routeComputedAt === null) return null;
  const pts = o.routePoints;
  if (!Array.isArray(pts) || pts.length < 2 || !pts.every(isPoint)) return null;
  return {
    target,
    points: pts as LatLngTuple[],
    distanceM: o.routeDistanceM,
    durationS: o.routeDurationS,
    source,
    computedAt: o.routeComputedAt,
  };
}

/** Itinéraire de l'étape en cours : en cache ET dont la cible correspond au statut ; null sinon. */
export function currentRoute(o: RouteColumns): CachedRoute | null {
  const target = targetForStatus(o.status);
  if (!target) return null;
  const r = parseCachedRoute(o);
  return r && r.target === target ? r : null;
}

export function toRouteDto(r: CachedRoute): RouteDto {
  return {
    target: r.target,
    points: r.points,
    distanceM: r.distanceM,
    durationS: r.durationS,
    source: r.source,
    computedAt: iso(r.computedAt),
  };
}

/**
 * Colonnes effacées à chaque changement de statut (`transitionOrder`) : l'itinéraire n'est valable que pour
 * l'étape en cours (et la position de départ du livreur n'est pas conservée au-delà). La durée retrait →
 * livraison est gardée (estimation comparée plus tard aux durées réelles).
 */
export const ROUTE_RESET = {
  routeTarget: null,
  routePoints: Prisma.DbNull,
  routeDistanceM: null,
  routeDurationS: null,
  routeSource: null,
  routeComputedAt: null,
  routeOriginLat: null,
  routeOriginLng: null,
  routeAttemptAt: null,
} satisfies Prisma.OrderUncheckedUpdateManyInput;

/**
 * Faut-il recalculer l'itinéraire à cette position ? `target` : pas d'itinéraire pour l'étape en cours ;
 * `age` : plus de 3 min ; `off_route` : plus de 120 m du tracé. Ne tient pas compte du délai de 30 s.
 */
export function recomputeReason(o: RouteColumns, pos: LatLng, now: Date): RecomputeReason | null {
  const target = targetForStatus(o.status);
  if (!target) return null;
  const cached = parseCachedRoute(o);
  if (!cached || cached.target !== target) return 'target';
  if (now.getTime() - cached.computedAt.getTime() > ROUTE_MAX_AGE_MS) return 'age';
  if (projectOnPolyline(cached.points, pos).distanceM > OFF_ROUTE_THRESHOLD_M) return 'off_route';
  return null;
}

/** Une tentative de calcul a eu lieu il y a moins de 30 s. */
export function recentlyAttempted(attemptAt: Date | null, now: Date): boolean {
  return attemptAt !== null && now.getTime() - attemptAt.getTime() < ROUTE_MIN_INTERVAL_MS;
}

export interface EtaInputs {
  vehicleType: VehicleType;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  deliveryLegDurationS: number | null;
}

/**
 * ETA (secondes) depuis l'itinéraire : part restante du tracé depuis la position du livreur (point le plus
 * proche du tracé) × durée du tracé ; pendant ASSIGNED (vers le retrait), + remise du colis (2 min) + durée
 * retrait → livraison (calculée à l'affectation, sinon ligne droite).
 */
export function routeEtaSeconds(route: CachedRoute, o: EtaInputs, driverPos: LatLng | null): number {
  const fraction = driverPos ? remainingFraction(route.points, driverPos) : 1;
  let seconds = fraction * route.durationS;
  if (route.target === 'PICKUP') {
    const leg =
      o.deliveryLegDurationS ??
      straightRoute({ lat: o.pickupLat, lng: o.pickupLng }, { lat: o.dropoffLat, lng: o.dropoffLng }, o.vehicleType).durationS;
    seconds += HANDOVER_ALLOWANCE_S + leg;
  }
  return seconds;
}

/** État d'une commande en course lu par POST /driver/location (assez pour décider sans autre requête). */
export const ROUTE_STATE_SELECT = {
  id: true,
  status: true,
  driverId: true,
  vehicleType: true,
  pickupLat: true,
  pickupLng: true,
  dropoffLat: true,
  dropoffLng: true,
  routeTarget: true,
  routePoints: true,
  routeDistanceM: true,
  routeDurationS: true,
  routeSource: true,
  routeComputedAt: true,
  routeAttemptAt: true,
} satisfies Prisma.OrderSelect;

export type RouteState = Prisma.OrderGetPayload<{ select: typeof ROUTE_STATE_SELECT }>;

export interface RouteServiceOptions {
  /** Temps maximal d'attente d'un calcul par la requête de changement de statut (WORK_BUDGET_MS). */
  budgetMs: number;
}

export class RouteService {
  /** Après l'écriture d'un nouvel itinéraire (mode socket : `order.updated` pour que les abonnés rechargent). */
  onRouteStored: (orderId: string) => void | Promise<void> = () => {};

  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: Clock,
    private readonly provider: RoutingProvider,
    private readonly work: BackgroundWork,
    private readonly opts: RouteServiceOptions,
    private readonly onError: (err: unknown) => void = () => {},
  ) {}

  /**
   * Après un passage en ASSIGNED ou PICKED_UP : itinéraire de la nouvelle étape (et, à l'affectation, durée
   * retrait → livraison). La requête l'attend au plus `budgetMs` ; au-delà, le calcul se termine en arrière-plan.
   */
  afterTransition(orderId: string): Promise<void> {
    return this.work.defer(() => this.computeForNewLeg(orderId), this.opts.budgetMs, this.onError);
  }

  /**
   * Position GPS d'un livreur en course : décision immédiate, sans requête si rien n'est à recalculer ; sinon
   * calcul lancé en arrière-plan (jamais attendu par la réponse à la position).
   */
  async onDriverPing(order: RouteState, pos: LatLng): Promise<RecomputeReason | null> {
    const now = this.clock.now();
    if (order.driverId === null) return null;
    const reason = recomputeReason(order, pos, now);
    if (!reason || recentlyAttempted(order.routeAttemptAt, now)) return null;
    const target = targetForStatus(order.status)!;
    await this.work.defer(() => this.recompute(order, target, pos, now), 0, this.onError);
    return reason;
  }

  private async computeForNewLeg(orderId: string): Promise<void> {
    const o = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        ...ROUTE_STATE_SELECT,
        deliveryLegDurationS: true,
        driver: { select: { driverProfile: { select: { lastLat: true, lastLng: true, lastLocationAt: true } } } },
      },
    });
    if (!o || o.driverId === null) return;
    const target = targetForStatus(o.status);
    if (!target) return;
    const now = this.clock.now();
    const p = o.driver?.driverProfile ?? null;
    let origin: LatLng | null = null;
    if (p && p.lastLat !== null && p.lastLng !== null) {
      const fresh = p.lastLocationAt !== null && now.getTime() - p.lastLocationAt.getTime() <= DROPOFF_ORIGIN_MAX_AGE_MS;
      if (target === 'PICKUP' || fresh) origin = { lat: p.lastLat, lng: p.lastLng };
    }
    if (!origin && target === 'DROPOFF') origin = { lat: o.pickupLat, lng: o.pickupLng };
    const needLeg = target === 'PICKUP' && o.deliveryLegDurationS === null;
    await Promise.all([
      // Position du livreur inconnue à l'affectation : la première position reçue déclenchera le calcul.
      origin ? this.recompute(o, target, origin, now) : Promise.resolve(false),
      needLeg ? this.computeDeliveryLeg(o) : Promise.resolve(),
    ]);
  }

  /** Prend la main (au plus une tentative par 30 s), calcule puis écrit si l'étape n'a pas changé entre-temps. */
  private async recompute(o: RouteState, target: RouteTarget, origin: LatLng, claimAt: Date): Promise<boolean> {
    if (!(await this.claim(o, claimAt))) return false;
    const dest = target === 'PICKUP' ? { lat: o.pickupLat, lng: o.pickupLng } : { lat: o.dropoffLat, lng: o.dropoffLng };
    const route = await this.provider.route(origin, dest, o.vehicleType);
    const stored = await this.store(o, target, origin, route, claimAt);
    if (stored) await this.onRouteStored(o.id);
    return stored;
  }

  /**
   * Verrou entre instances : UPDATE conditionnel sur `routeAttemptAt` (vide ou de plus de 30 s), le statut et le
   * livreur. Une seule instance gagne ; les autres ne contactent pas le service d'itinéraire.
   */
  private async claim(o: RouteState, now: Date): Promise<boolean> {
    const at = iso(now);
    const cutoff = iso(new Date(now.getTime() - ROUTE_MIN_INTERVAL_MS));
    const n = await this.prisma.$executeRaw`
      UPDATE "Order" SET "routeAttemptAt" = CAST(${at} AS TIMESTAMP(3))
      WHERE "id" = ${o.id} AND "status" = CAST(${o.status} AS "OrderStatus") AND "driverId" = ${o.driverId}
        AND ("routeAttemptAt" IS NULL OR "routeAttemptAt" <= CAST(${cutoff} AS TIMESTAMP(3)))`;
    return n === 1;
  }

  /** Écrit l'itinéraire seulement si la tentative est toujours la nôtre (statut, livreur et verrou inchangés). */
  private async store(o: RouteState, target: RouteTarget, origin: LatLng, r: RouteResult, claimAt: Date): Promise<boolean> {
    const computedAt = iso(this.clock.now());
    const n = await this.prisma.$executeRaw`
      UPDATE "Order" SET
        "routeTarget" = ${target},
        "routePoints" = CAST(${JSON.stringify(r.points)} AS JSONB),
        "routeDistanceM" = CAST(${Math.round(r.distanceM)} AS INTEGER),
        "routeDurationS" = CAST(${Math.round(r.durationS)} AS INTEGER),
        "routeSource" = ${r.source},
        "routeComputedAt" = CAST(${computedAt} AS TIMESTAMP(3)),
        "routeOriginLat" = CAST(${round5(origin.lat)} AS DOUBLE PRECISION),
        "routeOriginLng" = CAST(${round5(origin.lng)} AS DOUBLE PRECISION)
      WHERE "id" = ${o.id} AND "status" = CAST(${o.status} AS "OrderStatus") AND "driverId" = ${o.driverId}
        AND "routeAttemptAt" = CAST(${iso(claimAt)} AS TIMESTAMP(3))`;
    return n === 1;
  }

  /** Durée retrait → livraison, calculée une seule fois (conservée en cas de réaffectation). */
  private async computeDeliveryLeg(o: RouteState): Promise<void> {
    const r = await this.provider.route(
      { lat: o.pickupLat, lng: o.pickupLng },
      { lat: o.dropoffLat, lng: o.dropoffLng },
      o.vehicleType,
    );
    await this.prisma.$executeRaw`
      UPDATE "Order" SET "deliveryLegDurationS" = CAST(${Math.round(r.durationS)} AS INTEGER)
      WHERE "id" = ${o.id} AND "deliveryLegDurationS" IS NULL`;
  }
}
