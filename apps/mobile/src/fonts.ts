import { useEffect, useState } from 'react';
import { Platform, StyleSheet, type TextStyle } from 'react-native';
import { FontDisplay, loadAsync, type FontSource } from 'expo-font';
// Fichiers de chaque graisse : TTF complets du paquet sur Android / iOS (fontFiles.ts), sous-ensembles WOFF2 latins sur
// le web (fontFiles.web.ts, choisi par Metro).
import { FONT_FILES as PLATFORM_FONT_FILES } from './fontFiles';

/**
 * LA POLICE DE L'APPLICATION (système Cobalt) : SEUL module qui la connaît (avec ses tableaux de fichiers, fontFiles.ts
 * et fontFiles.web.ts). Aucun autre fichier ne nomme une police : les textes passent par `Text` / `TextInput` de
 * components/Text.tsx, qui appliquent la famille de la graisse demandée.
 *
 * Changer de police (voir docs/DESIGN.md § « Changer de police ») :
 * 1. `npx expo install @expo-google-fonts/<police>` dans apps/mobile (et retirer l'ancien paquet) ;
 * 2. fichiers de la police : src/fontFiles.ts (Android / iOS : les imports du paquet, une ligne par graisse) et, pour
 *    le web, les sous-ensembles WOFF2 de assets/fonts/ (commande pyftsubset de docs/DESIGN.md) listés dans
 *    src/fontFiles.web.ts ;
 * 3. dans CE fichier : `FONT_NAME`, `FAMILY_PREFIX`, `LOADED_WEIGHTS` si les graisses changent et
 *    `FONT_MISSING_CHARS` (caractères que la nouvelle police n'a pas) ;
 * 4. vérifier : `npx jest src/__tests__/fonts.test.tsx src/__tests__/textImports.test.ts`, `npm run export:web` (il
 *    annonce les polices préchargées), puis les écrans (la nouvelle police a peut-être d'autres proportions : titres
 *    très longs, chiffres tabulaires `tnum`).
 *
 * Fonctionnement : une famille par graisse (« PlusJakartaSans-800 »), chargée au démarrage par `useAppFonts`
 * (src/app/_layout.tsx). Un texte ne demande jamais un gras « synthétique » : le fichier de la graisse est choisi et
 * - Android / iOS : `fontWeight` est remis à 'normal' (le fichier porte déjà la graisse) ;
 * - web : chaque @font-face déclare sa vraie graisse, que le texte garde (même rendu ; si la police ne charge pas,
 *   la police du système qui prend le relais garde ainsi titres gras et texte courant).
 */

/** Graisses disponibles (fichiers). 900 est dessiné en 800 : la police n'a pas de 900. */
export type FontWeightValue = 400 | 500 | 600 | 700 | 800;

/** Nom de la police (documentation, tests). */
export const FONT_NAME = 'Plus Jakarta Sans';

/** Préfixe des familles enregistrées : « PlusJakartaSans-800 », « PlusJakartaSans-500-italic ». */
const FAMILY_PREFIX = 'PlusJakartaSans';

/** Fichier (module d'asset) de chaque graisse : droit, et italique facultatif. */
export type FontFileTable = Record<FontWeightValue, { normal: number; italic?: number }>;

/**
 * Graisse → fichier de police (droit ; `italic` facultatif) de la plateforme : TTF complet sur Android / iOS
 * (fontFiles.ts), sous-ensemble WOFF2 latin sur le web (fontFiles.web.ts). Sans fichier italique, un texte en italique
 * est penché par la plateforme (web, Android) ou reste droit (iOS) : Cobalt n'utilise pas l'italique.
 */
export const FONT_FILES: FontFileTable = PLATFORM_FONT_FILES;

/** Graisse d'un texte sans `fontWeight` : le texte courant de Cobalt (15/500). */
export const DEFAULT_WEIGHT: FontWeightValue = 500;

/**
 * Graisses chargées au démarrage (un fichier chacune : TTF de ≈ 95 ko sur Android / iOS, WOFF2 latin de ≈ 11 ko sur le
 * web). Cobalt écrit en 500 / 600 / 700 / 800 : 400 n'est pas chargé (aucun écran ne le demande ; un
 * `fontWeight: '400'` est dessiné en 500). L'ajouter ici suffit à le charger.
 */
export const LOADED_WEIGHTS: readonly FontWeightValue[] = [500, 600, 700, 800];

/**
 * Caractères absents de la police, dessinés avec un équivalent qu'elle possède (même sens, même comportement en fin de
 * ligne). Plus Jakarta Sans n'a pas l'espace fine insécable U+202F (séparateur des milliers et espace avant « FCFA » de
 * `formatFcfa`) : sans substitution, ce seul caractère est pris dans une autre police et l'espace disparaît presque
 * (« 16500FCFA »). Les données gardent U+202F ; seul l'affichage (components/Text.tsx) utilise l'espace insécable
 * U+00A0. Changer de police : vider ou compléter cette table.
 */
export const FONT_MISSING_CHARS: Readonly<Record<string, string>> = { '\u202F': '\u00A0' };

const MISSING_RE = Object.keys(FONT_MISSING_CHARS).length ? new RegExp(`[${Object.keys(FONT_MISSING_CHARS).join('')}]`, 'g') : null;

/** Texte prêt à dessiner dans la police : caractères absents remplacés (`FONT_MISSING_CHARS`), sinon inchangé. */
export function withFontGlyphs(text: string): string {
  if (!MISSING_RE) return text;
  MISSING_RE.lastIndex = 0;
  return MISSING_RE.test(text) ? text.replace(MISSING_RE, (c) => FONT_MISSING_CHARS[c] ?? c) : text;
}

/** La police de l'application est-elle utilisée pour dessiner (web : toujours, avec repli ; natif : une fois chargée) ? */
export function fontInUse(): boolean {
  return Platform.OS === 'web' || fontState === 'ready';
}

/** Délai maximal d'attente des polices au démarrage : au-delà, police du système (voir `useAppFonts`). */
export const FONT_LOAD_TIMEOUT_MS = 2500;

/**
 * Page publique de suivi (web, ouverte depuis un SMS, souvent en 3G) : attente très courte. Le suivi s'affiche dès que
 * le JavaScript est prêt, dans la police du système si les polices ne sont pas encore là (première visite : elles ne
 * sont pas préchargées, pour ne pas retarder le JavaScript ; demandées au démarrage de l'application, 44 ko en WOFF2,
 * elles arrivent peu après) ; le navigateur les substitue à leur arrivée. Visites suivantes : polices en cache, chargées
 * dans ce délai.
 */
export const FONT_PUBLIC_TIMEOUT_MS = 200;

const NAMED_WEIGHTS: Record<string, number> = {
  normal: 400,
  regular: 400,
  bold: 700,
  thin: 100,
  ultralight: 200,
  light: 300,
  medium: 500,
  semibold: 600,
  condensed: 400,
  condensedbold: 700,
  heavy: 800,
  black: 900,
};

/** `fontWeight` de React Native ('800', 800, 'bold'…) → nombre (400 sans valeur ou valeur inconnue). */
export function numericWeight(weight: TextStyle['fontWeight'] | number | null | undefined): number {
  if (weight === undefined || weight === null) return DEFAULT_WEIGHT;
  if (typeof weight === 'number') return Number.isFinite(weight) ? weight : 400;
  const n = Number(weight);
  if (Number.isFinite(n)) return n;
  return NAMED_WEIGHTS[String(weight).toLowerCase()] ?? 400;
}

/** Graisse chargée la plus proche (à égalité, la plus grasse) : 900 → 800, 400 → 500 tant que 400 n'est pas chargé. */
export function loadedWeight(weight: number): FontWeightValue {
  let best = LOADED_WEIGHTS[0] ?? DEFAULT_WEIGHT;
  for (const w of LOADED_WEIGHTS) {
    if (Math.abs(w - weight) < Math.abs(best - weight) || (Math.abs(w - weight) === Math.abs(best - weight) && w > best)) best = w;
  }
  return best;
}

function familyName(weight: FontWeightValue, italic: boolean): string {
  return `${FAMILY_PREFIX}-${weight}${italic ? '-italic' : ''}`;
}

/** Une graisse a-t-elle un vrai fichier italique (chargé avec elle) ? */
function hasItalic(weight: FontWeightValue): boolean {
  return FONT_FILES[weight].italic !== undefined;
}

/**
 * Nom de la famille à utiliser pour une graisse (et l'italique) : celle du fichier chargé le plus proche, ex.
 * `fontFor('900')` → « PlusJakartaSans-800 ». L'italique sans fichier italique donne la famille droite.
 */
export function fontFor(weight?: TextStyle['fontWeight'] | number | null, italic = false): string {
  const w = loadedWeight(numericWeight(weight));
  return familyName(w, italic && hasItalic(w));
}

/** Polices à charger (`loadAsync` / `useFonts` d'expo-font) : nom de famille → fichier (graisses `LOADED_WEIGHTS`). */
export const FONT_ASSETS: Record<string, FontSource> = Object.fromEntries(
  LOADED_WEIGHTS.flatMap((w) => {
    const faces: [string, FontSource][] = [];
    const add = (file: number, italic: boolean) =>
      faces.push([
        familyName(w, italic),
        // Web : vraie graisse déclarée dans l'@font-face (aucun gras synthétique), texte affiché aussitôt dans la
        // police du système puis remplacé quand le fichier arrive (`swap`, s'il arrive après le délai d'attente).
        Platform.OS === 'web' ? { uri: file, display: FontDisplay.SWAP, weight: w, style: italic ? 'italic' : 'normal' } : file,
      ]);
    add(FONT_FILES[w].normal, false);
    const italicFile = FONT_FILES[w].italic;
    if (italicFile !== undefined) add(italicFile, true);
    return faces;
  }),
);

/* ------------------------------------------------------------------------------------------------------------------ */
/* État du chargement                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

/** loading : pas encore décidé ; ready : police chargée ; system : police du système (erreur, délai, économie de données). */
export type FontState = 'loading' | 'ready' | 'system';

let fontState: FontState = 'loading';
let loadPromise: Promise<void> | null = null;

/** État du chargement des polices (figé une fois décidé : pas de changement de police au milieu d'une session). */
export function getFontState(): FontState {
  return fontState;
}

/** Tests uniquement : force l'état (ex. 'ready' pour vérifier les familles appliquées sur Android / iOS). */
export function setFontStateForTests(state: FontState): void {
  fontState = state;
  loadPromise = null;
  overrideCache.clear();
}

/**
 * Charge les polices au démarrage et dit quand l'application peut s'afficher : polices chargées, ou au plus tard après
 * `FONT_LOAD_TIMEOUT_MS` (puis police du système), ou aussitôt en cas d'erreur. Tant que la valeur est false,
 * l'écran de démarrage reste affiché (web : celui du HTML, public/index.html). `skip` : ne pas charger (connexion
 * très lente sur la page publique de suivi : police du système directement).
 */
export function useAppFonts({ skip = false, timeoutMs = FONT_LOAD_TIMEOUT_MS }: { skip?: boolean; timeoutMs?: number } = {}): boolean {
  const [settled, setSettled] = useState(fontState !== 'loading');
  useEffect(() => {
    if (fontState !== 'loading') {
      setSettled(true);
      return;
    }
    let active = true;
    const decide = (state: FontState) => {
      // Décidé une seule fois : une police arrivée après le délai ne change pas les textes déjà affichés
      // (Android / iOS ; sur le web, le navigateur la substitue lui-même, voir FONT_ASSETS).
      if (fontState === 'loading') {
        fontState = state;
        overrideCache.clear();
      }
      if (active) setSettled(true);
    };
    if (skip) {
      decide('system');
      return;
    }
    const timer = setTimeout(() => decide('system'), timeoutMs);
    loadPromise ??= loadAsync(FONT_ASSETS);
    loadPromise.then(
      () => decide('ready'),
      () => decide('system'),
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [skip, timeoutMs]);
  return settled;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Styles appliqués aux textes                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

const overrideCache = new Map<string, TextStyle | null>();

/**
 * Style à ajouter à un texte de graisse `weight` (et italique) pour qu'il soit dessiné dans la police : famille de la
 * graisse, sans gras synthétique. null : rien à ajouter (Android / iOS tant que la police n'est pas chargée, ou si elle
 * ne l'a pas été : police du système avec ses graisses). Objets créés une fois (StyleSheet) et réutilisés.
 * Aussi pour les composants tiers qui prennent un style de texte (en-têtes de navigation…).
 */
export function typeface(weight?: TextStyle['fontWeight'] | number | null, italic = false): TextStyle | null {
  const w = loadedWeight(numericWeight(weight));
  const key = `${w}${italic ? 'i' : ''}`;
  const cached = overrideCache.get(key);
  if (cached !== undefined) return cached;
  let style: TextStyle | null;
  if (Platform.OS === 'web') {
    // La famille d'abord, la police du système ensuite (« System » : pile de polices du système de react-native-web).
    style = { fontFamily: `${familyName(w, italic && hasItalic(w))}, System`, fontWeight: String(w) as TextStyle['fontWeight'] };
  } else if (fontState === 'ready') {
    const realItalic = italic && hasItalic(w);
    style = { fontFamily: familyName(w, realItalic), fontWeight: 'normal', ...(realItalic ? { fontStyle: 'normal' as const } : null) };
  } else {
    style = null;
  }
  const created = style ? StyleSheet.create({ s: style }).s : null;
  overrideCache.set(key, created);
  return created;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Largeur des textes (ajustement sans mesure)                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Avance des caractères de la police (part de la taille), mesurée sur ses fichiers (graisse 800, chiffres tabulaires
 * `tnum` ; arrondie vers le haut pour couvrir les autres graisses et la police du système en repli). Sert à donner à un
 * montant ou une heure la plus grande taille qui tient dans sa place (components/design/FitAmount.tsx). À mesurer de
 * nouveau en changeant de police (avance du glyphe / unitsPerEm, ex. avec fontTools).
 */
export const GLYPH_EM = { digit: 0.6, space: 0.18, colon: 0.41, sign: 0.68, upper: 0.72, lower: 0.57, other: 0.6 } as const;

/** Largeur estimée de `text` dessiné à `size` px (interlettrage `letterSpacing` compris), en px. */
export function estimateTextWidth(text: string, size: number, letterSpacing = 0): number {
  let em = 0;
  let n = 0;
  for (const ch of text) {
    n++;
    if (ch >= '0' && ch <= '9') em += GLYPH_EM.digit;
    else if (ch === ' ' || ch === ' ' || ch === ' ') em += GLYPH_EM.space;
    else if (ch === ':' || ch === '.' || ch === ',') em += GLYPH_EM.colon;
    else if (ch === '+' || ch === '-' || ch === '−') em += GLYPH_EM.sign;
    else if (ch !== ch.toLowerCase()) em += GLYPH_EM.upper;
    else if (ch !== ch.toUpperCase()) em += GLYPH_EM.lower;
    else em += GLYPH_EM.other;
  }
  return em * size + letterSpacing * n;
}
