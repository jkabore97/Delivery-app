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

/**
 * Marges de cadrage passées à `fitToCoordinates` (react-native-maps) quand la carte a déjà une marge de base
 * (`mapPadding`, qui garde le logo Google / le lien « Mentions légales » au-dessus de la feuille) : Android
 * additionne les deux, on retire donc la marge de base ; iOS (Apple Plans) ne tient compte que des marges de cadrage.
 */
export function nativeEdgePadding(p: MapPadding, base: MapPadding, platform: string): MapPadding {
  if (platform !== 'android') return p;
  return {
    top: Math.max(0, p.top - base.top),
    right: Math.max(0, p.right - base.right),
    bottom: Math.max(0, p.bottom - base.bottom),
    left: Math.max(0, p.left - base.left),
  };
}

/**
 * Marge de base des cartes natives (`mapPadding`) bornée à la carte : une feuille dépliée ne doit jamais laisser
 * moins de `minFree` px de carte (Google Maps refuse alors de cadrer : « View size is too small after padding »).
 */
export function clampBasePadding(base: MapPadding, width: number, height: number, minFree = 80): MapPadding {
  return clampPadding(base, width, height, minFree);
}

/**
 * Marges de `fitToCoordinates` en natif : marges voulues bornées à la carte (clampPadding), moins la marge de base
 * sur Android, puis réduites si marge de base + marges de cadrage dépassent encore la carte (feuille dépliée).
 */
export function nativeFitPadding(
  p: MapPadding,
  base: MapPadding,
  platform: string,
  width: number,
  height: number,
  minFree = 80,
): MapPadding {
  const c = clampPadding(p, width, height, minFree);
  if (platform !== 'android') return c;
  const e = nativeEdgePadding(c, base, platform);
  const fit = (a: number, b: number, baseSum: number, size: number): [number, number] => {
    const room = Math.max(0, size - minFree - baseSum);
    const sum = a + b;
    if (sum <= room || sum === 0) return [a, b];
    const k = room / sum;
    return [Math.floor(a * k), Math.floor(b * k)];
  };
  const [top, bottom] = fit(e.top, e.bottom, base.top + base.bottom, height);
  const [left, right] = fit(e.left, e.right, base.left + base.right, width);
  return { top, right, bottom, left };
}

/**
 * Marges des cartes de suivi plein écran (feuille en bas) : en bas la feuille + 90 px (marqueurs de 44 px et
 * mention des données toujours au-dessus de la feuille), au moins 60 px sur les côtés (chevron de cap compris),
 * en haut la barre des boutons flottants et la hauteur d'une épingle.
 */
export function trackingPadding(sheetHeight: number, topInset: number, width: number): MapPadding {
  const side = width >= 600 ? 80 : 64;
  return { top: topInset + 104, right: side, bottom: Math.max(0, sheetHeight) + 90, left: side };
}

export function withDefaultPadding(p: Partial<MapPadding> | undefined): MapPadding {
  return { ...DEFAULT_PADDING, ...(p ?? {}) };
}
