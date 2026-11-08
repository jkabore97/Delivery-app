import type { MapPadding } from '../components/map/types';

/**
 * Caméra des cartes de suivi : elle suit le livreur (recadrage livreur + cible à chaque nouvelle position)
 * jusqu'à ce que l'utilisateur déplace ou zoome la carte ; le bouton « Recentrer » apparaît alors et
 * relance le suivi. Un changement d'étape (livreur trouvé, colis récupéré) recadre et relance aussi le suivi.
 */
export interface FollowState {
  following: boolean;
  /** Incrémenté à chaque recadrage demandé (bouton, nouvelle étape) : la carte recadre même sans suivre. */
  recenterKey: number;
}

export type FollowEvent = { type: 'gesture' } | { type: 'recenter' } | { type: 'stageChanged' };

export const INITIAL_FOLLOW: FollowState = { following: true, recenterKey: 0 };

export function followReducer(state: FollowState, event: FollowEvent): FollowState {
  switch (event.type) {
    case 'gesture':
      return state.following ? { ...state, following: false } : state;
    case 'recenter':
    case 'stageChanged':
      return { following: true, recenterKey: state.recenterKey + 1 };
  }
}

/** « Recentrer » : seulement quand l'utilisateur a pris la main et qu'il y a quelque chose à cadrer. */
export function shouldShowRecenter(state: FollowState, fitPointCount: number): boolean {
  return !state.following && fitPointCount > 0;
}

/**
 * Marges de cadrage compatibles avec la taille de la carte (MapLibre refuse de cadrer si les marges
 * dépassent la carte) : réduites proportionnellement pour laisser au moins `minFree` px visibles.
 */
export function clampPadding(p: MapPadding, width: number, height: number, minFree = 80): MapPadding {
  const scale = (a: number, b: number, size: number): [number, number] => {
    const room = Math.max(0, size - minFree);
    const sum = a + b;
    if (sum <= room || sum === 0) return [a, b];
    const k = room / sum;
    return [Math.floor(a * k), Math.floor(b * k)];
  };
  const [top, bottom] = scale(Math.max(0, p.top), Math.max(0, p.bottom), height);
  const [left, right] = scale(Math.max(0, p.left), Math.max(0, p.right), width);
  return { top, right, bottom, left };
}

export const DEFAULT_PADDING: MapPadding = { top: 72, right: 48, bottom: 48, left: 48 };

export function withDefaultPadding(p: Partial<MapPadding> | undefined): MapPadding {
  return { ...DEFAULT_PADDING, ...(p ?? {}) };
}
