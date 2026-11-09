import type { VehicleType } from '@yaar/shared';
import { MAP_COLORS } from '../../lib/map/style';

/**
 * Pictogrammes des marqueurs dessinés avec de simples formes (boîte 24 × 24) : le même dessin sert au web (SVG,
 * MapLibre) et au natif (vues React Native), sans dépendance graphique supplémentaire.
 *
 * Les formes sont décrites par leur boîte EXTÉRIEURE : un contour (`stroke`) est dessiné à l'intérieur de la boîte,
 * comme une bordure React Native (le SVG est décalé d'un demi-trait pour donner exactement le même rendu).
 */
export interface ArtRect {
  kind?: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rayon des coins. */
  r?: number;
  /** Remplissage ; absent = transparent. */
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** Rotation (degrés, sens horaire) autour du centre du rectangle. */
  rotate?: number;
}

export interface ArtCircle {
  kind: 'circle';
  cx: number;
  cy: number;
  /** Rayon extérieur (contour compris). */
  r: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export type ArtShape = ArtRect | ArtCircle;

const WHITE = '#FFFFFF';

/** Boutique / entreprise (point de retrait) : auvent, façade, porte et vitrine. */
export const STORE_GLYPH: ArtShape[] = [
  { x: 3, y: 4, w: 18, h: 5, r: 1.6, fill: WHITE },
  { x: 5, y: 10, w: 14, h: 10, r: 1.2, fill: WHITE },
  { x: 10.5, y: 13.5, w: 3.2, h: 6.5, r: 0.6, fill: MAP_COLORS.pickup },
  { x: 6.6, y: 12, w: 2.6, h: 2.8, r: 0.5, fill: MAP_COLORS.pickup },
  { x: 14.8, y: 12, w: 2.6, h: 2.8, r: 0.5, fill: MAP_COLORS.pickup },
];

/** Maison (destinataire) : toit en losange, façade, porte. */
export const HOUSE_GLYPH: ArtShape[] = [
  { x: 6.2, y: 3.6, w: 11.6, h: 11.6, r: 1.4, fill: WHITE, rotate: 45 },
  { x: 6, y: 11, w: 12, h: 9.5, r: 1, fill: WHITE },
  { x: 10.4, y: 14.2, w: 3.2, h: 6.3, r: 0.6, fill: MAP_COLORS.dropoff },
];

/** Barre arrondie de (x1, y1) à (x2, y2), épaisseur `w` (cadres, guidons). */
function bar(x1: number, y1: number, x2: number, y2: number, w: number, fill: string): ArtRect {
  const len = Math.hypot(x2 - x1, y2 - y1) + w;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const rotate = Math.round(((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI) * 10) / 10;
  return { x: cx - len / 2, y: cy - w / 2, w: len, h: w, r: w / 2, fill, ...(rotate ? { rotate } : {}) };
}

function wheel(cx: number, cy: number, r: number, width: number, color: string, fill?: string): ArtCircle {
  return { kind: 'circle', cx, cy, r, stroke: color, strokeWidth: width, ...(fill ? { fill } : {}) };
}

/**
 * Véhicules vus de profil, TOUJOURS DROITS (ils ne pivotent jamais : seul le chevron de cap tourne), dessinés en
 * `ink` sur le disque du marqueur, avec des découpes de la couleur `cut` (vitres, jantes). Mêmes silhouettes que
 * la console (apps/console/src/lib/map/markers.ts) : scooter, vélo, voiture tournés vers la droite.
 */
export function vehicleSideGlyph(vehicle: VehicleType, ink: string = WHITE, cut: string = MAP_COLORS.driver): ArtShape[] {
  switch (vehicle) {
    case 'CAR':
      return [
        // Caisse basse et habitacle.
        { x: 2, y: 10.4, w: 20, h: 5.8, r: 2.2, fill: ink },
        { x: 5.2, y: 6, w: 12.2, h: 7, r: 2.6, fill: ink },
        // Vitres avant / arrière.
        { x: 7, y: 7.7, w: 4.1, h: 3, r: 0.9, fill: cut },
        { x: 12.1, y: 7.7, w: 3.7, h: 3, r: 0.9, fill: cut },
        // Roues (jante de la couleur du disque, pneu blanc).
        wheel(6.8, 16.6, 2.9, 1.5, ink, cut),
        wheel(17.2, 16.6, 2.9, 1.5, ink, cut),
      ];
    case 'BIKE':
      return [
        wheel(5.5, 15.6, 4.2, 1.7, ink),
        wheel(18.5, 15.6, 4.2, 1.7, ink),
        // Cadre : base, tube de selle, tube supérieur, tube diagonal, fourche.
        bar(5.5, 15.6, 9.4, 8.8, 1.7, ink),
        bar(5.5, 15.6, 12.2, 15.6, 1.7, ink),
        bar(9.4, 8.8, 12.2, 15.6, 1.7, ink),
        bar(9.4, 8.8, 15.4, 8.8, 1.7, ink),
        bar(12.2, 15.6, 15.4, 8.8, 1.7, ink),
        bar(15.4, 8.8, 18.5, 15.6, 1.7, ink),
        // Selle et guidon.
        bar(9.4, 8.8, 9.6, 6.6, 1.5, ink),
        bar(7.9, 6.3, 11, 6.3, 1.7, ink),
        bar(15.4, 8.8, 14.8, 6.4, 1.5, ink),
        bar(14.6, 6.1, 17.2, 6.1, 1.6, ink),
      ];
    case 'MOTO':
    default:
      return [
        wheel(5.6, 16.3, 3.9, 1.9, ink),
        wheel(18.4, 16.3, 3.9, 1.9, ink),
        // Selle et carrosserie arrière, plancher, colonne de direction (inclinée), guidon, phare.
        { x: 5.4, y: 9.6, w: 8.8, h: 3.2, r: 1.6, fill: ink },
        { x: 6.6, y: 11.6, w: 9.6, h: 4.2, r: 1.6, fill: ink },
        bar(15.4, 8, 18.2, 15.4, 2.3, ink),
        bar(13.6, 6.6, 17.6, 6.6, 1.9, ink),
        { x: 17.6, y: 8.8, w: 3, h: 2.4, r: 1, fill: ink },
      ];
  }
}

/** Arrondi à 2 décimales (SVG compact). */
const n = (v: number) => Math.round(v * 100) / 100;

/** SVG (chaîne) d'un pictogramme, pour les marqueurs HTML de MapLibre. */
export function artToSvg(shapes: ArtShape[], size: number): string {
  const body = shapes
    .map((s) => {
      const sw = s.stroke ? (s.strokeWidth ?? 1) : 0;
      const paint = `fill="${s.fill ?? 'none'}"${s.stroke ? ` stroke="${s.stroke}" stroke-width="${n(sw)}"` : ''}`;
      if (s.kind === 'circle') return `<circle cx="${n(s.cx)}" cy="${n(s.cy)}" r="${n(s.r - sw / 2)}" ${paint}/>`;
      // Trait centré sur le bord en SVG : on rentre d'un demi-trait pour rester dans la boîte (comme une bordure RN).
      const x = s.x + sw / 2;
      const y = s.y + sw / 2;
      const w = Math.max(0, s.w - sw);
      const h = Math.max(0, s.h - sw);
      const rx = Math.max(0, (s.r ?? 0) - sw / 2);
      const rot = s.rotate ? ` transform="rotate(${n(s.rotate)} ${n(s.x + s.w / 2)} ${n(s.y + s.h / 2)})"` : '';
      return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(rx)}" ${paint}${rot}/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
}

/* ------------------------------------------------------------------ */
/* Épingle « avatar » (initiales)                                      */
/* ------------------------------------------------------------------ */

/** Mots ignorés après le premier (« Pharmacie du Centre » → PC, « Maquis Le Verdoyant » → MV). */
const NAME_PARTICLES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'au', 'aux', 'chez', 'en']);
/** Élisions en tête (« L’Escale » → E). */
const ELIDED = new Set(['l', 'd']);
const FIRST_CHAR = /[A-Za-z0-9À-ÖØ-öø-ɏ]/;

/**
 * Une ou deux lettres pour une épingle « avatar » ou une pastille : initiales des deux premiers mots significatifs
 * (« Awa Kaboré » → AK, « Pharmacie du Centre » → PC, « Le Verdoyant » → LV, « L’Escale » → E) ; null sans nom
 * exploitable (la carte garde alors le marqueur habituel).
 */
export function avatarInitials(name: string | null | undefined): string | null {
  if (!name) return null;
  let words = name
    .replace(/[’'`.\-_/()]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length > 1 && ELIDED.has(words[0]!.toLowerCase())) words = words.slice(1);
  const significant = words.filter((w, i) => i === 0 || !NAME_PARTICLES.has(w.toLowerCase()));
  const letters = significant
    .map((w) => FIRST_CHAR.exec(w)?.[0] ?? '')
    .filter(Boolean)
    .slice(0, 2);
  return letters.length ? letters.join('').toUpperCase() : null;
}
