import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * SYSTÈME DE DESIGN « COBALT » (docs/DESIGN.md) : clair, vif, arrondi, une seule couleur signature (cobalt), des
 * cartes blanches à ombre douce sur un fond gris-bleu très clair, de grands chiffres. Pas de mode sombre (les livreurs
 * travaillent en plein soleil : interface claire, texte encre).
 *
 * Contrastes (WCAG) mesurés : voir chaque couleur. Petits textes : 4,5:1 au moins là où ils sont posés.
 * La police : src/fonts.ts (un seul endroit) ; les textes passent par components/Text.tsx.
 */
export const palette = {
  /** Fond de l'application derrière les cartes. */
  canvas: '#EEF1F5',
  /** Cartes, feuilles, barre d'onglets, pastilles sur la carte. */
  card: '#FFFFFF',
  white: '#FFFFFF',
  /** Zones remplies dans une carte blanche (champs, boutons secondaires, pistes). */
  raised: '#F4F6F9',
  /** `raised` appuyé / survolé. */
  raisedHigh: '#E9EDF3',
  /** Filets (rares : les cartes n'ont pas de bordure). */
  line: '#E6E9EF',
  /** Poignée des feuilles du bas. */
  handle: '#D5DBE5',
  /** Texte principal : 18,7:1 sur blanc, 16,5:1 sur canvas. */
  ink: '#0C1222',
  /** Texte secondaire : 5,96:1 sur blanc, 5,26:1 sur canvas, 5,5:1 sur raised, 5,07:1 sur raisedHigh. */
  inkMuted: '#5B6475',
  /** LA couleur : actions principales, itinéraire, onglet actif, liens, tuile héros (texte : 6,09:1 sur blanc). */
  cobalt: '#2448FF',
  /** Texte et pictogrammes sur cobalt (6,09:1). */
  onCobalt: '#FFFFFF',
  /** Texte secondaire sur cobalt (5,13:1). */
  onCobalt2: '#E6EBFF',
  /** Fonds sélectionnés / actifs, puces. */
  cobaltTint: '#E9EDFF',
  /** Petit texte sur cobaltTint (6,79:1). */
  cobaltText: '#1F3BD6',
  /** ESPÈCES seulement (à encaisser, à reverser) et mises en avant : toujours un FOND, texte encre (12,2:1). */
  sun: '#FFC93C',
  /** Texte secondaire sur sun (7,1:1). */
  onSun2: '#4B3B08',
  /** Fond doux des espèces. */
  sunTint: '#FFF3CC',
  /** Texte sur sunTint (6,56:1). */
  sunText: '#7A4D00',
  /** Montant en espèces écrit sur blanc / raised / canvas (5,9 / 5,5 / 5,2:1) : jamais de texte jaune. */
  amberText: '#8A5A00',
  /** Livrée / réussite (fond ou pictogramme ; texte encre dessus : 8,2:1). */
  mint: '#16C47F',
  /** Puces de réussite. */
  mintTint: '#D7F5E8',
  /** Texte de réussite : 4,65:1 sur mintTint, 5,39:1 sur blanc. */
  mintText: '#077A4B',
  /** Alertes : points et pictogrammes seulement (blanc dessus : grand texte seulement, 3,08:1). */
  coral: '#FF5A4E',
  /** Boutons destructifs (Refuser, Annuler la livraison, SOS), texte blanc (4,83:1). */
  coralFill: '#D92D20',
  /** Bandeaux d'erreur. */
  coralTint: '#FFE4E1',
  /** Texte d'erreur : 5,46:1 sur coralTint, 6,57:1 sur blanc, 6,07:1 sur raised. */
  coralText: '#B42318',
  /** Voile derrière une fenêtre. */
  overlay: 'rgba(12, 18, 34, 0.45)',
} as const;

/** Rayons (px) : cartes 24, tuile héros 28, feuilles 32, champs 16, pastilles et boutons en pilule. */
export const radii = { sm: 12, input: 16, banner: 16, card: 24, hero: 28, sheet: 32, pill: 999 } as const;

/** Coins supérieurs des feuilles du bas. */
export const SHEET_RADIUS = radii.sheet;

/** Espacements : multiples de 4 et 8 (carte : 16–20 de marge ; 12 entre deux cartes sur téléphone). */
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Cible tactile minimale des actions principales (boutons ronds, pastilles d'action) ; 48 px pour les autres. */
export const MIN_TOUCH = 56;

/** Largeur maximale de l'application sur le web (grand écran : affichage « téléphone ») et des feuilles modales. */
export const MAX_APP_WIDTH = 440;

/* ------------------------------------------------------------------------------------------------------------------ */
/* Ombres                                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * `boxShadow` (chaîne CSS) : React Native 0.76+ le dessine sur iOS, Android (nouvelle architecture, Android 9+) et le
 * web. Android 8 et moins : `elevation` à la place (sinon aucune ombre ; jamais les deux, l'ombre serait doublée).
 * Les cartes n'ont pas de bordure : leur ombre suffit.
 */
const LEGACY_ANDROID = Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version < 28;
function shadow(boxShadow: string, elevation: number): ViewStyle {
  return LEGACY_ANDROID ? { elevation } : { boxShadow };
}

export const shadows = {
  /** Cartes et tuiles posées sur canvas. */
  tile: shadow('0 1px 2px rgba(12, 18, 34, 0.04), 0 12px 32px rgba(12, 18, 34, 0.06)', 2),
  /** Éléments flottants : pastilles et boutons sur la carte, barre d'onglets. */
  float: shadow('0 1px 2px rgba(12, 18, 34, 0.06), 0 6px 16px rgba(12, 18, 34, 0.10)', 6),
  /** Feuille du bas posée sur une carte. */
  sheet: shadow('0 -8px 32px rgba(12, 18, 34, 0.10)', 12),
  /** Bouton cobalt plein (léger halo cobalt). */
  cobalt: shadow('0 8px 18px -6px rgba(36, 72, 255, 0.55)', 4),
  /** Tuile héros cobalt. */
  hero: shadow('0 1px 2px rgba(12, 18, 34, 0.06), 0 18px 36px -14px rgba(36, 72, 255, 0.55)', 6),
  /** Tuile soleil (espèces). */
  sun: shadow('0 1px 2px rgba(12, 18, 34, 0.05), 0 14px 30px -14px rgba(196, 140, 0, 0.55)', 3),
} as const;

/* ------------------------------------------------------------------------------------------------------------------ */
/* Typographie                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Échelle typographique Cobalt (téléphone). Graisses de la police (src/fonts.ts : 500 / 600 / 700 / 800) appliquées par
 * le `Text` de l'application (components/Text.tsx), qui choisit le fichier de la graisse. Chiffres tabulaires pour
 * toute heure, montant, nombre, plaque et code. S'étale dans un style : `[typography.title, { color: palette.ink }]`.
 */
export const typography = {
  /** Heure d'arrivée géante de la tuile héros (« 12:09 »). */
  hero: { fontSize: 64, lineHeight: 64, fontWeight: '800', letterSpacing: -2.4, fontVariant: ['tabular-nums'] },
  /** Titre d'écran (« Le Verdoyant »). */
  display: { fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -0.9 },
  /** Titre de section (« En cours »). */
  title: { fontSize: 20, lineHeight: 26, fontWeight: '800', letterSpacing: -0.3 },
  /** Nom sur une carte. */
  subtitle: { fontSize: 16, lineHeight: 21, fontWeight: '700', letterSpacing: -0.15 },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '500' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  /** Petit sur-titre en capitales : avec parcimonie (Cobalt préfère les minuscules). */
  kicker: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  /** Montant mis en avant. */
  amount: { fontSize: 28, lineHeight: 32, fontWeight: '800', letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  /** Chiffres d'une tuile KPI (« 14 », « 87 500 »). */
  kpi: { fontSize: 36, lineHeight: 38, fontWeight: '800', letterSpacing: -1.2, fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;

/** Chiffres tabulaires (heures, montants, plaques, codes). */
export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

/* ------------------------------------------------------------------------------------------------------------------ */
/* ANCIENS JETONS (écrans pas encore redessinés)                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * @deprecated Ancienne palette claire. Valeurs remplacées par leurs équivalents Cobalt pour que les écrans pas encore
 * redessinés forment une application CLAIRE cohérente ; utiliser `palette`. Correspondance :
 * green / orange / blue (accents des espaces) → cobalt ; leurs fonds clairs → cobaltTint ; red (textes d'erreur,
 * fonds destructifs) → coralText #B42318 (lisible partout, blanc dessus 6,6:1) ; redLight → coralTint ;
 * text → ink ; textMuted → inkMuted ; border → line ; background → canvas ; card / white → blanc.
 */
export const colors = {
  green: palette.cobalt,
  greenLight: palette.cobaltTint,
  orange: palette.cobalt,
  orangeLight: palette.cobaltTint,
  blue: palette.cobalt,
  blueLight: palette.cobaltTint,
  red: palette.coralText,
  redLight: palette.coralTint,
  text: palette.ink,
  textMuted: palette.inkMuted,
  border: palette.line,
  background: palette.canvas,
  card: palette.card,
  white: palette.white,
} as const;

/**
 * @deprecated Anciennes surfaces sombres (livreur, entreprise). Cobalt n'a pas de mode sombre : valeurs remplacées par
 * leurs équivalents CLAIRS, pour que les écrans pas encore redessinés restent lisibles et cohérents ; utiliser
 * `palette`. Correspondance (contraste de chaque texte vérifié sur canvas, card, raised et sur son fond doux) :
 * background → canvas ; surface → card (blanc) ; raised → raised ; raisedHigh → raisedHigh ; border → line ;
 * text → ink ; textMuted et textFaint → inkMuted (5,07:1 au moins) ; green (action, gain) → cobalt (5,23:1 au
 * moins) et greenInk (texte dessus) → blanc ; greenSoft → cobaltTint ; red (texte) → coralText #B42318 (5,46:1 au
 * moins ; #D92D20 n'aurait que 4,01:1 sur coralTint) ; redFill → coralFill ; redSoft → coralTint ; amber (texte des
 * espèces) → amberText #8A5A00 (5,23:1 au moins ; un FOND d'espèces s'écrit `palette.sun`) ; amberSoft → sunTint ;
 * overlay → voile encre ; chip (pastille sur la carte) → blanc.
 */
export const dark = {
  background: palette.canvas,
  surface: palette.card,
  raised: palette.raised,
  raisedHigh: palette.raisedHigh,
  border: palette.line,
  text: palette.ink,
  textMuted: palette.inkMuted,
  textFaint: palette.inkMuted,
  green: palette.cobalt,
  greenInk: palette.onCobalt,
  greenSoft: palette.cobaltTint,
  red: palette.coralText,
  redFill: palette.coralFill,
  redSoft: palette.coralTint,
  amber: palette.amberText,
  amberSoft: palette.sunTint,
  overlay: palette.overlay,
  chip: palette.card,
} as const;

/** @deprecated Couleur de chaque espace : Cobalt n'en a qu'une (cobalt) pour tous. */
export const roleColor = {
  CLIENT: palette.cobalt,
  SELLER: palette.cobalt,
  DRIVER: palette.cobalt,
} as const;

/** @deprecated Rayons d'origine, agrandis aux valeurs Cobalt (sm 12, md 16, lg 24) : utiliser `radii`. */
export const radius = { sm: radii.sm, md: radii.input, lg: radii.card, pill: radii.pill } as const;

/**
 * @deprecated Ancienne échelle (titres 900) : mêmes clés, valeurs Cobalt (800 au plus, interlettrage serré) ; utiliser
 * `typography`. hero : grand titre d'écran (= display) ; title : titre d'écran compact (24) ; subtitle : nom (18/700).
 */
export const typeScale: Record<'hero' | 'title' | 'subtitle' | 'body' | 'label' | 'kicker' | 'amount', TextStyle> = {
  hero: typography.display,
  title: { fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { fontSize: 18, lineHeight: 23, fontWeight: '700', letterSpacing: -0.2 },
  body: typography.body,
  label: typography.label,
  kicker: typography.kicker,
  amount: typography.amount,
};
