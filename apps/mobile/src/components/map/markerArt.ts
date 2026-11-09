import type { VehicleType } from '@yaar/shared';
import { MAP_COLORS } from '../../lib/map/style';

/**
 * Pictogrammes des marqueurs dessinés avec de simples formes (boîte 24 × 24) : le même dessin sert au web (SVG,
 * MapLibre) et au natif (vues React Native), sans dépendance graphique supplémentaire. Style « au trait » (anneaux et
 * traits à extrémités rondes), comme les icônes de l'application.
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

/** Épaisseur du trait des pictogrammes (unités de la boîte 24 × 24), comme les icônes de l'application. */
export const GLYPH_STROKE = 2.2;

/**
 * Trait droit de (x1, y1) à (x2, y2), épaisseur `w`, extrémités rondes : un rectangle arrondi tourné. Deux traits qui
 * se touchent donnent une jointure ronde ; une suite de traits dessine une ligne brisée, comme un tracé SVG à
 * `stroke-linecap: round`.
 */
function bar(x1: number, y1: number, x2: number, y2: number, w: number, fill: string): ArtRect {
  const len = Math.hypot(x2 - x1, y2 - y1) + w;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const rotate = Math.round(((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI) * 10) / 10;
  return { x: cx - len / 2, y: cy - w / 2, w: len, h: w, r: w / 2, fill, ...(rotate ? { rotate } : {}) };
}

/** Ligne brisée (points [x, y]) en traits ronds. */
function polyline(points: Array<[number, number]>, w: number, color: string): ArtRect[] {
  const out: ArtRect[] = [];
  for (let i = 1; i < points.length; i++) out.push(bar(points[i - 1]![0], points[i - 1]![1], points[i]![0], points[i]![1], w, color));
  return out;
}

/** Anneau dont le trait (épaisseur `w`) est centré sur le cercle de rayon `r` (rayon extérieur r + w/2). */
function ring(cx: number, cy: number, r: number, w: number, color: string): ArtCircle {
  return { kind: 'circle', cx, cy, r: r + w / 2, stroke: color, strokeWidth: w };
}

/** Boutique (point de retrait), au trait : auvent, façade, porte. Blanc par défaut (sur le carré encre). */
export function storeGlyph(color: string = WHITE, w: number = GLYPH_STROKE): ArtShape[] {
  return [
    // Auvent : toit en trapèze, bord festonné.
    ...polyline(
      [
        [4, 9.8],
        [5.6, 4.6],
        [18.4, 4.6],
        [20, 9.8],
        [17.33, 11.6],
        [14.67, 9.8],
        [12, 11.6],
        [9.33, 9.8],
        [6.67, 11.6],
        [4, 9.8],
      ],
      w,
      color,
    ),
    // Façade et porte.
    ...polyline(
      [
        [5.6, 13.6],
        [5.6, 19.6],
        [18.4, 19.6],
        [18.4, 13.6],
      ],
      w,
      color,
    ),
    ...polyline(
      [
        [10.1, 19.4],
        [10.1, 15.6],
        [13.9, 15.6],
        [13.9, 19.4],
      ],
      w,
      color,
    ),
  ];
}

/** Maison (destinataire), au trait : toit, murs, porte. Blanc par défaut (sur la goutte cobalt). */
export function houseGlyph(color: string = WHITE, w: number = GLYPH_STROKE): ArtShape[] {
  return [
    ...polyline(
      [
        [3.8, 11.4],
        [12, 4.2],
        [20.2, 11.4],
      ],
      w,
      color,
    ),
    ...polyline(
      [
        [6, 9.8],
        [6, 19.6],
        [18, 19.6],
        [18, 9.8],
      ],
      w,
      color,
    ),
    ...polyline(
      [
        [10.1, 19.4],
        [10.1, 14.6],
        [13.9, 14.6],
        [13.9, 19.4],
      ],
      w,
      color,
    ),
  ];
}

/** Boutique blanche (carré encre de l'entreprise, épingle fixe du choix d'adresse). */
export const STORE_GLYPH: ArtShape[] = storeGlyph();
/** Maison blanche (goutte cobalt du destinataire, épingle fixe du choix d'adresse). */
export const HOUSE_GLYPH: ArtShape[] = houseGlyph();

/**
 * Véhicules vus de profil, au trait (comme les icônes de l'application), tournés vers la droite et TOUJOURS DROITS
 * (ils ne pivotent jamais : seule l'encoche de cap tourne). `ink` : couleur du trait (blanc par défaut, sur une pastille
 * pleine ; cobalt sur le disque blanc du marqueur, encre sur le disque Sun). `cut` : gardé pour compatibilité (les
 * pictogrammes au trait n'ont plus de découpes).
 */
export function vehicleSideGlyph(vehicle: VehicleType, ink: string = WHITE, _cut: string = MAP_COLORS.driver): ArtShape[] {
  const w = GLYPH_STROKE;
  switch (vehicle) {
    case 'CAR':
      // Voiture : habitacle à l'arrière, long capot, deux roues.
      return [
        ...polyline(
          [
            [5, 16],
            [3, 16],
            [2.1, 15.1],
            [2.1, 11],
            [2.4, 9.8],
            [3.7, 6.9],
            [5, 6],
            [12, 6],
            [13.8, 6.7],
            [16, 9],
            [20.4, 10.1],
            [21.9, 12],
            [21.9, 15.1],
            [21, 16],
            [19.1, 16],
          ],
          w,
          ink,
        ),
        bar(9, 16, 15, 16, w, ink),
        ring(7, 16, 2.05, w, ink),
        ring(17, 16, 2.05, w, ink),
      ];
    case 'BIKE': {
      // Vélo : deux grandes roues, cadre fin (le trait plein du cadre se confondrait à petite taille), selle, guidon.
      const f = w * 0.8;
      return [
        ring(5.3, 15, 3.75, w * 0.9, ink),
        ring(18.7, 15, 3.75, w * 0.9, ink),
        ...polyline(
          [
            [5.3, 15],
            [9.2, 8.6],
            [15.6, 8.6],
            [18.7, 15],
          ],
          f,
          ink,
        ),
        ...polyline(
          [
            [9.2, 8.6],
            [11.9, 15],
            [15.6, 8.6],
          ],
          f,
          ink,
        ),
        bar(5.3, 15, 11.9, 15, f, ink),
        bar(9.2, 8.6, 8.8, 6.2, f, ink),
        bar(7.4, 5.9, 10.4, 5.9, w, ink),
        ...polyline(
          [
            [15.6, 8.6],
            [14.9, 5.9],
            [17.3, 5.9],
          ],
          f,
          ink,
        ),
      ];
    }
    case 'MOTO':
    default:
      // Scooter (moto) : roues, carrosserie arrière, plancher, colonne de direction, guidon, coffre.
      return [
        ring(6, 15.7, 2.7, w, ink),
        ring(18.2, 15.7, 2.7, w, ink),
        ...polyline(
          [
            [3.3, 13.2],
            [4.6, 11],
            [7.8, 9.9],
            [10.9, 9.9],
            [12.8, 15.7],
            [15.6, 15.7],
          ],
          w,
          ink,
        ),
        ...polyline(
          [
            [18.2, 15.7],
            [15.6, 6.5],
            [13.3, 6.5],
          ],
          w,
          ink,
        ),
        bar(7.5, 6.8, 11.2, 6.8, w, ink),
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
