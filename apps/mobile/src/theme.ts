import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * SYSTÈME DE DESIGN « COBALT » (docs/DESIGN.md) : clair, vif, arrondi, une seule couleur signature (cobalt), des
 * cartes blanches à ombre douce sur un fond gris-bleu très clair, de grands chiffres. Pas de mode sombre (les livreurs
 * travaillent en plein soleil : interface claire, texte encre).
 *
 * Contrastes (WCAG) mesurés : voir chaque couleur. Petits textes : 4,5:1 au moins là où ils sont posés.
 * La police : src/fonts.ts (un seul endroit) ; les textes passent par components/Text.tsx.
 */
/**
 * Couleur `#RRGGBB` (ou `#RGB`) avec une opacité de 0 à 1 → `rgba(r, g, b, a)` : voiles, halos, filets translucides et
 * ombres se tirent des jetons (`alpha(palette.ink, 0.08)`, `alpha(palette.white, 0.16)` sur cobalt), jamais d'un rgba
 * écrit à la main. Une valeur qui n'est pas hexadécimale est rendue telle quelle.
 */
export function alpha(color: string, opacity: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const hex = m[1]!.length === 3 ? m[1]!.replace(/./g, (c) => c + c) : m[1]!;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const a = Math.round(Math.min(1, Math.max(0, Number.isFinite(opacity) ? opacity : 1)) * 1000) / 1000;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

const INK = '#0C1222';

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
  ink: INK,
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
  overlay: alpha(INK, 0.45),
  /** Web : fond de la page autour de la colonne « téléphone » (grand écran). */
  backdrop: '#DCE1E9',
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
  tile: shadow(`0 1px 2px ${alpha(INK, 0.04)}, 0 12px 32px ${alpha(INK, 0.06)}`, 2),
  /** Éléments flottants : pastilles et boutons sur la carte, barre d'onglets. */
  float: shadow(`0 1px 2px ${alpha(INK, 0.06)}, 0 6px 16px ${alpha(INK, 0.1)}`, 6),
  /** Feuille du bas posée sur une carte. */
  sheet: shadow(`0 -8px 32px ${alpha(INK, 0.1)}`, 12),
  /** Bouton cobalt plein (léger halo cobalt). */
  cobalt: shadow(`0 8px 18px -6px ${alpha(palette.cobalt, 0.55)}`, 4),
  /** Tuile héros cobalt. */
  hero: shadow(`0 1px 2px ${alpha(INK, 0.06)}, 0 18px 36px -14px ${alpha(palette.cobalt, 0.55)}`, 6),
  /** Tuile soleil (espèces). */
  sun: shadow(`0 1px 2px ${alpha(INK, 0.05)}, 0 14px 30px -14px ${alpha('#C48C00', 0.55)}`, 3),
  /** Filet d'ombre d'un bouton blanc posé sur une carte blanche (secondaire, `outline`). */
  hairline: { boxShadow: `0 1px 2px ${alpha(INK, 0.05)}` } as ViewStyle,
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
/* Anneau de focus du clavier (web)                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Attributs `data-*` d'un élément sur le web (`dataSet` de react-native-web) ; rien sur Android / iOS. À étaler dans
 * les props : `<View {...ON_COBALT_SURFACE} />`.
 */
function webData(data: Record<string, string>): Record<never, never> {
  return Platform.OS === 'web' ? ({ dataSet: data } as Record<never, never>) : {};
}

/*
 * L'anneau lui-même est dessiné par public/index.html (une règle `:focus-visible` pour toute l'application) : 2 px
 * cobalt détachés de 2 px, qui suivent les coins de l'élément (contraste 6,1:1 sur blanc, 5,4:1 sur canvas). Un champ
 * qui dessine son propre anneau (bordure cobalt de `Field`) l'écarte avec `outlineStyle: 'none'`. Les marqueurs
 * ci-dessous règlent les deux cas où l'élément focalisé n'est pas la forme que l'on voit.
 */

/**
 * Élément focalisable dont la forme visible est un ENFANT (colonne « disque + libellé » d'un bouton rond, `Pressable`
 * élargi autour d'une pastille) : l'anneau entoure cette forme, marquée `FOCUS_SHAPE`, au lieu du rectangle de la
 * colonne (qui rognait le libellé). `<Pressable {...FOCUS_RING_INNER}><View {...FOCUS_SHAPE} style={disque} /></Pressable>`.
 */
export const FOCUS_RING_INNER = webData({ focusRing: 'inner' });
/** La forme visible d'un élément `FOCUS_RING_INNER` (disque, pastille) : l'anneau en suit les coins. */
export const FOCUS_SHAPE = webData({ focusShape: 'true' });
/**
 * Surface cobalt pleine (tuile héros, bouton posé sur elle) : l'anneau de ses éléments focalisables y devient blanc
 * (6,1:1 sur cobalt) avec un halo cobalt, visible aussi là où il déborde sur du blanc. À poser sur le conteneur cobalt
 * (ou sur l'élément focalisable lui-même).
 */
export const ON_COBALT_SURFACE = webData({ surface: 'cobalt' });

/** Les deux marqueurs à la fois sur un élément focalisable (bouton rond posé sur la tuile héros cobalt). */
export const FOCUS_RING_INNER_ON_COBALT = webData({ focusRing: 'inner', surface: 'cobalt' });
