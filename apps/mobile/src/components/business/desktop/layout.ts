import { Platform, useWindowDimensions, type ViewStyle } from 'react-native';

/**
 * Ordinateur (et tablette en paysage) : à partir de cette largeur de fenêtre, l'espace entreprise s'affiche avec la
 * barre latérale et les mises en page larges (tableau de bord, détail en carte + colonne…), sans barre d'onglets.
 */
export const DESKTOP_MIN_WIDTH = 1024;

/** Largeur de la barre latérale (spec Cobalt : 232 à 248 px). */
export const SIDEBAR_WIDTH = 240;

/** Marge de la zone de contenu de l'ordinateur. */
export const PAGE_PADDING = 32;

/** Écart entre deux tuiles de l'ordinateur. */
export const TILE_GAP = 16;

export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return width >= DESKTOP_MIN_WIDTH;
}

/**
 * Web : l'application tient dans une colonne « téléphone » centrée (mise en page racine, src/app/_layout.tsx) ; sur
 * ordinateur l'espace entreprise en sort et occupe toute la fenêtre (position fixe : la colonne n'a ni transformation
 * ni filtre, rien ne la retient). Sans effet hors du web.
 */
export const FULL_WINDOW: ViewStyle | null =
  Platform.OS === 'web' ? ({ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 } as unknown as ViewStyle) : null;

/** Curseur « main » sur les éléments cliquables (web). */
export const POINTER: ViewStyle | null = Platform.OS === 'web' ? ({ cursor: 'pointer' } as unknown as ViewStyle) : null;
