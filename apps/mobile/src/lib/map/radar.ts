/**
 * Radar « recherche d'un livreur » de la carte native : deux cercles natifs (react-native-maps `Circle`, rayon en
 * mètres) mis à jour 5 fois par seconde, au lieu d'une animation JavaScript qui redessinerait l'image du marqueur
 * à chaque image sur Android.
 */
export const RADAR_STEP_MS = 200;
export const RADAR_PERIOD_MS = 2400;

/** Anneaux du radar à l'instant `t` (ms) : rayon (m) et opacité, deux anneaux décalés d'une demi-période. */
export function radarRings(t: number): Array<{ radiusM: number; alpha: number }> {
  return [0, RADAR_PERIOD_MS / 2].map((offset) => {
    const k = ((((t + offset) % RADAR_PERIOD_MS) + RADAR_PERIOD_MS) % RADAR_PERIOD_MS) / RADAR_PERIOD_MS;
    return { radiusM: Math.round(60 + 340 * k), alpha: Math.round(0.3 * (1 - k) * 1000) / 1000 };
  });
}
