import type { TrackingTheme } from './TrackingParts';

/**
 * THÈME DE LA PAGE PUBLIQUE DE SUIVI (destinataire, /suivi/<jeton>) : un seul interrupteur pour toute la page
 * (feuille du bas ou panneau latéral, boutons ronds, code, montant, écrans « lien expiré » / « connexion
 * impossible »). 'dark' : feuille sombre sur carte claire, comme les écrans du livreur et de l'entreprise ;
 * 'light' : feuille blanche. L'écran de chargement reste clair dans les deux cas (suite de l'écran de démarrage
 * du HTML, public/index.html).
 */
export const RECIPIENT_SHEET_THEME: TrackingTheme = 'dark';
