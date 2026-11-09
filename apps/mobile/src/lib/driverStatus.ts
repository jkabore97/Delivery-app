/**
 * Indicateur légal permanent du livreur (« En ligne : suivi GPS actif ») : le suivi n'existe que lorsque le livreur
 * est en ligne. Même texte pour la pastille de l'accueil et partout où l'état est rappelé.
 */
export interface OnlineStatus {
  label: string;
  /** on = suivi actif ; pending = en ligne, GPS en cours d'activation ; paused = Yaar en arrière-plan ; off = hors ligne. */
  tone: 'on' | 'pending' | 'paused' | 'off';
}

export function onlineStatus({ online, gpsActive, gpsPaused }: { online: boolean; gpsActive: boolean; gpsPaused: boolean }): OnlineStatus {
  if (!online) return { label: 'Hors ligne : position non suivie', tone: 'off' };
  if (gpsPaused) return { label: 'En ligne : suivi GPS en pause (Yaar en arrière-plan)', tone: 'paused' };
  if (gpsActive) return { label: 'En ligne : suivi GPS actif', tone: 'on' };
  return { label: 'En ligne : activation du GPS…', tone: 'pending' };
}

/** Part du plafond d'espèces atteinte (0 → 1), pour la barre « Espèces détenues ». */
export function cashRatio(cashHeld: number, cashLimit: number): number {
  if (!(cashLimit > 0)) return 0;
  return Math.min(1, Math.max(0, cashHeld / cashLimit));
}
