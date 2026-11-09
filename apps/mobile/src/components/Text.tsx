import { createContext, useContext, useMemo, type ComponentPropsWithRef, type ReactNode } from 'react';
import { StyleSheet, Text as RNText, TextInput as RNTextInput, type StyleProp, type TextStyle } from 'react-native';
import { fontInUse, loadedWeight, numericWeight, typeface, withFontGlyphs } from '../fonts';

/**
 * `Text` et `TextInput` de l'application : ceux de React Native, dessinés dans la police de l'application (src/fonts.ts).
 * TOUS les textes de l'application passent par eux (un test refuse l'import de Text / TextInput depuis 'react-native'
 * ailleurs, sauf dans les dossiers de la carte).
 *
 * Le style est aplati pour lire la graisse (`fontWeight`) et le style (`fontStyle`) effectifs, puis complété par la
 * famille du fichier de cette graisse (`typeface`, sans gras synthétique) : `[style, famille]`, ce qui garde les styles
 * précompilés (StyleSheet) sur le web. Toutes les props et la ref (React 19 : prop ordinaire) sont transmises.
 * Rapide : lecture mémorisée par objet de style, complément créé une fois par graisse.
 *
 * Textes imbriqués : un `Text` dans un `Text` sans graisse ni style propres hérite de son parent (même famille), comme
 * en CSS ; avec une graisse propre, il prend la famille de cette graisse.
 */

interface FontScope {
  weight: number;
  italic: boolean;
  /** Famille choisie explicitement par le style (`fontFamily`) : les enfants sans graisse en héritent. */
  foreign: boolean;
}

/** Graisse résolue du `Text` parent (null hors d'un texte). */
const FontScopeContext = createContext<FontScope | null>(null);

interface FontProps {
  weight: TextStyle['fontWeight'] | undefined;
  fontStyle: TextStyle['fontStyle'] | undefined;
  family: string | undefined;
}

const NO_FONT_PROPS: FontProps = { weight: undefined, fontStyle: undefined, family: undefined };
const fontPropsCache = new WeakMap<object, FontProps>();

/** Graisse, style et famille effectifs d'un style (aplati), mémorisés par objet de style. */
function fontPropsOf(style: StyleProp<TextStyle>): FontProps {
  if (!style || typeof style !== 'object') return NO_FONT_PROPS;
  const cached = fontPropsCache.get(style);
  if (cached) return cached;
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const props: FontProps =
    flat.fontWeight === undefined && flat.fontStyle === undefined && flat.fontFamily === undefined
      ? NO_FONT_PROPS
      : { weight: flat.fontWeight, fontStyle: flat.fontStyle, family: flat.fontFamily };
  // Les tableaux de styles sont souvent recréés à chaque rendu : seuls les objets sont gardés (identité stable).
  if (!Array.isArray(style)) fontPropsCache.set(style, props);
  return props;
}

const scopeCache = new Map<string, FontScope>();
function scopeFor(weight: number, italic: boolean, foreign: boolean): FontScope {
  const key = `${weight}|${italic ? 1 : 0}|${foreign ? 1 : 0}`;
  let scope = scopeCache.get(key);
  if (!scope) {
    scope = { weight, italic, foreign };
    scopeCache.set(key, scope);
  }
  return scope;
}

interface Resolved {
  style: StyleProp<TextStyle>;
  /** Contexte à donner aux enfants (null : inchangé). */
  scope: FontScope | null;
}

/** Style final d'un texte et graisse transmise à ses enfants. */
function resolveFont(style: StyleProp<TextStyle>, parent: FontScope | null): Resolved {
  const own = fontPropsOf(style);
  if (own.family !== undefined) {
    // Police choisie explicitement (ex. 'monospace') : respectée telle quelle.
    return { style, scope: scopeFor(numericWeight(own.weight), own.fontStyle === 'italic', true) };
  }
  if (parent && own.weight === undefined && own.fontStyle === undefined) {
    // Texte imbriqué sans graisse propre : il hérite de la famille (et de la graisse) de son parent.
    return { style, scope: null };
  }
  const weight = own.weight !== undefined ? loadedWeight(numericWeight(own.weight)) : parent ? parent.weight : loadedWeight(numericWeight(undefined));
  const italic = own.fontStyle !== undefined ? own.fontStyle === 'italic' : parent ? parent.italic : false;
  const extra = parent?.foreign && own.weight === undefined ? null : typeface(weight, italic);
  return { style: extra ? (style ? [style, extra] : extra) : style, scope: scopeFor(weight, italic, false) };
}

/** Textes simples des enfants dessinés dans la police (caractères absents remplacés, voir `FONT_MISSING_CHARS`). */
function glyphSafe(children: ReactNode): ReactNode {
  if (typeof children === 'string') return withFontGlyphs(children);
  if (Array.isArray(children) && children.some((c) => typeof c === 'string')) {
    let changed = false;
    const next = children.map((c) => {
      if (typeof c !== 'string') return c;
      const out = withFontGlyphs(c);
      if (out !== c) changed = true;
      return out;
    });
    return changed ? next : children;
  }
  return children;
}

/** Enfants qui ne peuvent pas contenir de `Text` imbriqué (texte simple) : pas de contexte à fournir. */
function plainChildren(children: ReactNode): boolean {
  if (children === null || children === undefined || typeof children === 'string' || typeof children === 'number' || typeof children === 'boolean') return true;
  if (Array.isArray(children)) return children.every((c) => c === null || c === undefined || typeof c === 'string' || typeof c === 'number' || typeof c === 'boolean');
  return false;
}

export type TextProps = ComponentPropsWithRef<typeof RNText>;

/** `Text` de React Native dans la police de l'application (voir l'en-tête du fichier). */
export function Text(props: TextProps) {
  const parent = useContext(FontScopeContext);
  const { style, children } = props;
  const resolved = useMemo(() => resolveFont(style, parent), [style, parent]);
  const useFont = fontInUse();
  const content = useMemo(() => (useFont ? glyphSafe(children) : children), [children, useFont]);
  const text = (
    <RNText {...props} style={resolved.style}>
      {content}
    </RNText>
  );
  if (!resolved.scope || resolved.scope === parent || plainChildren(children)) return text;
  return <FontScopeContext.Provider value={resolved.scope}>{text}</FontScopeContext.Provider>;
}

export type TextInputProps = ComponentPropsWithRef<typeof RNTextInput>;

/** `TextInput` de React Native dans la police de l'application (texte saisi et indication). */
export function TextInput(props: TextInputProps) {
  const { style } = props;
  const resolved = useMemo(() => resolveFont(style, null), [style]);
  return <RNTextInput {...props} style={resolved.style} />;
}
/** Comme `TextInput.State` de React Native (champ actif…). */
TextInput.State = RNTextInput.State;
