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
