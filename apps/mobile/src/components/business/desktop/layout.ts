import { Platform, useWindowDimensions, type ViewStyle } from 'react-native';
import { WIDE_APP_MIN_WIDTH } from '../../../lib/webShell';

/**
 * Ordinateur (et tablette en paysage) : à partir de cette largeur de fenêtre, l'espace entreprise s'affiche avec la
 * barre latérale et les mises en page larges (tableau de bord, détail en carte + colonne…), sans barre d'onglets. Même
 * seuil que la mise en page racine du web (`isWideAppPath` : l'espace entreprise y occupe toute la fenêtre).
 */
export const DESKTOP_MIN_WIDTH = WIDE_APP_MIN_WIDTH;

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

/** Curseur « main » sur les éléments cliquables (web). */
export const POINTER: ViewStyle | null = Platform.OS === 'web' ? ({ cursor: 'pointer' } as unknown as ViewStyle) : null;
