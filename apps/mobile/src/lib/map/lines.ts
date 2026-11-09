import { splitPolylineAt } from '@yaar/shared';
import type { MapPoint, SceneLine, SceneZone } from '../../components/map/types';

export interface DrawnLine {
  id: string;
  kind: 'route' | 'dashed';
  points: MapPoint[];
}

/** Au-delà de cette distance à l'itinéraire, un court pointillé relie le livreur au tracé. */
export const OFF_ROUTE_JOIN_M = 35;

/**
 * Lignes à dessiner pour les positions courantes (animées) des livreurs : l'itinéraire est rogné au point le
 * plus proche du livreur (la partie parcourue disparaît), la ligne droite part du livreur.
 */
export function resolveLines(lines: SceneLine[], positionOf: (markerId: string) => MapPoint | null | undefined): DrawnLine[] {
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

/**
 * Points de l'étape en cours telle qu'elle est dessinée depuis la position AFFICHÉE (animée) des livreurs : lignes
 * rognées à un livreur (itinéraire restant, raccord éventuel, ligne droite) et position du livreur. Ajoutés au cadrage
 * pour que le livreur reste visible pendant qu'il glisse vers sa dernière position connue.
 */
export function activeLegPoints(lines: SceneLine[], positionOf: (markerId: string) => MapPoint | null | undefined): MapPoint[] {
  const out: MapPoint[] = [];
  const active = lines.filter((l) => l.trimToMarkerId);
  for (const l of resolveLines(active, positionOf)) out.push(...l.points);
  for (const l of active) {
    const p = positionOf(l.trimToMarkerId!);
    if (p) out.push(p);
  }
  return out;
}

/** Clé stable d'une liste de points (≈ 1 m) : évite de redessiner pour des changements insignifiants. */
export function pointsKey(points: ReadonlyArray<MapPoint>): string {
  return points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');
}

/* ------------------------------------------------------------------ */
/* Zones approximatives (cercles)                                      */
/* ------------------------------------------------------------------ */

const EARTH_R_M = 6371008.8;

/** Point à `distM` mètres de `center` vers le cap `bearingDeg` (0 = nord) : petite distance, Terre sphérique. */
function offsetPoint(center: MapPoint, distM: number, bearingDeg: number): MapPoint {
  const b = (bearingDeg * Math.PI) / 180;
  const dLat = (distM * Math.cos(b)) / EARTH_R_M;
  const dLng = (distM * Math.sin(b)) / (EARTH_R_M * Math.cos((center.lat * Math.PI) / 180));
  return { lat: center.lat + (dLat * 180) / Math.PI, lng: center.lng + (dLng * 180) / Math.PI };
}

/** Contour [lng, lat] fermé (premier point répété à la fin) d'un cercle géographique, pour un polygone GeoJSON. */
export function circleRing(center: MapPoint, radiusM: number, steps = 64): Array<[number, number]> {
  const n = Math.max(8, Math.round(steps));
  const ring: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const p = offsetPoint(center, radiusM, (360 * i) / n);
    ring.push([Math.round(p.lng * 1e6) / 1e6, Math.round(p.lat * 1e6) / 1e6]);
  }
  ring.push(ring[0]!);
  return ring;
}

/** Quatre points cardinaux du cercle d'une zone : à ajouter au cadrage pour que tout le cercle reste visible. */
export function zoneExtentPoints(zone: Pick<SceneZone, 'lat' | 'lng' | 'radiusM'>): MapPoint[] {
  return [0, 90, 180, 270].map((deg) => offsetPoint(zone, zone.radiusM, deg));
}

/** Clé stable d'une liste de zones (≈ 1 m) : évite de redessiner pour rien. */
export function zonesKey(zones: ReadonlyArray<SceneZone>): string {
  return zones.map((z) => `${z.id}:${z.kind}:${z.lat.toFixed(5)},${z.lng.toFixed(5)}:${Math.round(z.radiusM)}`).join(';');
}
