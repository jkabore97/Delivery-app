import {
  arrivalClockFr,
  AVERAGE_SPEED_KMH,
  distanceM,
  formatDurationFr,
  minutesFromSeconds,
  roadDistanceKm,
  routeProgress,
  type OrderDto,
  type OrderStatus,
  type RouteDto,
  type TrackingDto,
  type VehicleType,
} from '@yaar/shared';
import { avatarInitials } from '../components/map/markerArt';
import type { MapPoint, SceneLine, SceneMarker } from '../components/map/types';
import { fixTime } from './map/motion';

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
  /** Horodatage (ms) du relevé GPS : durée réelle du glissement entre deux positions. */
  at?: number | null;
}

/** Livreur à moins de cette distance de l'entreprise (retrait) : son marqueur est décalé pour ne pas la cacher. */
export const NUDGE_AT_PICKUP_M = 40;

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
  /**
   * Épingles « avatar » (facultatif) : initiales de l'entreprise (retrait) et du destinataire à la place des
   * pictogrammes. Sans elles, les marqueurs habituels (écrans de l'entreprise et du destinataire).
   */
  initials?: { pickup?: string | null; dropoff?: string | null };
  /**
   * Page du destinataire : pendant que le livreur va chez l'entreprise, la caméra garde aussi l'épingle du
   * destinataire (« vous ») dans le cadre.
   */
  keepDropoffInView?: boolean;
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
  const driver = live && input.driver ? { ...pt(input.driver)!, heading: input.driver.heading ?? null, at: input.driver.at ?? null } : null;
  const target = stage === 'toPickup' ? 'PICKUP' : stage === 'toDropoff' ? 'DROPOFF' : null;
  const route =
    target && input.route && input.route.target === target && input.route.points.length >= 2 ? input.route : null;
  const targetPoint = target === 'PICKUP' ? pickup : target === 'DROPOFF' ? dropoff : null;
  const driverId = `${prefix}driver`;

  const markers: SceneMarker[] = [];
  const showPickup = stage !== 'toDropoff' && stage !== 'delivered';
  if (pickup && showPickup) {
    markers.push({
      id: `${prefix}pickup`,
      kind: 'pickup',
      ...pickup,
      pulse: stage === 'searching',
      title: input.labels?.pickup,
      ...(input.initials?.pickup ? { initials: input.initials.pickup } : {}),
    });
  }
  if (dropoff) {
    markers.push({
      id: `${prefix}dropoff`,
      kind: 'dropoff',
      ...dropoff,
      pulse: stage !== 'delivered' && stage !== 'cancelled',
      title: input.labels?.dropoff,
      ...(input.initials?.dropoff ? { initials: input.initials.dropoff } : {}),
    });
  }
  if (driver) {
    markers.push({
      id: driverId,
      kind: 'driver',
      lat: driver.lat,
      lng: driver.lng,
      heading: driver.heading,
      fixAt: driver.at ?? null,
      vehicleType: input.vehicleType,
      nudge: stage === 'toPickup' && !!pickup && distanceM(driver, pickup) < NUDGE_AT_PICKUP_M,
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
  // Livreur + cible, et le reste de l'itinéraire (pas la partie déjà parcourue) ; le destinataire garde aussi son
  // épingle dans le cadre pendant le retrait.
  if (driver && targetPoint) {
    fitPoints = [driver, targetPoint, ...(route ? routeProgress(route, driver).remaining : [])];
    if (input.keepDropoffInView && stage === 'toPickup' && dropoff) fitPoints.push(dropoff);
  }
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
    driver: live ?? (loc ? { lat: loc.lat, lng: loc.lng, heading: loc.heading ?? null, at: fixTime(loc.at) } : null),
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
    driver: loc ? { lat: loc.lat, lng: loc.lng, heading: loc.heading ?? null, at: fixTime(loc.at) } : null,
    route: t.route,
    labels: { pickup: t.sender.name, dropoff: 'Vous', driver: t.driver?.firstName ?? 'Livreur' },
    keepDropoffInView: true,
  };
}

/**
 * Carte d'ensemble de l'entreprise : son point de retrait (radar si une livraison attend un livreur), les
 * destinataires et les livreurs de toutes les livraisons en cours. `recipientInitials` : destinataires en épingles
 * « avatar » à leurs initiales (l'entreprise garde son pictogramme : c'est « chez elle »).
 *
 * Cadrage : l'entreprise et les livraisons qui bougent (livreur et cible de son étape : l'entreprise pour un retrait,
 * le destinataire pour une livraison) ; les destinataires des livraisons qui attendent un livreur n'entrent dans le
 * cadre que s'il n'y a aucune livraison en route (avec beaucoup de livraisons, la carte ne se dézoome plus sur toute
 * la ville : leurs épingles restent sur la carte, hors du cadre au besoin).
 */
export function overviewScene(
  business: MapPoint | null,
  deliveries: OrderDto[],
  businessName?: string,
  opts: { recipientInitials?: boolean } = {},
): { markers: SceneMarker[]; lines: SceneLine[]; fitPoints: MapPoint[] } {
  const markers: SceneMarker[] = [];
  const lines: SceneLine[] = [];
  const live: MapPoint[] = [];
  const waiting: MapPoint[] = [];
  let searching = false;
  for (const o of deliveries) {
    const input = orderSceneInput(o);
    const s = buildScene(opts.recipientInitials ? { ...input, initials: { dropoff: avatarInitials(o.recipientName) } } : input);
    if (s.stage === 'searching') searching = true;
    for (const m of s.markers) {
      // Un seul marqueur pour l'entreprise, sauf retrait ailleurs qu'à son adresse.
      if (m.kind === 'pickup' && business && distanceM(m, business) < 60) continue;
      markers.push(m);
    }
    lines.push(...s.lines);
    if (isLiveStage(s.stage) && s.driver) {
      // Livreur et cible de l'étape en cours (pas le destinataire pendant le retrait).
      const target = s.target === 'PICKUP' ? pt(input.pickup) : pt(input.dropoff);
      live.push({ lat: s.driver.lat, lng: s.driver.lng }, ...(target ? [target] : []));
    } else {
      waiting.push(...s.markers.map((m) => ({ lat: m.lat, lng: m.lng })));
    }
  }
  const fitPoints = live.length > 0 ? live : waiting;
  if (business) {
    markers.unshift({ id: 'business', kind: 'pickup', ...business, pulse: searching, title: businessName });
    fitPoints.push(business);
  }
  return { markers, lines, fitPoints };
}

/**
 * Minutes avant l'arrivée du livreur chez l'entreprise (retrait), pendant ASSIGNED seulement : durée restante de
 * l'itinéraire vers le retrait (au prorata du tracé), à défaut distance estimée (× 1,3) à la vitesse moyenne du
 * véhicule. L'estimation de l'API (`etaMinutes`) porte, elle, sur la livraison au destinataire.
 */
export function estimatePickupMinutes(scene: LiveScene, input: SceneInput): number | null {
  if (scene.stage !== 'toPickup' || !scene.driver) return null;
  const pickup = pt(input.pickup);
  // Déjà sur place (le livreur attend le colis) : arrivée imminente, avec ou sans itinéraire.
  if (pickup && distanceM(scene.driver, pickup) < NUDGE_AT_PICKUP_M) return 0;
  if (scene.route && scene.route.target === 'PICKUP') return minutesFromSeconds(routeProgress(scene.route, scene.driver).remainingS);
  if (!pickup) return null;
  return minutesFromSeconds((roadDistanceKm(scene.driver, pickup) / AVERAGE_SPEED_KMH[input.vehicleType]) * 3600);
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

/**
 * « Livraison chez Awa prévue vers 14:41 » : heure de livraison au destinataire, rappelée sous l'arrivée du livreur
 * au retrait (jamais avant cette arrivée). `recipient` : nom à afficher (prénom, ou nom complet d'une entreprise).
 */
export function deliveryEtaLine(
  deliveryMinutes: number | null,
  now: number,
  recipient?: string | null,
  pickupMinutes?: number | null,
): string | null {
  if (deliveryMinutes === null || !Number.isFinite(deliveryMinutes)) return null;
  const who = recipient?.trim() || null;
  const minutes = Math.max(pickupMinutes ?? 0, deliveryMinutes);
  return `Livraison${who ? ` chez ${who}` : ''} prévue vers ${arrivalClockFr(Math.round(minutes), now)}`;
}

/**
 * Ligne d'arrivée d'une livraison dans la liste de l'entreprise : livreur en route vers le retrait → « Au retrait
 * dans 2 min · livraison vers 14:41 » (déjà chez l'entreprise : « Livreur sur place · livraison vers 14:41 » ; position
 * inconnue : « Livraison vers 14:41 ») ; colis récupéré → « Arrivée vers 14:41 · dans 12 min ». Toujours avec une
 * majuscule initiale.
 */
export function arrivalSummary(o: OrderDto, now: number): string | null {
  const input = orderSceneInput(o);
  const scene = buildScene(input);
  const delivery = estimateArrivalMinutes(scene, input, o.etaMinutes);
  if (scene.stage === 'toPickup') {
    const pickup = estimatePickupMinutes(scene, input);
    const first = pickup === null ? null : pickup < 1 ? 'Livreur sur place' : `Au retrait dans ${formatDurationFr(pickup)}`;
    const then = delivery === null ? null : `livraison vers ${arrivalClockFr(Math.round(Math.max(pickup ?? 0, delivery)), now)}`;
    const text = [first, then].filter(Boolean).join(' · ');
    return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : null;
  }
  if (delivery === null) return null;
  return delivery < 1 ? 'Arrivée imminente' : `Arrivée vers ${arrivalClockFr(Math.round(delivery), now)} · dans ${formatDurationFr(delivery)}`;
}

/**
 * Minutes avant l'arrivée chez le destinataire d'une livraison de la liste (tri de l'accueil de l'entreprise) :
 * la même estimation que la ligne d'arrivée de sa carte ; null sans livreur en route ou sans estimation.
 */
export function arrivalMinutesOf(o: OrderDto): number | null {
  const input = orderSceneInput(o);
  const scene = buildScene(input);
  return estimateArrivalMinutes(scene, input, o.etaMinutes);
}
