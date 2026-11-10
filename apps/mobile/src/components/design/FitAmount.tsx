import { useCallback, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Text } from '../Text';
import { estimateTextWidth } from '../../fonts';
import { formatFcfa, NNBSP } from '../../lib/format';
import { palette } from '../../theme';

/*
 * Montants (et autres textes en grands chiffres) qui ne sont JAMAIS coupés : la plus grande taille qui tient dans la
 * place, puis « FCFA » à la ligne s'il le faut. Sans react-native-svg : utilisable par la page publique de suivi
 * (components/tracking/TrackingParts.tsx) comme par le reste de l'application.
 */

/** Taille minimale par défaut des chiffres d'un montant (en dessous, « FCFA » passe à la ligne). */
export const FIT_MIN_SIZE = 18;
/** Plancher absolu : un chiffre n'est jamais coupé, même dans une place absurde. */
const FLOOR = 12;

/** Interlettrage des grands chiffres (serré, comme la planche Cobalt). */
export function figureLetterSpacing(size: number): number {
  return -Math.round(size * 0.03 * 10) / 10;
}

/**
 * Plus grande taille (px, entière) de `text` sur une ligne dans `width` px, entre `min` et `max` (largeur estimée
 * d'après les avances de la police, `estimateTextWidth`). Ne descend jamais sous `min` : au-delà, à l'appelant de
 * laisser passer à la ligne. `width` inconnue (null) : `max`.
 */
export function fitFontSize(text: string, width: number | null | undefined, max: number, min: number = FIT_MIN_SIZE): number {
  if (width === null || width === undefined || !(width > 0)) return max;
  for (let s = Math.floor(max); s > min; s--) if (estimateTextWidth(text, s, figureLetterSpacing(s)) <= width) return s;
  return Math.min(max, min);
}

/**
 * Taille d'un montant `figure` + `unit` (« FCFA » à `unitScale` de la taille) dans `width` px :
 * - sur une ligne, de `max` à `min` ;
 * - sinon, « FCFA » à la ligne (`wrap`) et les chiffres seuls à la plus grande taille qui tient (≥ `min`, ou moins
 *   dans une place très étroite : jamais coupés).
 */
export function fitAmountSize(
  figure: string,
  unit: string,
  width: number | null | undefined,
  max: number,
  min: number = FIT_MIN_SIZE,
  unitScale = 0.5,
): { size: number; wrap: boolean } {
  if (width === null || width === undefined || !(width > 0)) return { size: max, wrap: false };
  const lineWidth = (s: number) => estimateTextWidth(figure, s, figureLetterSpacing(s)) + (unit ? estimateTextWidth(unit, s * unitScale) : 0);
  for (let s = Math.floor(max); s >= min; s--) if (lineWidth(s) <= width) return { size: s, wrap: false };
  const alone = fitFontSize(figure, width, Math.min(max, Math.max(min, FLOOR)), FLOOR);
  return { size: alone, wrap: !!unit };
}

/**
 * Largeur disponible mesurée (onLayout) d'une place qui s'étire sur la largeur de son parent. Exemple : `const fit =
 * useFitFontSize('12:09', 64, 36)` puis `<View onLayout={fit.onLayout}><Text style={{ fontSize: fit.fontSize }}>`.
 */
export function useFitFontSize(text: string, maxSize: number, minSize: number = FIT_MIN_SIZE, knownWidth?: number | null) {
  const [measured, setMeasured] = useState<number | null>(null);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0) setMeasured((prev) => (prev === w ? prev : w));
  }, []);
  const width = knownWidth ?? measured;
  return { fontSize: fitFontSize(text, width, maxSize, minSize), width, onLayout };
}

export interface FitAmountProps {
  amount: number;
  /** Taille maximale des chiffres (px). */
  size: number;
  /** Taille minimale des chiffres (18 par défaut) : en dessous, « FCFA » passe à la ligne. */
  minSize?: number;
  /** Taille de « FCFA » (part de celle des chiffres ; 0,5 par défaut, 1 = même taille). */
  unitScale?: number;
  /** « + » devant un gain, « − » devant une dépense. */
  sign?: '+' | '−';
  color?: string;
  /** Position dans la place : début (défaut), fin (montant à droite d'un libellé), centre. */
  align?: 'start' | 'end' | 'center';
  /**
   * Largeur disponible, si l'appelant la connaît (ligne libellé / montant : part de la ligne mesurée par le parent).
   * Sinon la place est mesurée : elle doit s'étirer sur la largeur disponible (colonne, ou `style={{ flex: 1 }}` dans
   * une ligne), jamais se régler sur le texte.
   */
  width?: number | null;
  /** Style des chiffres (graisse, interlettrage…). */
  textStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  /** Sur l'élément qui contient tout le montant (texte : « 16 500 FCFA », espaces fines comprises). */
  testID?: string;
}

/**
 * Montant en grands chiffres tabulaires 800 avec « FCFA » plus petit, JAMAIS coupé ni terminé par « … » : il prend la
 * plus grande taille qui tient sur une ligne (de `size` à `minSize`), puis « FCFA » passe à la ligne. Les chiffres et
 * « FCFA » sont deux textes voisins (le second peut passer à la ligne) ; ensemble ils lisent `formatFcfa` à l'identique
 * (« 16 500 FCFA », espaces fines insécables) et forment un seul élément pour les lecteurs d'écran.
 */
export function FitAmount({
  amount,
  size,
  minSize = FIT_MIN_SIZE,
  unitScale = 0.5,
  sign,
  color = palette.ink,
  align = 'start',
  width,
  textStyle,
  style,
  testID,
}: FitAmountProps) {
  const [measured, setMeasured] = useState<number | null>(null);
  const full = formatFcfa(amount);
  const cut = full.lastIndexOf(NNBSP);
  const figure = `${sign ?? ''}${cut > 0 ? full.slice(0, cut) : full}`;
  const unit = cut > 0 ? full.slice(cut) : '';
  const fit = fitAmountSize(figure, unit, width ?? measured, size, minSize, unitScale);
  const unitSize = Math.max(11, Math.round(fit.size * unitScale));
  const justify = align === 'end' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start';
  return (
    <View
      style={[styles.box, { justifyContent: justify }, width ? { maxWidth: width } : null, style]}
      onLayout={
        width === undefined || width === null
          ? (e) => {
              const w = Math.round(e.nativeEvent.layout.width);
              if (w > 0) setMeasured((prev) => (prev === w ? prev : w));
            }
          : undefined
      }
      accessible
      testID={testID}
    >
      <Text
        style={[styles.figure, { fontSize: fit.size, lineHeight: Math.round(fit.size * 1.12), letterSpacing: figureLetterSpacing(fit.size), color }, textStyle]}
      >
        {figure}
      </Text>
      {unit ? <Text style={[styles.unit, { fontSize: unitSize, lineHeight: Math.round(unitSize * 1.25), color }]}>{unit}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', minWidth: 0 },
  figure: { fontWeight: '800', fontVariant: ['tabular-nums'] },
  unit: { fontWeight: '800', letterSpacing: 0 },
});
