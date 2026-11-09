/**
 * Démonstration (DEMO_MODE=true) : déplacement simulé des livreurs du seed en course (`DEMO_SIMULATED_DRIVER_PHONES`,
 * services/demo.ts), pour que la page de suivi du destinataire, l'application de l'entreprise et la console montrent un
 * livreur qui avance, comme si son téléphone envoyait sa position.
 *
 * - Position déduite de l'heure, sans autre état (plusieurs instances calculent la même) : progression à vitesse
 *   constante le long de l'itinéraire en cache de l'étape en cours (vers le retrait pendant ASSIGNED, vers le
 *   destinataire pendant PICKED_UP), depuis son calcul (`routeComputedAt`), en `durationS` (durée OSRM ajustée au
 *   véhicule, ou ligne droite à la vitesse moyenne) ; pause de 45 s à l'arrivée, puis retour au départ de l'étape, en
 *   boucle. Le statut de la commande ne change jamais. L'heure est arrondie au pas de 4 s.
 * - Écrit la dernière position du livreur (DriverProfile : lastLat / lastLng / lastHeading / lastLocationAt), celle que
 *   lisent GET /track/:token, GET /orders/:id, GET /business/deliveries et GET /controller/map : au plus une fois par pas
 *   et par livreur, par une mise à jour conditionnelle (une seule instance écrit, jamais par-dessus une position réelle
 *   arrivée entre-temps). Aucune ligne LocationPing (historique des positions réelles) et aucun appel au service
 *   d'itinéraire : la position reste sur le tracé, donc jamais « hors itinéraire ». L'ETA (part restante du tracé ×
 *   durée) diminue à mesure que le livreur avance. Mode socket : même événement `driver.location` qu'une vraie position.
 * - Le GPS réel l'emporte : pas de simulation tant que le livreur a envoyé une position réelle (POST /driver/location,
 *   passage en ligne avec position : lignes LocationPing) depuis moins de 2 min.
 * - Étape sans itinéraire en cache : calcul demandé au service d'itinéraire (ligne droite de secours ; au plus une
 *   tentative par 30 s et par commande) ; le livreur reste immobile jusque-là.
 * Déclenchement : `BackgroundWork.runDueWork()` (mode poll / Vercel : requêtes des écrans de suivi, au plus une fois par
 * WORK_THROTTLE_MS), minuterie de `server.ts` en mode socket.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { AVERAGE_SPEED_KMH, type VehicleType } from '@yaar/shared';
import type { Clock } from '../lib/clock';
import { bearingDeg, distanceM, polylineLengthM, tupleToLatLng, type LatLngTuple } from '../lib/geo';
import { iso } from '../lib/time';
import type { RealtimeHub } from '../realtime/hub';
import { headingForDto, normalizeHeading } from './heading';
import { currentRoute, recentlyAttempted, ROUTE_STATE_SELECT, type CachedRoute, type RouteService } from './routes';

/** Pas de la simulation : position recalculée (et écrite) au plus une fois par pas et par livreur. */
export const DEMO_MOTION_STEP_MS = 4_000;
/** Arrêt à l'arrivée (retrait ou destinataire) avant de repartir du début de l'étape. */
export const DEMO_MOTION_PAUSE_MS = 45_000;
/** Une position réelle plus récente que ce délai suspend la simulation (le GPS réel l'emporte). */
export const DEMO_REAL_GPS_GRACE_MS = 2 * 60_000;

/** Trajet simulé : tracé de l'étape et durée du parcours. */
export interface DemoLeg {
  /** Tracé [lat, lng] du départ à l'arrivée. */
  points: ReadonlyArray<LatLngTuple>;
  /** Durée du parcours complet (s). */
  durationS: number;
}

export interface DemoPosition {
  lat: number;
  lng: number;
  /** Cap du segment parcouru (degrés, 0 = nord), celui du dernier segment à l'arrêt ; null pour un tracé réduit à un point. */
  heading: number | null;
  /** Part du tracé parcourue : 0 au départ, 1 à l'arrivée. */
  progress: number;
  /** false pendant l'arrêt à l'arrivée. */
  moving: boolean;
  /** Vitesse simulée (m/s), 0 à l'arrêt. */
  speedMps: number;
}

/** Coordonnées à 6 décimales (≈ 0,1 m, comme un GPS). */
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Position simulée à l'instant `atMs` sur un trajet commencé à `startMs` : vitesse constante le long du tracé (au
 * prorata des longueurs de segments), arrêt de `pauseMs` à l'arrivée, puis retour au départ, en boucle (période =
 * durée + arrêt). Avant `startMs` (horloges décalées) : au départ. Tracé de longueur ou de durée nulle : à l'arrivée,
 * à l'arrêt. null pour un tracé vide. Fonction pure.
 */
export function demoPositionAt(leg: DemoLeg, startMs: number, atMs: number, pauseMs = DEMO_MOTION_PAUSE_MS): DemoPosition | null {
  const pts = leg.points;
  if (pts.length === 0) return null;
  const cumulative = [0];
  for (let i = 1; i < pts.length; i++) cumulative.push(cumulative[i - 1]! + distanceM(tupleToLatLng(pts[i - 1]!), tupleToLatLng(pts[i]!)));
  const totalM = cumulative[pts.length - 1]!;
  const travelMs = Number.isFinite(leg.durationS) && leg.durationS > 0 ? leg.durationS * 1000 : 0;

  /** Cap du segment i (le premier segment non nul à partir de i, sinon le dernier non nul avant). */
  const headingFrom = (i: number): number | null => {
    for (let k = i; k < pts.length - 1; k++)
      if (cumulative[k + 1]! > cumulative[k]!) return normalizeHeading(bearingDeg(tupleToLatLng(pts[k]!), tupleToLatLng(pts[k + 1]!)));
    for (let k = Math.min(i, pts.length - 1) - 1; k >= 0; k--)
      if (cumulative[k + 1]! > cumulative[k]!) return normalizeHeading(bearingDeg(tupleToLatLng(pts[k]!), tupleToLatLng(pts[k + 1]!)));
    return null;
  };
  const last = pts[pts.length - 1]!;
  const atArrival: DemoPosition = {
    lat: round6(last[0]),
    lng: round6(last[1]),
    heading: headingFrom(pts.length - 1),
    progress: 1,
    moving: false,
    speedMps: 0,
  };
  if (totalM <= 0 || travelMs <= 0) return atArrival;

  const elapsed = Math.max(0, atMs - startMs);
  const phase = elapsed % (travelMs + Math.max(0, pauseMs));
  if (phase >= travelMs) return atArrival;

  const along = (totalM * phase) / travelMs;
  let i = 0;
  while (i < pts.length - 2 && cumulative[i + 1]! <= along) i++;
  const segM = cumulative[i + 1]! - cumulative[i]!;
  const f = segM > 0 ? Math.min(1, Math.max(0, (along - cumulative[i]!) / segM)) : 0;
  const a = pts[i]!;
  const b = pts[i + 1]!;
  return {
    lat: round6(a[0] + (b[0] - a[0]) * f),
    lng: round6(a[1] + (b[1] - a[1]) * f),
    heading: headingFrom(i),
    progress: along / totalM,
    moving: true,
    speedMps: totalM / (travelMs / 1000),
  };
}

/**
 * Trajet simulé d'un itinéraire en cache : sa durée (OSRM ajustée au véhicule, ou ligne droite à la vitesse moyenne),
 * ou, si elle est absente ou nulle, la longueur du tracé à la vitesse moyenne du véhicule (`AVERAGE_SPEED_KMH`). Même
 * durée que l'ETA (part restante × durationS) : l'ETA diminue d'une seconde par seconde.
 */
export function demoLegFor(route: Pick<CachedRoute, 'points' | 'durationS'>, vehicleType: VehicleType): DemoLeg {
  const durationS =
    Number.isFinite(route.durationS) && route.durationS > 0
      ? route.durationS
      : polylineLengthM(route.points) / ((AVERAGE_SPEED_KMH[vehicleType] * 1000) / 3600);
  return { points: route.points, durationS };
}

export interface DemoMotionResult {
  /** Livreurs déplacés à ce pas. */
  moved: number;
  /** Livreurs laissés à leur position réelle (GPS reçu il y a moins de 2 min). */
  realGps: number;
  /** Courses sans itinéraire en cache pour l'étape en cours (calcul demandé, livreur immobile). */
  waitingForRoute: number;
}

export interface DemoMotionOptions {
  /** DEMO_MODE : sans lui, `step()` ne fait rien. */
  enabled: boolean;
  /** Numéros des livreurs simulés (`DEMO_SIMULATED_DRIVER_PHONES`). */
  phones: readonly string[];
  stepMs?: number;
  pauseMs?: number;
  realGpsGraceMs?: number;
}

/** Commande lue par un pas de simulation : état de l'itinéraire, livreur et sa dernière position. */
const MOTION_SELECT = {
  ...ROUTE_STATE_SELECT,
  driver: {
    select: {
      driverProfile: { select: { isOnline: true, lastLat: true, lastLng: true, lastLocationAt: true, lastHeading: true } },
    },
  },
} satisfies Prisma.OrderSelect;

export class DemoMotionService {
  /** Un seul pas à la fois dans l'instance. */
  private running: Promise<DemoMotionResult | null> | null = null;
  private readonly stepMs: number;
  private readonly pauseMs: number;
  private readonly realGpsGraceMs: number;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: Clock,
    private readonly realtime: RealtimeHub,
    private readonly routes: RouteService,
    private readonly opts: DemoMotionOptions,
  ) {
    this.stepMs = opts.stepMs ?? DEMO_MOTION_STEP_MS;
    this.pauseMs = opts.pauseMs ?? DEMO_MOTION_PAUSE_MS;
    this.realGpsGraceMs = opts.realGpsGraceMs ?? DEMO_REAL_GPS_GRACE_MS;
  }

  get enabled(): boolean {
    return this.opts.enabled && this.opts.phones.length > 0;
  }

  /** Un pas de simulation pour tous les livreurs simulés en course ; null hors démonstration. */
  step(): Promise<DemoMotionResult | null> {
    if (!this.enabled) return Promise.resolve(null);
    if (this.running) return this.running;
    this.running = this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(): Promise<DemoMotionResult> {
    const result: DemoMotionResult = { moved: 0, realGps: 0, waitingForRoute: 0 };
    const now = this.clock.now();
    // Instant du pas : identique pour toutes les instances pendant 4 s (même position calculée).
    const stepAt = new Date(Math.floor(now.getTime() / this.stepMs) * this.stepMs);
    const orders = await this.prisma.order.findMany({
      where: { status: { in: ['ASSIGNED', 'PICKED_UP'] }, driver: { is: { role: 'DRIVER', phone: { in: [...this.opts.phones] } } } },
      orderBy: { assignedAt: 'desc' },
      select: MOTION_SELECT,
    });
    // Une course par livreur (la plus récemment affectée si les données en montraient plusieurs).
    const byDriver = new Map<string, (typeof orders)[number]>();
    for (const o of orders) if (o.driverId && !byDriver.has(o.driverId)) byDriver.set(o.driverId, o);
    if (byDriver.size === 0) return result;

    const recent = await this.prisma.locationPing.findMany({
      where: { driverId: { in: [...byDriver.keys()] }, createdAt: { gt: new Date(now.getTime() - this.realGpsGraceMs) } },
      select: { driverId: true },
      distinct: ['driverId'],
    });
    const realGps = new Set(recent.map((r) => r.driverId));

    for (const [driverId, o] of byDriver) {
      const profile = o.driver?.driverProfile ?? null;
      // Jamais de position pour un livreur hors ligne (suivi autorisé uniquement en ligne).
      if (!profile || !profile.isOnline) continue;
      if (realGps.has(driverId)) {
        result.realGps++;
        continue;
      }
      const route = currentRoute(o);
      if (!route) {
        result.waitingForRoute++;
        if (!recentlyAttempted(o.routeAttemptAt, now)) await this.routes.ensureRoute(o.id);
        continue;
      }
      // Déjà écrite pour ce pas (autre instance), ou position plus récente.
      if (profile.lastLocationAt && profile.lastLocationAt.getTime() >= stepAt.getTime()) continue;
      const pos = demoPositionAt(demoLegFor(route, o.vehicleType), route.computedAt.getTime(), stepAt.getTime(), this.pauseMs);
      if (!pos) continue;
      const heading = pos.heading ?? profile.lastHeading;
      // Conditionnelle : rien si une position (réelle ou d'une autre instance) a été écrite depuis la lecture.
      const written = await this.prisma.driverProfile.updateMany({
        where: { userId: driverId, isOnline: true, lastLocationAt: profile.lastLocationAt },
        data: { lastLat: pos.lat, lastLng: pos.lng, lastLocationAt: stepAt, lastHeading: heading },
      });
      if (written.count !== 1) continue;
      result.moved++;
      this.realtime.driverLocation({
        driverId,
        lat: pos.lat,
        lng: pos.lng,
        heading: headingForDto(heading),
        speed: Math.round(pos.speedMps * 10) / 10,
        orderId: o.id,
        at: iso(stepAt),
      });
    }
    return result;
  }
}
