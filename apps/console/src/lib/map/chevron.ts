/**
 * Petits chevrons blancs (›) posés le long de l'itinéraire, sur le web : image RGBA calculée ici (aucun canevas,
 * testable sans navigateur), ajoutée à la carte avec `map.addImage`. Le chevron pointe vers +x : un calque « symbol »
 * placé sur la ligne (`symbol-placement: line`) l'oriente dans le sens du tracé, du livreur vers la destination.
 * Copie de apps/mobile/src/lib/map/chevron.ts (la console ne peut pas l'importer).
 */
export const CHEVRON_IMAGE_ID = 'yaar-route-chevron';
/** Écart entre deux chevrons le long de l'itinéraire (px). */
export const CHEVRON_SPACING_PX = 64;

export interface RgbaImage {
  width: number;
  height: number;
  /** RGBA non prémultiplié, ligne par ligne. */
  data: Uint8Array;
}

/** Côté de la boîte du chevron (px CSS) ; le trait tient dans l'itinéraire de 6 px. */
const BOX = 8;
/** Branches du chevron (px CSS, centre de la boîte en 0,0) et demi-épaisseur du trait (extrémités rondes). */
const ARMS: Array<[number, number]> = [
  [-1.25, -2.2],
  [1.35, 0],
  [-1.25, 2.2],
];
const HALF_STROKE = 0.78;

function distToSegment(px: number, py: number, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len2)) : 0;
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

/**
 * Chevron blanc anticrénelé de 8 × 8 px CSS, à la densité `pixelRatio` (image de 8·pixelRatio px de côté, à
 * déclarer avec le même `pixelRatio` dans addImage).
 */
export function chevronImage(pixelRatio = 2, rgb: [number, number, number] = [255, 255, 255]): RgbaImage {
  const ratio = Math.max(1, Math.round(pixelRatio));
  const size = BOX * ratio;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = (x + 0.5) / ratio - BOX / 2;
      const cy = (y + 0.5) / ratio - BOX / 2;
      const d = Math.min(distToSegment(cx, cy, ARMS[0]!, ARMS[1]!), distToSegment(cx, cy, ARMS[1]!, ARMS[2]!));
      // Couverture du pixel : 1 dans le trait, 0 au-delà, rampe d'un pixel physique sur le bord.
      const alpha = Math.max(0, Math.min(1, (HALF_STROKE - d) * ratio + 0.5));
      const i = (y * size + x) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = Math.round(alpha * 255);
    }
  }
  return { width: size, height: size, data };
}
