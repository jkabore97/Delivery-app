import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Emplacement du titre dans la barre du haut (posé par Layout) ; null hors de la coque (tests d'un écran seul). */
const TitleSlotContext = createContext<HTMLElement | null>(null);

export const PageTitleSlot = TitleSlotContext.Provider;

/**
 * Titre de l'écran (h1, 30/800). Chaque écran déclare le sien ; dans la console il s'affiche dans la barre du haut, à
 * côté de la recherche, au-dessus de la date et de l'état de l'actualisation (comme « Vue d'ensemble » sur la planche
 * Cobalt). Sans barre du haut, il reste en tête de l'écran.
 */
export function PageTitle({ children }: { children: ReactNode }) {
  const slot = useContext(TitleSlotContext);
  const title = <h1 className="page-title">{children}</h1>;
  return slot ? createPortal(title, slot) : title;
}
