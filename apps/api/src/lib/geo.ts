/**
 * Géométrie des itinéraires (tracés [lat, lng]) : décodage des polylignes Google/OSRM, simplification
 * (Douglas–Peucker), projection d'une position sur un tracé (écart au tracé, distance déjà parcourue) et cap.
 * Les distances sont en mètres. À l'échelle d'une ville, une projection équirectangulaire locale suffit.
 */
import { haversineKm, type LatLng } from '@yaar/shared';

/** Point de tracé [lat, lng] (format de `RouteDto.points`). */
export type LatLngTuple = [number, number];

const EARTH_RADIUS_M = 6_371_008.8;
const RAD = Math.PI / 180;

export function distanceM(a: LatLng, b: LatLng): number {
  return haversineKm(a, b) * 1000;
}

/** Arrondi à 5 décimales (≈ 1,1 m) : précision des polylignes OSRM, charge utile réduite. */
export function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

/**
 * Décode une polyligne encodée (algorithme Google, précision 5 pour OSRM `geometries=polyline`).
 * Lève une erreur si la chaîne est tronquée, contient un caractère invalide ou des coordonnées hors bornes.
 */
export function decodePolyline(encoded: string, precision = 5): LatLngTuple[] {
  const factor = 10 ** precision;
  const points: LatLngTuple[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = (): number => {
    let result = 0;
    let shift = 0;
    for (;;) {
      if (index >= encoded.length) throw new Error('Polyligne tronquée');
      const b = encoded.charCodeAt(index++) - 63;
      if (b < 0 || b > 63) throw new Error('Caractère invalide dans la polyligne');
      // 6 blocs de 5 bits au plus (30 bits) : au-delà, la valeur déborderait des entiers 32 bits.
      if (shift > 25) throw new Error('Valeur trop longue dans la polyligne');
      result |= (b & 0x1f) << shift;
      shift += 5;
      if (b < 0x20) break;
    }
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    const p: LatLngTuple = [lat / factor, lng / factor];
    if (Math.abs(p[0]) > 90 || Math.abs(p[1]) > 180) throw new Error('Coordonnées hors bornes dans la polyligne');
    points.push(p);
  }
  return points;
}

/** Encodage inverse (tests, outils). */
export function encodePolyline(points: ReadonlyArray<LatLngTuple>, precision = 5): string {
  const factor = 10 ** precision;
  let out = '';
  let prevLat = 0;
  let prevLng = 0;
  const encode = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    out += String.fromCharCode(n + 63);
  };
  for (const [la, ln] of points) {
    const lat = Math.round(la * factor);
    const lng = Math.round(ln * factor);
    encode(lat - prevLat);
    encode(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}

/** Projection plane locale (mètres) autour de la latitude `lat0`. */
function toXY(p: LatLngTuple, lat0: number, lng0: number): { x: number; y: number } {
  return {
    x: (p[1] - lng0) * RAD * EARTH_RADIUS_M * Math.cos(lat0 * RAD),
    y: (p[0] - lat0) * RAD * EARTH_RADIUS_M,
  };
}

/**
 * Point le plus proche de `p` sur le segment [a, b] : distance (m) et position relative `t` (0 = a, 1 = b).
 */
function closestOnSegment(p: LatLngTuple, a: LatLngTuple, b: LatLngTuple): { distanceM: number; t: number } {
  const lat0 = a[0];
  const lng0 = a[1];
  const P = toXY(p, lat0, lng0);
  const B = toXY(b, lat0, lng0);
  const len2 = B.x * B.x + B.y * B.y;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (P.x * B.x + P.y * B.y) / len2));
  const dx = P.x - t * B.x;
  const dy = P.y - t * B.y;
  return { distanceM: Math.sqrt(dx * dx + dy * dy), t };
}

/**
 * Douglas–Peucker itératif (pas de récursion profonde) : retire les points à moins de `toleranceM` mètres
 * de la corde ; le premier et le dernier point sont toujours conservés.
 */
export function simplifyPolyline(points: ReadonlyArray<LatLngTuple>, toleranceM: number): LatLngTuple[] {
  const n = points.length;
  if (n <= 2) return points.map((p) => [p[0], p[1]] as LatLngTuple);
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxD = -1;
    let idx = -1;
    for (let i = start + 1; i < end; i++) {
      const d = closestOnSegment(points[i]!, points[start]!, points[end]!).distanceM;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > toleranceM) {
      keep[idx] = 1;
      stack.push([start, idx], [idx, end]);
    }
  }
  const out: LatLngTuple[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push([points[i]![0], points[i]![1]]);
  return out;
}

/** Retire les points consécutifs identiques. */
function dedupe(points: ReadonlyArray<LatLngTuple>): LatLngTuple[] {
  const out: LatLngTuple[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push([p[0], p[1]]);
  }
  if (out.length === 1 && points.length > 1) out.push([out[0]![0], out[0]![1]]);
  return out;
}

/**
 * Réduit un tracé à `maxPoints` points au plus : Douglas–Peucker avec une tolérance de départ de 5 m
 * (invisible à l'échelle d'une rue : supprime les points alignés), doublée jusqu'à respecter la limite.
 * Premier et dernier points conservés.
 */
export function downsamplePolyline(points: ReadonlyArray<LatLngTuple>, maxPoints = 300, initialToleranceM = 5): LatLngTuple[] {
  if (maxPoints < 2) throw new Error('maxPoints doit être au moins 2');
  const base = dedupe(points);
  let tolerance = initialToleranceM;
  let out = simplifyPolyline(base, tolerance);
  while (out.length > maxPoints) {
    tolerance *= 2;
    out = simplifyPolyline(base, tolerance);
  }
  return out;
}

/** Longueur d'un tracé (m). */
export function polylineLengthM(points: ReadonlyArray<LatLngTuple>): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceM(tupleToLatLng(points[i - 1]!), tupleToLatLng(points[i]!));
  return total;
}

export function tupleToLatLng(p: LatLngTuple): LatLng {
  return { lat: p[0], lng: p[1] };
}

export interface Projection {
  /** Écart entre la position et le tracé (m). */
  distanceM: number;
  /** Distance le long du tracé, du départ jusqu'au point projeté (m). */
  alongM: number;
  /** Longueur totale du tracé (m). */
  totalM: number;
}

/**
 * Projette une position sur le tracé (point le plus proche). Quand plusieurs passages du tracé sont presque
 * aussi proches (aller-retour dans des rues parallèles), le plus tôt sur le tracé est retenu : l'estimation
 * restante est alors prudente (jamais trop optimiste).
 */
export function projectOnPolyline(points: ReadonlyArray<LatLngTuple>, pos: LatLng, ambiguityM = 20): Projection {
  if (points.length === 0) return { distanceM: Number.POSITIVE_INFINITY, alongM: 0, totalM: 0 };
  const p: LatLngTuple = [pos.lat, pos.lng];
  if (points.length === 1) return { distanceM: distanceM(pos, tupleToLatLng(points[0]!)), alongM: 0, totalM: 0 };
  const candidates: Array<{ distanceM: number; alongM: number }> = [];
  let cumulative = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const segLen = distanceM(tupleToLatLng(a), tupleToLatLng(b));
    const c = closestOnSegment(p, a, b);
    candidates.push({ distanceM: c.distanceM, alongM: cumulative + c.t * segLen });
    cumulative += segLen;
  }
  let best = candidates[0]!;
  for (const c of candidates) if (c.distanceM < best.distanceM) best = c;
  let chosen = best;
  for (const c of candidates) {
    if (c.distanceM <= best.distanceM + ambiguityM && c.alongM < chosen.alongM) chosen = c;
  }
  return { distanceM: best.distanceM, alongM: chosen.alongM, totalM: cumulative };
}

/** Part du tracé qui reste à parcourir depuis la position (0..1) ; 0 pour un tracé de longueur nulle. */
export function remainingFraction(points: ReadonlyArray<LatLngTuple>, pos: LatLng): number {
  const proj = projectOnPolyline(points, pos);
  if (proj.totalM <= 0) return 0;
  return Math.max(0, Math.min(1, (proj.totalM - proj.alongM) / proj.totalM));
}

/** Cap initial de `a` vers `b` en degrés (0 = nord, 90 = est, sens horaire), dans [0, 360). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const φ1 = a.lat * RAD;
  const φ2 = b.lat * RAD;
  const Δλ = (b.lng - a.lng) * RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const deg = Math.atan2(y, x) / RAD;
  return ((deg % 360) + 360) % 360;
}
