import type { VehicleType } from '@yaar/shared';
import { MAP_COLORS } from '../../lib/map/style';

/**
 * Pictogrammes des marqueurs dessinés avec de simples rectangles (boîte 24 × 24) : le même dessin sert au
 * web (SVG, MapLibre) et au natif (vues React Native), sans dépendance graphique supplémentaire.
 */
export interface ArtRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rayon des coins. */
  r?: number;
  fill: string;
  /** Rotation (degrés) autour du centre du rectangle. */
  rotate?: number;
}

const WHITE = '#FFFFFF';

/** Boutique / entreprise (point de retrait) : auvent, façade, porte et vitrine. */
export const STORE_GLYPH: ArtRect[] = [
  { x: 3, y: 4, w: 18, h: 5, r: 1.6, fill: WHITE },
  { x: 5, y: 10, w: 14, h: 10, r: 1.2, fill: WHITE },
  { x: 10.5, y: 13.5, w: 3.2, h: 6.5, r: 0.6, fill: MAP_COLORS.pickup },
  { x: 6.6, y: 12, w: 2.6, h: 2.8, r: 0.5, fill: MAP_COLORS.pickup },
  { x: 14.8, y: 12, w: 2.6, h: 2.8, r: 0.5, fill: MAP_COLORS.pickup },
];

/** Maison (destinataire) : toit en losange, façade, porte. */
export const HOUSE_GLYPH: ArtRect[] = [
  { x: 6.2, y: 3.6, w: 11.6, h: 11.6, r: 1.4, fill: WHITE, rotate: 45 },
  { x: 6, y: 11, w: 12, h: 9.5, r: 1, fill: WHITE },
  { x: 10.4, y: 14.2, w: 3.2, h: 6.3, r: 0.6, fill: MAP_COLORS.dropoff },
];

const INK = MAP_COLORS.driverInk;
const GLASS = '#A9BCCB';

/** Véhicule vu du dessus, orienté vers le haut (nord) : il pivote selon le cap du livreur. */
export function vehicleGlyph(vehicle: VehicleType): ArtRect[] {
  switch (vehicle) {
    case 'CAR':
      return [
        { x: 7, y: 2.5, w: 10, h: 19, r: 3.6, fill: INK },
        { x: 8.4, y: 7, w: 7.2, h: 3.6, r: 1.1, fill: GLASS },
        { x: 8.6, y: 15.8, w: 6.8, h: 2.6, r: 1, fill: GLASS },
        { x: 5.8, y: 9.5, w: 1.6, h: 2.4, r: 0.6, fill: INK },
        { x: 16.6, y: 9.5, w: 1.6, h: 2.4, r: 0.6, fill: INK },
      ];
    case 'MOTO':
      return [
        { x: 10.6, y: 2, w: 2.8, h: 5, r: 1.4, fill: INK },
        { x: 9.8, y: 6, w: 4.4, h: 13, r: 2.2, fill: INK },
        { x: 5.5, y: 7.6, w: 13, h: 2.2, r: 1.1, fill: INK },
        { x: 10.7, y: 11.5, w: 2.6, h: 5.5, r: 1.3, fill: GLASS },
        { x: 10.6, y: 18, w: 2.8, h: 4.5, r: 1.4, fill: INK },
      ];
    case 'BIKE':
    default:
      return [
        { x: 10.9, y: 1.8, w: 2.2, h: 6, r: 1.1, fill: INK },
        { x: 11.25, y: 6, w: 1.5, h: 12, r: 0.75, fill: INK },
        { x: 6.5, y: 7.2, w: 11, h: 1.7, r: 0.85, fill: INK },
        { x: 10.6, y: 11.8, w: 2.8, h: 3.4, r: 1, fill: GLASS },
        { x: 10.9, y: 16.2, w: 2.2, h: 6, r: 1.1, fill: INK },
      ];
  }
}

/** SVG (chaîne) d'un pictogramme, pour les marqueurs HTML de MapLibre. */
export function artToSvg(rects: ArtRect[], size: number): string {
  const body = rects
    .map((r) => {
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const rot = r.rotate ? ` transform="rotate(${r.rotate} ${cx} ${cy})"` : '';
      return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${r.r ?? 0}" fill="${r.fill}"${rot}/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}
