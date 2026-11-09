import {
  LABELS,
  OUAGADOUGOU_NEIGHBOURHOODS,
  distanceM,
  routeProgress,
  splitPolylineAt,
  type LatLng,
  type MapDataDto,
  type OrderDto,
  type OrderStatus,
  type RouteDto,
} from '@yaar/shared';
import { filterDrivers, type VehicleFilter } from '../mapState';
import type { LineKind, MapScene, SceneLine, SceneMarker } from './types';

/**
 * Ce que dessinent les cartes MapLibre de la console (fonctions pures, testées sans navigateur), avec les règles de
 * l'application mobile (apps/mobile/src/lib/liveScene.ts) :
 * - entreprises : carré orange ; destinataires des livraisons en cours : épingle verte ;
 * - livreurs : pastille ronde (anneau vert = libre, bleu = en livraison) avec une flèche de cap ;
 * - livraison en attente d'un livreur : anneaux rouges pulsés au point de retrait ; SOS : point rouge pulsé ;
 * - étape en cours d'un livreur occupé : itinéraire de l'API (`MapOrderDto.route`) en vert à liseré blanc, rogné à
 *   sa position ; pointillés vers la cible sans itinéraire ou avec la ligne droite de secours (`source: straight`).
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

/** Cible de l'étape en cours : retrait (ASSIGNED) ou destinataire (PICKED_UP) ; null hors course. */
export function legTarget(status: OrderStatus): 'PICKUP' | 'DROPOFF' | null {
  return status === 'ASSIGNED' ? 'PICKUP' : status === 'PICKED_UP' ? 'DROPOFF' : null;
}

/** Itinéraire de l'API valable pour l'étape en cours (même cible, au moins deux points), sinon null. */
export function legRoute(status: OrderStatus, route: RouteDto | null | undefined): RouteDto | null {
  const target = legTarget(status);
  if (!target || !route || route.target !== target || route.points.length < 2) return null;
  return route;
}

export function routePoints(route: RouteDto): LatLng[] {
  return route.points.map(([lat, lng]) => ({ lat, lng }));
}

const valid = (p: LatLng | null | undefined): LatLng | null =>
  p && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? { lat: p.lat, lng: p.lng } : null;

/**
 * Ligne de l'étape en cours d'un livreur : itinéraire routier (vert) ; pointillés pour la ligne droite de secours
 * ou, sans itinéraire en cache, de la position du livreur jusqu'à la cible. null hors course.
 */
export function legLine(
  id: string,
  driverMarkerId: string,
  driver: LatLng,
  status: OrderStatus,
  pickup: LatLng | null,
  dropoff: LatLng | null,
  route: RouteDto | null | undefined,
): SceneLine | null {
  const target = legTarget(status);
  if (!target) return null;
  const r = legRoute(status, route);
  if (r) {
    const kind: LineKind = r.source === 'straight' ? 'dashed' : 'route';
    return { id, kind, points: routePoints(r), trimToMarkerId: driverMarkerId };
  }
  const targetPoint = valid(target === 'PICKUP' ? pickup : dropoff);
  if (!targetPoint) return null;
  return { id, kind: 'dashed', points: [{ lat: driver.lat, lng: driver.lng }, targetPoint], trimToMarkerId: driverMarkerId };
}

/** Un point de retrait à moins de cette distance d'une entreprise est représenté par l'entreprise elle-même. */
export const SAME_PLACE_M = 60;

/** Carte en direct (GET /controller/map) filtrée par véhicule (les entreprises et les SOS restent affichés). */
export function buildLiveScene(data: MapDataDto, filter: VehicleFilter): MapScene {
  const markers: SceneMarker[] = [];
  const lines: SceneLine[] = [];
  const shown = (v: string) => filter === 'ALL' || v === filter;
  const ordersById = new Map(data.orders.map((o) => [o.id, o]));

  for (const s of data.stores) {
    markers.push({
      id: `business:${s.id}`,
      kind: 'business',
      lat: s.lat,
      lng: s.lng,
      title: s.isOpen ? s.name : `${s.name} (fermée)`,
      dimmed: !s.isOpen,
    });
  }
  const nearBusiness = (p: LatLng) => data.stores.some((s) => distanceM(p, s) < SAME_PLACE_M);

  for (const o of data.orders) {
    if (!shown(o.vehicleType)) continue;
    const vehicle = LABELS.vehicleType[o.vehicleType];
    markers.push({
      id: `dropoff:${o.id}`,
      kind: 'dropoff',
      lat: o.dropoff.lat,
      lng: o.dropoff.lng,
      title: `Livraison #${o.number} · destinataire : ${o.dropoff.address}`,
      orderId: o.id,
    });
    // Retrait ailleurs qu'à l'adresse d'une entreprise (entrepôt…) : son propre carré, tant que le colis n'est pas pris.
    if (o.status !== 'PICKED_UP' && !nearBusiness(o.pickup)) {
      markers.push({
        id: `pickup:${o.id}`,
        kind: 'business',
        lat: o.pickup.lat,
        lng: o.pickup.lng,
        title: `Retrait de la livraison #${o.number} : ${o.pickup.address}`,
        orderId: o.id,
      });
    }
    if (o.status === 'SEARCHING_DRIVER') {
      markers.push({
        id: `search:${o.id}`,
        kind: 'search',
        lat: o.pickup.lat,
        lng: o.pickup.lng,
        label: `#${o.number}`,
        title: `Livraison #${o.number} · ${vehicle} · recherche d’un livreur · ${o.pickup.address} → ${o.dropoff.address}`,
        orderId: o.id,
      });
      lines.push({ id: `next:${o.id}`, kind: 'next', points: [{ ...o.pickup }, { ...o.dropoff }] });
    }
  }

  for (const d of filterDrivers(data.drivers, filter)) {
    const order = d.activeOrderId ? ordersById.get(d.activeOrderId) : undefined;
    const id = `driver:${d.id}`;
    markers.push({
      id,
      kind: 'driver',
      lat: d.lat,
      lng: d.lng,
      heading: d.heading ?? null,
      vehicleType: d.vehicleType,
      busy: d.isBusy,
      title: `${d.name ?? 'Livreur'} · ${LABELS.vehicleType[d.vehicleType]} · ${order ? `livraison #${order.number}` : d.isBusy ? 'en livraison' : 'libre'}`,
      driverId: d.id,
    });
    if (order) {
      const line = legLine(`leg:${order.id}`, id, d, order.status, order.pickup, order.dropoff, order.route);
      if (line) lines.push(line);
    }
  }

  for (const sos of data.openSos) {
    if (sos.lat === null || sos.lng === null) continue;
    const who = sos.reporter.name ?? 'Livreur';
    markers.push({
      id: `sos:${sos.id}`,
      kind: 'sos',
      lat: sos.lat,
      lng: sos.lng,
      label: `SOS · ${who}`,
      title: `SOS · ${who}${sos.description ? ` · ${sos.description}` : ''}`,
    });
  }
  return { markers, lines };
}

export interface DeliveryScene extends MapScene {
  stage: DeliveryStage;
  /** Points à garder visibles : livreur + cible et reste de l'itinéraire, sinon retrait + destinataire. */
  fitPoints: LatLng[];
}

/** Carte d'une livraison (fiche) : retrait, destinataire, livreur et itinéraire de l'étape en cours. */
export function buildDeliveryScene(o: OrderDto): DeliveryScene {
  const stage = stageOf(o.status);
  const pickup = valid(o.pickup);
  const dropoff = valid(o.dropoff);
  const loc = o.driver?.lastLocation ?? null;
  const driver = isLiveStage(stage) && loc ? valid(loc) : null;
  const markers: SceneMarker[] = [];
  const lines: SceneLine[] = [];
  const driverId = 'driver';

  if (pickup) {
    markers.push({ id: 'pickup', kind: 'business', ...pickup, title: `Retrait : ${o.store?.name ?? o.pickup?.address ?? 'point de retrait'}` });
    if (stage === 'searching') markers.push({ id: 'search', kind: 'search', ...pickup, title: 'Recherche d’un livreur' });
  }
  if (dropoff) {
    markers.push({
      id: 'dropoff',
      kind: 'dropoff',
      ...dropoff,
      pulse: stage !== 'delivered' && stage !== 'cancelled',
      title: `Destinataire : ${o.recipientName ?? o.dropoff?.address ?? 'livraison'}`,
    });
  }
  if (driver && o.driver) {
    markers.push({
      id: driverId,
      kind: 'driver',
      ...driver,
      heading: loc?.heading ?? null,
      vehicleType: o.driver.vehicleType,
      busy: true,
      title: `${o.driver.name ?? 'Livreur'} · ${LABELS.vehicleType[o.driver.vehicleType]}`,
      driverId: o.driver.id,
    });
    const line = legLine('leg', driverId, driver, o.status, pickup, dropoff, o.route);
    if (line) lines.push(line);
  }
  // Trajet retrait → destinataire (pointillés discrets) tant que le colis n'est pas en route vers le destinataire.
  if (pickup && dropoff && stage !== 'toDropoff') lines.push({ id: 'next', kind: 'next', points: [pickup, dropoff] });

  const target = stage === 'toPickup' ? pickup : stage === 'toDropoff' ? dropoff : null;
  const route = legRoute(o.status, o.route);
  let fitPoints: LatLng[];
  if (driver && target) fitPoints = [driver, target, ...(route ? routeProgress(route, driver).remaining : [])];
  else fitPoints = [pickup, dropoff].filter((p): p is LatLng => !!p);
  return { markers, lines, stage, fitPoints };
}

/* ------------------------------------------------------------------ */
/* Lignes à dessiner pour les positions animées                        */
/* ------------------------------------------------------------------ */

export interface DrawnLine {
  id: string;
  kind: LineKind;
  points: LatLng[];
}

/** Au-delà de cette distance à l'itinéraire, un court pointillé relie le livreur au tracé. */
export const OFF_ROUTE_JOIN_M = 35;

/**
 * Lignes à dessiner pour les positions courantes (animées) des livreurs : l'itinéraire est rogné au point le plus
 * proche du livreur (la partie parcourue disparaît), la ligne droite part du livreur.
 */
export function resolveLines(lines: SceneLine[], positionOf: (markerId: string) => LatLng | null | undefined): DrawnLine[] {
  const out: DrawnLine[] = [];
  for (const line of lines) {
    let points = line.points;
    const pos = line.trimToMarkerId ? positionOf(line.trimToMarkerId) : null;
    if (pos) {
      if (line.kind === 'route') {
        const split = splitPolylineAt(points, pos);
        if (split) {
          points = split.remaining;
          if (split.projection.distanceM > OFF_ROUTE_JOIN_M) {
            out.push({ id: `${line.id}-join`, kind: 'dashed', points: [pos, split.projection.point] });
          }
        }
      } else if (points.length > 0) {
        points = [pos, ...points.slice(1)];
      }
    }
    if (points.length >= 2) out.push({ id: line.id, kind: line.kind, points });
  }
  return out;
}

/** Clé stable d'une liste de points (≈ 1 m) : évite de redessiner pour des changements insignifiants. */
export function pointsKey(points: ReadonlyArray<LatLng>): string {
  return points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');
}

/** Clé d'une scène, comparée par valeur : une scène identique après un rafraîchissement ne touche pas la carte. */
export function sceneKey(scene: MapScene): string {
  const m = scene.markers
    .map(
      (x) =>
        `${x.id}:${x.kind}:${x.lat.toFixed(6)},${x.lng.toFixed(6)}:${x.heading ?? ''}:${x.busy ? 1 : 0}:${x.pulse ? 1 : 0}:` +
        `${x.dimmed ? 1 : 0}:${x.vehicleType ?? ''}:${x.label ?? ''}:${x.title}`,
    )
    .join(';');
  const l = scene.lines.map((x) => `${x.id}:${x.kind}:${x.trimToMarkerId ?? ''}:${pointsKey(x.points)}`).join(';');
  return `${m}#${l}`;
}

/** Points du cadrage initial de la carte en direct (tout ce qui est affiché, sauf les noms de quartiers). */
export function scenePoints(scene: MapScene): LatLng[] {
  return scene.markers.filter((m) => m.kind !== 'label').map((m) => ({ lat: m.lat, lng: m.lng }));
}

/** Noms des quartiers, affichés seulement sur le fond de secours (aucun nom de rue sans les tuiles). */
export function neighbourhoodLabels(): SceneMarker[] {
  return OUAGADOUGOU_NEIGHBOURHOODS.map((n) => ({
    id: `label:${n.name}`,
    kind: 'label' as const,
    lat: n.lat,
    lng: n.lng,
    label: n.name,
    title: n.name,
  }));
}
