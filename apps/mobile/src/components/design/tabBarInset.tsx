import { createContext, useContext, type ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/*
 * Place prise par la barre d'onglets flottante (components/design/TabBar.tsx). Module à part, sans pictogramme : les
 * mises en page qui le lisent (LiveTrackingLayout, Screen de ui.tsx) servent aussi la page publique de suivi, qui ne
 * télécharge pas react-native-svg.
 */

/** Hauteur de la pilule (px) : onglets de 52 px dans 6 px de marge. */
export const TAB_BAR_HEIGHT = 64;
/** Écart entre le bas de l'écran (hors zone sûre) et la pilule. */
const BOTTOM_GAP = 14;
/** Écart gardé au-dessus de la pilule par le contenu (dernier élément d'une liste…). */
const CONTENT_GAP = 12;

/** Bas de la pilule au-dessus du bord de l'écran (zone sûre comprise). */
export function tabBarBottom(safeBottom: number): number {
  return Math.max(BOTTOM_GAP, safeBottom + 4);
}

/**
 * Place à garder en bas de l'écran pour la barre d'onglets flottante (0 hors des onglets). Lue par les mises en page
 * (LiveTrackingLayout, Screen, SurfaceScreen) pour que le contenu ne passe jamais sous la barre.
 */
const TabBarInsetContext = createContext(0);

export function useTabBarInset(): number {
  return useContext(TabBarInsetContext);
}

/** À placer autour de `<Tabs tabBar={…}>` : donne aux écrans la place prise par la barre flottante. */
export function TabBarInsetProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <TabBarInsetContext.Provider value={tabBarBottom(insets.bottom) + TAB_BAR_HEIGHT + CONTENT_GAP}>{children}</TabBarInsetContext.Provider>;
}
