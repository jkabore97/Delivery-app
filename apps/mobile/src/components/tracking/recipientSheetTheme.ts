import type { TrackingTheme } from './TrackingParts';

/**
 * Thème de la page publique de suivi (destinataire, /suivi/<jeton>). Cobalt n'a qu'un rendu, clair : feuille blanche,
 * carte Cobalt, code en tuile cobalt, montant en tuile soleil. Gardé pour les écrans qui le transmettent encore aux
 * éléments de suivi (@deprecated : leur prop `theme` n'a plus d'effet).
 */
export const RECIPIENT_SHEET_THEME: TrackingTheme = 'light';
