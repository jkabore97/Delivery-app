import type { LatLng } from '@yaar/shared';
import { bearingDeg, distanceM } from '../lib/geo';

/** Vitesse (m/s) à partir de laquelle le cap donné par le téléphone est fiable (≈ 3,6 km/h). */
export const MOVING_SPEED_MPS = 1;
/** Déplacement minimal (m) depuis la position précédente pour calculer un cap (en deçà : bruit GPS). */
export const MIN_BEARING_DISTANCE_M = 15;

/** Cap normalisé dans [0, 360), arrondi au dixième de degré (360 → 0). */
export function normalizeHeading(deg: number): number {
  const r = Math.round((((deg % 360) + 360) % 360) * 10) / 10;
  return r >= 360 ? 0 : r;
}

/**
 * Cap à enregistrer pour une nouvelle position du livreur :
 * 1. le cap envoyé par le téléphone (0–360) s'il est présent et que la vitesse, si elle est donnée, indique un
 *    déplacement (≥ 1 m/s : à l'arrêt, le cap GPS n'a pas de sens) ;
 * 2. sinon le cap calculé depuis la position précédente, si le livreur s'est déplacé d'au moins 15 m ;
 * 3. sinon le cap précédent est conservé (à l'arrêt, le marqueur ne tourne pas).
 */
export function nextHeading(
  previous: { lat: number | null; lng: number | null; heading: number | null },
  ping: LatLng & { heading?: number; speed?: number },
): number | null {
  const moving = ping.speed === undefined || ping.speed >= MOVING_SPEED_MPS;
  if (ping.heading !== undefined && Number.isFinite(ping.heading) && ping.heading >= 0 && ping.heading <= 360 && moving)
    return normalizeHeading(ping.heading);
  if (previous.lat !== null && previous.lng !== null) {
    const from = { lat: previous.lat, lng: previous.lng };
    if (distanceM(from, ping) >= MIN_BEARING_DISTANCE_M) return normalizeHeading(bearingDeg(from, ping));
  }
  return previous.heading;
}

/** Cap exposé aux applications : degrés entiers dans [0, 360) ; null si inconnu. */
export function headingForDto(h: number | null | undefined): number | null {
  if (h === null || h === undefined || !Number.isFinite(h)) return null;
  return Math.round(h) % 360;
}
