/**
 * Géométrie des cartes de suivi (style Uber / DoorDash) : cap, interpolation, projection d'un point sur un
 * itinéraire (pour « rogner » la partie déjà parcourue), distance restante, cadrage et textes français
 * (distance, durée, heure d'arrivée). Fonctions pures, sans dépendance : application mobile (web et natif)
 * et console.
 *
 * Conventions : `LatLng` = { lat, lng } en degrés décimaux (WGS84) ; un itinéraire `RouteDto.points` est une
 * liste de couples [lat, lng] (attention : MapLibre / GeoJSON attendent [lng, lat]). Les distances sont en
 * mètres, les durées en secondes, les caps en degrés (0 = nord, sens horaire). Ouagadougou est en UTC+0 toute
 * l'année : les heures affichées sont les heures UTC.
 */
import type { LatLng } from './geo';

/** Point d'un itinéraire de l'API (`RouteDto.points`) : [lat, lng]. */
export type LatLngTuple = [number, number];

/** Rayon moyen de la Terre (m), le même que `haversineKm`. */
const EARTH_RADIUS_M = 6_371_008.8;
const DEG = Math.PI / 180;

function clamp01(t: number): number {
  if (!Number.isFinite(t)) return 0;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Accepte un point { lat, lng } ou un couple [lat, lng]. */
export function toLatLng(p: LatLng | readonly [number, number]): LatLng {
  return Array.isArray(p) ? { lat: p[0] as number, lng: p[1] as number } : (p as LatLng);
}

/** Couple [lat, lng] (format de `RouteDto.points`). */
export function toLatLngTuple(p: LatLng): LatLngTuple {
  return [p.lat, p.lng];
}

/** Distance orthodromique en mètres. */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Ramène un angle dans [0, 360). */
export function normalizeDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** Cap initial de `from` vers `to` (0 = nord, 90 = est), dans [0, 360). 0 si les points sont confondus. */
export function bearingDeg(from: LatLng, to: LatLng): number {
  const φ1 = from.lat * DEG;
  const φ2 = to.lat * DEG;
  const Δλ = (to.lng - from.lng) * DEG;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  if (Math.abs(x) < 1e-15 && Math.abs(y) < 1e-15) return 0;
  return normalizeDeg(Math.atan2(y, x) / DEG);
}

/** Écart signé le plus court de `from` à `to`, dans (-180, 180]. */
export function shortestAngleDelta(from: number, to: number): number {
  const d = normalizeDeg(to - from);
  return d > 180 ? d - 360 : d;
}

/** Interpolation linéaire entre deux positions (suffisante à l'échelle d'une ville), `t` borné à [0, 1]. */
export function interpolateLatLng(a: LatLng, b: LatLng, t: number): LatLng {
  const k = clamp01(t);
  return { lat: a.lat + (b.lat - a.lat) * k, lng: a.lng + (b.lng - a.lng) * k };
}

/** Interpolation d'un cap par le plus court chemin (350° → 10° passe par 0°), résultat dans [0, 360). */
export function interpolateBearing(from: number, to: number, t: number): number {
  return normalizeDeg(from + shortestAngleDelta(from, to) * clamp01(t));
}

/** Courbe d'animation douce (accélère puis ralentit), pour les déplacements de caméra et de marqueurs. */
export function easeInOutCubic(t: number): number {
  const k = clamp01(t);
  return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
}

/* ------------------------------------------------------------------ */
/* Itinéraires                                                         */
/* ------------------------------------------------------------------ */

type PolylineInput = ReadonlyArray<LatLng | readonly [number, number]>;

function normalizePolyline(points: PolylineInput): LatLng[] {
  const out: LatLng[] = [];
  for (const raw of points) {
    const p = toLatLng(raw);
    if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) out.push(p);
  }
  return out;
}

/** Longueur d'une ligne brisée (m). */
export function polylineLengthM(points: PolylineInput): number {
  const pts = normalizePolyline(points);
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += distanceM(pts[i - 1]!, pts[i]!);
  return total;
}

export interface PolylineProjection {
  /** Indice du segment [index, index + 1] qui porte le point projeté. */
  index: number;
  /** Position sur ce segment, de 0 (début) à 1 (fin). */
  t: number;
  /** Point de la ligne le plus proche. */
  point: LatLng;
  /** Distance entre le point donné et la ligne (m) : « hors itinéraire » si elle est grande. */
  distanceM: number;
  /** Distance parcourue le long de la ligne jusqu'au point projeté (m). */
  alongM: number;
}

/**
 * Point de la ligne le plus proche de `p` (projection orthogonale sur chaque segment, dans un plan local
 * équirectangulaire centré sur `p`). null pour une ligne vide.
 */
export function nearestPointOnPolyline(points: PolylineInput, p: LatLng): PolylineProjection | null {
  const pts = normalizePolyline(points);
  if (pts.length === 0) return null;
  const first = pts[0]!;
  if (pts.length === 1) return { index: 0, t: 0, point: first, distanceM: distanceM(first, p), alongM: 0 };

  // Plan local en mètres autour de p : x vers l'est, y vers le nord.
  const kx = Math.cos(p.lat * DEG) * DEG * EARTH_RADIUS_M;
  const ky = DEG * EARTH_RADIUS_M;
  const xy = (q: LatLng) => ({ x: (q.lng - p.lng) * kx, y: (q.lat - p.lat) * ky });

  let best: PolylineProjection | null = null;
  let walked = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const A = xy(a);
    const B = xy(b);
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : clamp01(-(A.x * dx + A.y * dy) / len2);
    const px = A.x + dx * t;
    const py = A.y + dy * t;
    const d = Math.hypot(px, py);
    const segLen = distanceM(a, b);
    if (!best || d < best.distanceM - 1e-9) {
      best = { index: i, t, point: interpolateLatLng(a, b, t), distanceM: d, alongM: walked + segLen * t };
    }
    walked += segLen;
  }
  return best;
}

export interface PolylineSplit {
  /** Partie déjà parcourue (du départ au point projeté). */
  travelled: LatLng[];
  /** Partie restante (du point projeté à l'arrivée) : c'est elle qu'on dessine. */
  remaining: LatLng[];
  projection: PolylineProjection;
}

/** Coupe la ligne au point le plus proche de `p` (position du livreur). null pour une ligne vide. */
export function splitPolylineAt(points: PolylineInput, p: LatLng): PolylineSplit | null {
  const pts = normalizePolyline(points);
  const projection = nearestPointOnPolyline(pts, p);
  if (!projection) return null;
  if (pts.length === 1) return { travelled: [pts[0]!], remaining: [pts[0]!], projection };
  const { index, point, t } = projection;
  // Projection sur un sommet : pas de point en double.
  if (t >= 1 - 1e-9) return { travelled: pts.slice(0, index + 2), remaining: pts.slice(index + 1), projection };
  if (t <= 1e-9) return { travelled: pts.slice(0, index + 1), remaining: pts.slice(index), projection };
  return {
    travelled: [...pts.slice(0, index + 1), point],
    remaining: [point, ...pts.slice(index + 1)],
    projection,
  };
}

/** Distance restante le long de la ligne à partir du point le plus proche de `p` (m). */
export function remainingDistanceM(points: PolylineInput, p: LatLng): number {
  const total = polylineLengthM(points);
  const projection = nearestPointOnPolyline(points, p);
  if (!projection) return 0;
  return Math.max(0, total - projection.alongM);
}

export interface RouteProgress {
  /** Ligne restante à dessiner (commence au point projeté du livreur). */
  remaining: LatLng[];
  /** Distance restante, à l'échelle de `distanceM` de l'API (m). */
  remainingM: number;
  /** Durée restante estimée, au prorata de la durée de l'API (s). */
  remainingS: number;
  /** Part parcourue, de 0 à 1. */
  fraction: number;
  /** Distance du livreur à l'itinéraire (m), 0 sans position. */
  offRouteM: number;
}

/**
 * Avancement sur un itinéraire de l'API (`RouteDto`) pour la position `p` du livreur (null : rien de
 * parcouru). Distance et durée restantes sont proportionnelles à la part restante du tracé, rapportées aux
 * valeurs de l'API (le tracé peut être simplifié, sa longueur géométrique diffère alors un peu de `distanceM`).
 */
export function routeProgress(
  route: { points: PolylineInput; distanceM: number; durationS: number },
  p: LatLng | null | undefined,
): RouteProgress {
  const pts = normalizePolyline(route.points);
  const geometric = polylineLengthM(pts);
  if (!p || pts.length < 2 || geometric <= 0) {
    return { remaining: pts, remainingM: Math.max(0, route.distanceM), remainingS: Math.max(0, route.durationS), fraction: 0, offRouteM: 0 };
  }
  const split = splitPolylineAt(pts, p)!;
  const left = Math.max(0, geometric - split.projection.alongM) / geometric;
  return {
    remaining: split.remaining,
    remainingM: Math.max(0, route.distanceM) * left,
    remainingS: Math.max(0, route.durationS) * left,
    fraction: 1 - left,
    offRouteM: split.projection.distanceM,
  };
}

/* ------------------------------------------------------------------ */
/* Cadrage                                                             */
/* ------------------------------------------------------------------ */

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Rectangle englobant des points valides ; null sans point. */
export function boundsOf(points: ReadonlyArray<LatLng | readonly [number, number] | null | undefined>): Bounds | null {
  let b: Bounds | null = null;
  for (const raw of points) {
    if (!raw) continue;
    const p = toLatLng(raw);
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    if (!b) b = { south: p.lat, west: p.lng, north: p.lat, east: p.lng };
    else {
      b.south = Math.min(b.south, p.lat);
      b.north = Math.max(b.north, p.lat);
      b.west = Math.min(b.west, p.lng);
      b.east = Math.max(b.east, p.lng);
    }
  }
  return b;
}

/**
 * Agrandit un rectangle de `ratio` × son étendue de chaque côté et garantit une étendue minimale
 * (`minSpanDeg`, ≈ 450 m par défaut) pour ne pas zoomer à l'extrême sur un point unique.
 */
export function padBounds(b: Bounds, ratio = 0.15, minSpanDeg = 0.004): Bounds {
  const latSpan = Math.max(b.north - b.south, minSpanDeg);
  const lngSpan = Math.max(b.east - b.west, minSpanDeg);
  const cLat = (b.north + b.south) / 2;
  const cLng = (b.east + b.west) / 2;
  const halfLat = (latSpan / 2) * (1 + 2 * ratio);
  const halfLng = (lngSpan / 2) * (1 + 2 * ratio);
  return { south: cLat - halfLat, north: cLat + halfLat, west: cLng - halfLng, east: cLng + halfLng };
}

export function boundsCenter(b: Bounds): LatLng {
  return { lat: (b.north + b.south) / 2, lng: (b.east + b.west) / 2 };
}

/** Région « react-native-maps » (centre + étendues) d'un rectangle, avec marge. */
export function regionForBounds(
  b: Bounds,
  opts: { paddingRatio?: number; minDelta?: number } = {},
): { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } {
  const padded = padBounds(b, opts.paddingRatio ?? 0.15, opts.minDelta ?? 0.004);
  const c = boundsCenter(padded);
  return {
    latitude: c.lat,
    longitude: c.lng,
    latitudeDelta: padded.north - padded.south,
    longitudeDelta: padded.east - padded.west,
  };
}

/* ------------------------------------------------------------------ */
/* Textes (français, heure de Ouagadougou = UTC)                       */
/* ------------------------------------------------------------------ */

/** « 850 m », « 1,2 km », « 12 km ». */
export function formatDistanceFr(meters: number): string {
  const m = Math.max(0, Number.isFinite(meters) ? meters : 0);
  if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  const km = m / 1000;
  if (km < 10) return `${(Math.round(km * 10) / 10).toFixed(1).replace('.', ',')} km`;
  return `${Math.round(km)} km`;
}

/** Minutes entières (au moins 1) d'une durée en secondes. */
export function minutesFromSeconds(seconds: number): number {
  return Math.max(1, Math.ceil(Math.max(0, seconds) / 60));
}

/** « 1 min », « 12 min », « 1 h », « 1 h 05 ». */
export function formatDurationFr(minutes: number): string {
  const total = Math.max(1, Math.round(Number.isFinite(minutes) ? minutes : 1));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/** Heure « 14:32 » (Ouagadougou = UTC+0). */
export function formatClockFr(epochMs: number): string {
  const d = new Date(epochMs);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** Heure d'arrivée estimée « 14:32 » à partir d'une estimation en minutes. */
export function arrivalClockFr(etaMinutes: number, nowMs: number): string {
  return formatClockFr(nowMs + Math.max(0, etaMinutes) * 60_000);
}

/**
 * Bandeau d'arrivée : « Arrivée vers 14:32 · dans 12 min » ; « Arrivée imminente » sous une minute.
 */
export function formatArrivalFr(etaMinutes: number, nowMs: number): string {
  if (!Number.isFinite(etaMinutes) || etaMinutes < 1) return 'Arrivée imminente';
  const eta = Math.round(etaMinutes);
  return `Arrivée vers ${arrivalClockFr(eta, nowMs)} · dans ${formatDurationFr(eta)}`;
}
