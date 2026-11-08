import { splitPolylineAt } from '@yaar/shared';
import type { MapPoint, SceneLine } from '../../components/map/types';

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

/** Clé stable d'une liste de points (≈ 1 m) : évite de redessiner pour des changements insignifiants. */
export function pointsKey(points: ReadonlyArray<MapPoint>): string {
  return points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');
}
