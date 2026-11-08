import {
  AVERAGE_SPEED_KMH,
  distanceM,
  minutesFromSeconds,
  roadDistanceKm,
  routeProgress,
  type OrderDto,
  type OrderStatus,
  type RouteDto,
  type TrackingDto,
  type VehicleType,
} from '@yaar/shared';
import type { MapPoint, SceneLine, SceneMarker } from '../components/map/types';

/**
 * Ce qu'affiche une carte de suivi selon l'étape de la livraison :
 * - recherche d'un livreur : entreprise (radar) + destinataire, reliés en pointillés ;
 * - livreur en route vers l'entreprise : livreur + itinéraire vers le retrait, cadrage livreur + retrait ;
 * - colis récupéré : livreur + itinéraire vers le destinataire, cadrage livreur + destinataire ;
 * - livrée : destinataire seul ; annulée : retrait et livraison, sans livreur.
 */
export type DeliveryStage = 'pending' | 'searching' | 'toPickup' | 'toDropoff' | 'delivered' | 'cancelled';

export function stageOf(status: OrderStatus): DeliveryStage {
  switch (status) {
    case 'READY':
    case 'SEARCHING_DRIVER':
      return 'searching';
    case 'ASSIGNED':
      return 'toPickup';
    case 'PICKED_UP':
      return 'toDropoff';
    case 'DELIVERED':
      return 'delivered';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'pending';
  }
}

export function isLiveStage(stage: DeliveryStage): boolean {
  return stage === 'toPickup' || stage === 'toDropoff';
}

export interface LiveDriver extends MapPoint {
  heading?: number | null;
}

export interface SceneInput {
  /** Préfixe des identifiants (plusieurs livraisons sur la même carte). */
  id?: string;
  status: OrderStatus;
  vehicleType: VehicleType;
  pickup: MapPoint | null;
  dropoff: MapPoint | null;
  driver: LiveDriver | null;
  route: RouteDto | null | undefined;
  labels?: { pickup?: string; dropoff?: string; driver?: string };
}

export interface LiveScene {
  stage: DeliveryStage;
  /** Cible de l'étape en cours. */
  target: 'PICKUP' | 'DROPOFF' | null;
  markers: SceneMarker[];
  lines: SceneLine[];
  fitPoints: MapPoint[];
  /** Itinéraire de l'API valable pour l'étape en cours (même cible), sinon null. */
  route: RouteDto | null;
  driver: LiveDriver | null;
}

export function routePoints(route: RouteDto): MapPoint[] {
  return route.points.map(([lat, lng]) => ({ lat, lng }));
}

const pt = (p: MapPoint | null | undefined): MapPoint | null =>
  p && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? { lat: p.lat, lng: p.lng } : null;

export function buildScene(input: SceneInput): LiveScene {
  const prefix = input.id ? `${input.id}:` : '';
  const stage = stageOf(input.status);
  const pickup = pt(input.pickup);
  const dropoff = pt(input.dropoff);
  const live = isLiveStage(stage);
  const driver = live && input.driver ? { ...pt(input.driver)!, heading: input.driver.heading ?? null } : null;
  const target = stage === 'toPickup' ? 'PICKUP' : stage === 'toDropoff' ? 'DROPOFF' : null;
  const route =
    target && input.route && input.route.target === target && input.route.points.length >= 2 ? input.route : null;
  const targetPoint = target === 'PICKUP' ? pickup : target === 'DROPOFF' ? dropoff : null;
  const driverId = `${prefix}driver`;

  const markers: SceneMarker[] = [];
  const showPickup = stage !== 'toDropoff' && stage !== 'delivered';
  if (pickup && showPickup) {
    markers.push({ id: `${prefix}pickup`, kind: 'pickup', ...pickup, pulse: stage === 'searching', title: input.labels?.pickup });
  }
  if (dropoff) {
    markers.push({
      id: `${prefix}dropoff`,
      kind: 'dropoff',
      ...dropoff,
      pulse: stage !== 'delivered' && stage !== 'cancelled',
      title: input.labels?.dropoff,
    });
  }
  if (driver) {
    markers.push({
      id: driverId,
      kind: 'driver',
      lat: driver.lat,
      lng: driver.lng,
      heading: driver.heading,
      vehicleType: input.vehicleType,
      title: input.labels?.driver,
    });
  }

  const lines: SceneLine[] = [];
  if (driver && targetPoint) {
    // Itinéraire de secours (`source: straight`, service de calcul indisponible) : en pointillés, comme sans itinéraire.
    if (route) {
      lines.push({
        id: `${prefix}route`,
        kind: route.source === 'straight' ? 'dashed' : 'route',
        points: routePoints(route),
        trimToMarkerId: driverId,
      });
    }
    else lines.push({ id: `${prefix}direct`, kind: 'dashed', points: [driver, targetPoint], trimToMarkerId: driverId });
  }
  // Étape suivante (retrait → destinataire) en pointillés tant que le colis n'est pas récupéré.
  if (pickup && dropoff && (stage === 'searching' || stage === 'pending' || stage === 'toPickup')) {
    lines.push({ id: `${prefix}next`, kind: 'dashed', points: [pickup, dropoff] });
  }

  let fitPoints: MapPoint[];
  // Livreur + cible, et le reste de l'itinéraire (pas la partie déjà parcourue).
  if (driver && targetPoint) fitPoints = [driver, targetPoint, ...(route ? routeProgress(route, driver).remaining : [])];
  else if (stage === 'delivered') fitPoints = dropoff ? [dropoff] : [];
  else if (stage === 'toDropoff') fitPoints = [dropoff, driver].filter((p): p is MapPoint => !!p);
  else fitPoints = [pickup, dropoff].filter((p): p is MapPoint => !!p);

  return { stage, target, markers, lines, fitPoints, route, driver };
}

/** Entrée de scène d'une course vue par l'entreprise (ou le livreur). `live` : position plus récente (socket). */
export function orderSceneInput(o: OrderDto, live?: LiveDriver | null): SceneInput {
  const loc = o.driver?.lastLocation ?? null;
  return {
    id: o.id,
    status: o.status,
    vehicleType: o.driver?.vehicleType ?? o.vehicleType,
    pickup: o.pickup,
    dropoff: o.dropoff,
    driver: live ?? (loc ? { lat: loc.lat, lng: loc.lng, heading: loc.heading ?? null } : null),
    route: o.route ?? null,
    labels: {
      pickup: o.store?.name ?? 'Point de retrait',
      dropoff: o.recipientName ?? 'Destinataire',
      driver: o.driver?.name ?? 'Livreur',
    },
  };
}

/** Entrée de scène de la page publique du destinataire. */
export function trackingSceneInput(t: TrackingDto): SceneInput {
  const loc = t.driver?.lastLocation ?? null;
  return {
    status: t.status,
    vehicleType: t.driver?.vehicleType ?? t.vehicleType,
    pickup: t.pickup,
    dropoff: t.dropoff,
    driver: loc ? { lat: loc.lat, lng: loc.lng, heading: loc.heading ?? null } : null,
    route: t.route,
    labels: { pickup: t.sender.name, dropoff: 'Vous', driver: t.driver?.firstName ?? 'Livreur' },
  };
}

/**
 * Carte d'ensemble de l'entreprise : son point de retrait (radar si une livraison attend un livreur), les
 * destinataires et les livreurs de toutes les livraisons en cours.
 */
export function overviewScene(
  business: MapPoint | null,
  deliveries: OrderDto[],
  businessName?: string,
): { markers: SceneMarker[]; lines: SceneLine[]; fitPoints: MapPoint[] } {
  const markers: SceneMarker[] = [];
  const lines: SceneLine[] = [];
  const fitPoints: MapPoint[] = [];
  let searching = false;
  for (const o of deliveries) {
    const s = buildScene(orderSceneInput(o));
    if (s.stage === 'searching') searching = true;
    for (const m of s.markers) {
      // Un seul marqueur pour l'entreprise, sauf retrait ailleurs qu'à son adresse.
      if (m.kind === 'pickup' && business && distanceM(m, business) < 60) continue;
      markers.push(m);
    }
    lines.push(...s.lines);
    fitPoints.push(...s.markers.map((m) => ({ lat: m.lat, lng: m.lng })));
  }
  if (business) {
    markers.unshift({ id: 'business', kind: 'pickup', ...business, pulse: searching, title: businessName });
    fitPoints.push(business);
  }
  return { markers, lines, fitPoints };
}

/**
 * Minutes avant l'arrivée chez le destinataire. Priorité à l'estimation de l'API (`etaMinutes`), sinon
 * calcul local : durée restante de l'itinéraire (au prorata du tracé), plus le trajet retrait → livraison
 * tant que le colis n'est pas récupéré ; à défaut, distance estimée (× 1,3) à la vitesse moyenne du véhicule.
 */
export function estimateArrivalMinutes(scene: LiveScene, input: SceneInput, apiEta?: number | null): number | null {
  if (!isLiveStage(scene.stage)) return null;
  if (apiEta !== null && apiEta !== undefined && Number.isFinite(apiEta)) return Math.max(0, Math.round(apiEta));
  const speed = AVERAGE_SPEED_KMH[input.vehicleType];
  const legS = (a: MapPoint, b: MapPoint) => (roadDistanceKm(a, b) / speed) * 3600;
  const pickup = pt(input.pickup);
  const dropoff = pt(input.dropoff);
  const driver = scene.driver;
  if (!driver) return null;
  let seconds: number;
  if (scene.route) seconds = routeProgress(scene.route, driver).remainingS;
  else if (scene.stage === 'toPickup' && pickup) seconds = legS(driver, pickup);
  else if (dropoff) seconds = legS(driver, dropoff);
  else return null;
  if (scene.stage === 'toPickup' && pickup && dropoff) seconds += legS(pickup, dropoff);
  return minutesFromSeconds(seconds);
}
