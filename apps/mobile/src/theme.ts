import type { TextStyle } from 'react-native';

/** Charte graphique (provisoire) de Yaar Livraison. */
export const colors = {
  green: '#0B7A4B',
  greenLight: '#E7F4EE',
  orange: '#F28C1B',
  orangeLight: '#FEF3E6',
  blue: '#2D6CDF',
  blueLight: '#EAF1FD',
  red: '#D93636',
  redLight: '#FDECEC',
  text: '#16202A',
  textMuted: '#5E6B78',
  border: '#E3E7EC',
  background: '#F5F7F9',
  card: '#FFFFFF',
  white: '#FFFFFF',
} as const;

/**
 * Surfaces sombres (écrans et feuilles du livreur, façon application de coursier) : fond presque noir teinté de
 * vert, textes clairs, et un vert VIF à la place du vert de marque (#0B7A4B, trop peu contrasté sur fond sombre).
 * Contrastes mesurés sur `surface` : text 16,4:1 ; textMuted 7,9:1 ; textFaint 5,2:1 ; green 9,2:1 ; red 6,4:1 ;
 * amber 11,2:1 ; greenInk sur green 9,8:1 ; blanc sur redFill 4,6:1. Sur `raised` (cartes d'une feuille, le fond le
 * plus clair) : textMuted 7,1:1 ; textFaint 4,6:1 (petits textes : 4,5:1 au moins).
 */
export const dark = {
  /** Fond d'écran plein (écran de livraison, « Vous êtes prêt ! »). */
  background: '#0B0F0D',
  /** Feuilles, cartes posées sur la carte. */
  surface: '#131917',
  /** Éléments surélevés dans une feuille (cartes, boutons ronds secondaires, champs). */
  raised: '#1C2421',
  /** Élément surélevé appuyé / survolé. */
  raisedHigh: '#26302C',
  border: '#2B3531',
  text: '#F3F6F4',
  textMuted: '#A3B0A9',
  textFaint: '#808E87',
  /** Vert vif (actions principales, montants gagnés) sur fond sombre. */
  green: '#2FD38A',
  /** Texte posé sur le vert vif. */
  greenInk: '#03140B',
  greenSoft: 'rgba(47, 211, 138, 0.14)',
  /** Rouge des textes (refus, alertes) sur fond sombre. */
  red: '#FF6B63',
  /** Rouge des fonds de boutons (Refuser, SOS), texte blanc. */
  redFill: '#D93636',
  redSoft: 'rgba(255, 107, 99, 0.14)',
  /** Espèces à encaisser. */
  amber: '#FFC266',
  amberSoft: 'rgba(255, 194, 102, 0.13)',
  /** Voile derrière une fenêtre plein écran (ordinateur : de part et d'autre de la colonne de l'application). */
  overlay: 'rgba(4, 7, 6, 0.78)',
  /** Pastilles posées sur une carte sombre. */
  chip: 'rgba(19, 25, 23, 0.94)',
} as const;

/** Couleur principale selon l'espace : orange entreprise, bleu livreur (vert : marque, destinataire). */
export const roleColor = {
  CLIENT: colors.green,
  SELLER: colors.orange,
  DRIVER: colors.blue,
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** Coins supérieurs des feuilles du bas (claires ou sombres). */
export const SHEET_RADIUS = 24;
/** Cible tactile minimale des actions principales (boutons ronds, pastilles d'action). */
export const MIN_TOUCH = 56;

/**
 * Échelle typographique des écrans redessinés (titres très gras, montants en chiffres tabulaires). À étaler dans
 * un style : `[typeScale.title, { color: dark.text }]`.
 */
export const typeScale: Record<'hero' | 'title' | 'subtitle' | 'body' | 'label' | 'kicker' | 'amount', TextStyle> = {
  hero: { fontSize: 32, fontWeight: '900', letterSpacing: -0.6 },
  title: { fontSize: 24, fontWeight: '900', letterSpacing: -0.4 },
  subtitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: '500' },
  label: { fontSize: 13, fontWeight: '700' },
  /** Petit sur-titre en capitales (« 1 · RÉCUPÉRER », « DÉTAILS DE LA COURSE »). */
  kicker: { fontSize: 12, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  /** Montant mis en avant (gain, espèces). */
  amount: { fontSize: 28, fontWeight: '900', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
};

/** Largeur maximale de l'application sur le web (grand écran : affichage « téléphone ») et des feuilles modales. */
export const MAX_APP_WIDTH = 440;
