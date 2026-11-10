import { useState, type Ref } from 'react';
import { Platform, StyleSheet, View, type TextInputInstance } from 'react-native';
import { Text, TextInput } from '../Text';
import { alpha, palette } from '../../theme';

/**
 * Saisie d'un code en cases (code de livraison à 4 chiffres, code de connexion à 6 chiffres), au dessin Cobalt, lisible
 * en plein soleil : cases vides gris clair (raisedHigh) au contour gris de 2 px (3,1:1 au moins, sur la case comme sur
 * la carte blanche), cases remplies blanches au contour gris foncé (inkMuted, 6:1), chiffres 800 tabulaires, case
 * suivante cerclée de cobalt (2 px) quand le champ a le focus, toutes cerclées de rouge foncé en cas d'erreur.
 *
 * Un VRAI champ (transparent) couvre les cases : toucher une case ouvre le clavier numérique, un appui long propose
 * « Coller », le code collé (« 4 8 2 1 », « Code : 4821 ») est réduit à ses chiffres (pas de `maxLength`, qui
 * couperait le texte collé avant d'en extraire les chiffres) ; complétion automatique des codes
 * reçus par SMS (`oneTimeCode`). Les cases sont décoratives : les lecteurs d'écran lisent le champ (libellé, valeur).
 */
export function CodeInput({
  value,
  onChangeText,
  length,
  autoFocus,
  error,
  accessibilityLabel,
  oneTimeCode,
  onSubmit,
  onFocus,
  inputRef,
  testID,
}: {
  value: string;
  onChangeText: (digits: string) => void;
  length: number;
  autoFocus?: boolean;
  error?: boolean;
  accessibilityLabel: string;
  /** Code reçu par SMS : complétion automatique du système. */
  oneTimeCode?: boolean;
  onSubmit?: () => void;
  /** Le champ prend le focus (ex. faire défiler l'écran pour garder les cases au-dessus du clavier). */
  onFocus?: () => void;
  inputRef?: Ref<TextInputInstance>;
  /** Sur le champ. */
  testID?: string;
}) {
  const [focused, setFocused] = useState(!!autoFocus);
  const [width, setWidth] = useState(0);
  const gap = length > 4 ? 8 : 12;
  // Cases de 64 × 76 (4 chiffres) ou 52 × 64 (6 chiffres), réduites pour tenir dans la largeur disponible.
  const ideal = length > 4 ? 52 : 64;
  // 2 px de marge de chaque côté : l'anneau de la case active n'est jamais rogné par le bord de la carte.
  const box = width > 0 ? Math.min(ideal, Math.floor((width - 4 - gap * (length - 1)) / length)) : ideal;
  const boxHeight = Math.round(box * (length > 4 ? 1.24 : 1.2));
  const digitSize = Math.round(box * (length > 4 ? 0.55 : 0.56));
  return (
    <View
      style={styles.wrap}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w > 0 && w !== width) setWidth(w);
      }}
    >
      <View style={[styles.row, { gap }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length }).map((_, i) => {
          const filled = i < value.length;
          const active = focused && (i === value.length || (value.length === length && i === length - 1));
          return (
            <View
              key={i}
              style={[
                styles.box,
                { width: box, height: boxHeight },
                filled && styles.boxFilled,
                active && styles.boxActive,
                error && styles.boxError,
              ]}
            >
              <Text style={[styles.digit, { fontSize: digitSize, lineHeight: Math.round(digitSize * 1.15) }]}>{value[i] ?? ''}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(t) => onChangeText(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        inputMode="numeric"
        autoFocus={autoFocus}
        autoComplete={oneTimeCode ? 'sms-otp' : 'off'}
        textContentType={oneTimeCode ? 'oneTimeCode' : 'none'}
        autoCorrect={false}
        caretHidden
        selectionColor="transparent"
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmit}
        accessibilityLabel={accessibilityLabel}
        style={styles.input}
        testID={testID}
      />
    </View>
  );
}

/** Contour d'une case vide : 3,4:1 sur la carte blanche, 3,1:1 sur la case (raisedHigh). */
const EMPTY_BORDER = alpha(palette.inkMuted, 0.75);

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', justifyContent: 'center' },
  box: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: EMPTY_BORDER,
    backgroundColor: palette.raisedHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxFilled: { backgroundColor: palette.white, borderColor: palette.inkMuted },
  // Anneau de focus : 2 px cobalt (6,1:1 sur blanc).
  boxActive: { borderColor: palette.cobalt, backgroundColor: palette.white },
  boxError: { borderColor: palette.coralText },
  digit: { fontWeight: '800', color: palette.ink, fontVariant: ['tabular-nums'] },
  // Champ réel posé sur les cases, invisible (texte, curseur et sélection transparents) mais touchable partout.
  input: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    color: 'transparent',
    backgroundColor: 'transparent',
    fontSize: 16,
    textAlign: 'center',
    // iOS : au moins 0,01 pour rester touchable ; le navigateur reçoit les clics même à 0.
    opacity: Platform.OS === 'web' ? 0 : Platform.OS === 'ios' ? 0.02 : 0.011,
    borderWidth: 0,
    // Pas d'anneau du navigateur (la case cerclée de cobalt montre le focus).
    outlineStyle: 'solid',
    outlineWidth: 0,
  },
});
