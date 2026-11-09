import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type TextInputProps } from 'react-native';
import { Text, TextInput } from '../Text';
import { MIN_TOUCH, palette, radii, spacing } from '../../theme';
import { Pill } from '../design/Pill';
import { TrackingIcon, type IconName } from '../tracking/TrackingIcon';

/**
 * Formulaire Cobalt (parcours « Nouvelle livraison » de l'entreprise) : champ, bandeau, titre de section et ligne de
 * choix (véhicule, qui paie). Noms d'origine gardés (« Dark… » : le parcours était sombre) ; rendu clair Cobalt.
 */

/**
 * Champ de saisie : libellé, champ rempli (raised) de 56 px aux coins de 16 px, anneau cobalt de 2 px au focus,
 * erreur en rouge foncé (ou aide), `accessibilityLabel` = libellé (comme `Field`).
 */
export function DarkField({ label, hint, error, style, ...input }: TextInputProps & { label: string; hint?: string | null; error?: string | null }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={palette.inkMuted}
        selectionColor={palette.cobalt}
        {...input}
        onFocus={(e) => {
          setFocused(true);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          input.onBlur?.(e);
        }}
        accessibilityLabel={label}
        style={[styles.input, input.multiline && styles.inputMultiline, focused && styles.inputFocused, error ? styles.inputError : null, style]}
      />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const BANNER: Record<'red' | 'amber' | 'green', { bg: string; fg: string; icon: IconName }> = {
  red: { bg: palette.coralTint, fg: palette.coralText, icon: 'alert' },
  amber: { bg: palette.sunTint, fg: palette.sunText, icon: 'alert' },
  green: { bg: palette.mintTint, fg: palette.mintText, icon: 'check' },
};

/**
 * Message (erreur, avertissement, confirmation) : bandeau teinté aux coins de 16 px, pictogramme à gauche. `action` :
 * bouton sous le message (ex. « Réessayer » après un chargement en échec, quand rien ne relancera l'appel tout seul).
 */
export function DarkBanner({
  message,
  tone = 'red',
  action,
  testID,
}: {
  message: string;
  tone?: keyof typeof BANNER;
  action?: { label: string; onPress: () => void; loading?: boolean; testID?: string } | null;
  testID?: string;
}) {
  const t = BANNER[tone];
  return (
    <View style={[styles.bannerBox, { backgroundColor: t.bg }]} testID={testID}>
      <View style={styles.bannerRow}>
        <TrackingIcon name={t.icon} size={18} color={t.fg} strokeWidth={2.4} />
        <Text style={[styles.bannerText, { color: t.fg }]} accessibilityRole="alert">
          {message}
        </Text>
      </View>
      {action ? <Pill label={action.label} icon="refresh" tone="outline" onPress={action.onPress} loading={action.loading} testID={action.testID} /> : null}
    </View>
  );
}

/** Petit titre de section (« Véhicule », « Qui paie la livraison ? ») : 12/700 en capitales, encre secondaire. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.section} accessibilityRole="header">
      {children}
    </Text>
  );
}

/**
 * Ligne de choix (bouton radio) : pastille ou pictogramme à gauche, titre et détail, valeur à droite (prix). Choisie :
 * fond cobaltTint et contour cobalt. Inactive (véhicule indisponible) : estompée.
 */
export function ChoiceRow({
  selected,
  onPress,
  disabled,
  leading,
  title,
  subtitle,
  right,
  accessibilityLabel,
  shape = 'card',
  testID,
}: {
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  leading?: ReactNode;
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
  accessibilityLabel?: string;
  /** card : coins de 20 px ; pill : bouts entièrement arrondis (choix du véhicule, qui paie). */
  shape?: 'card' | 'pill';
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      // État coché : `checked` pour Android / iOS, `aria-checked` pour le web (react-native-web ignore `selected`).
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      aria-checked={selected}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.choice,
        shape === 'pill' && styles.choicePill,
        selected && styles.choiceOn,
        disabled && styles.choiceOff,
        pressed && !disabled && !selected && styles.choicePressed,
      ]}
      testID={testID}
    >
      {leading ?? (
        <View style={[styles.radio, selected && styles.radioOn]}>
          {selected ? <View style={styles.radioDot} /> : null}
        </View>
      )}
      <View style={styles.flex}>
        <Text style={styles.choiceTitle}>{title}</Text>
        {subtitle ? (
          <Text style={styles.choiceSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  field: { gap: 6 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: palette.ink },
  input: {
    minHeight: MIN_TOUCH,
    borderRadius: radii.input,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: palette.raised,
    color: palette.ink,
    paddingHorizontal: spacing.lg,
    // 16 px (et non 15) : en dessous, Safari sur iPhone agrandit la page au focus d'un champ.
    fontSize: 16,
    fontWeight: '500',
  },
  inputMultiline: { paddingTop: 14, paddingBottom: 14, minHeight: 96, textAlignVertical: 'top' },
  // Anneau de focus : la bordure cobalt de 2 px (6,1:1 sur blanc) remplace le contour du navigateur.
  inputFocused: { borderColor: palette.cobalt, backgroundColor: palette.white, outlineWidth: 0 },
  inputError: { borderColor: palette.coralText },
  error: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: palette.coralText },
  hint: { fontSize: 12.5, lineHeight: 17, fontWeight: '500', color: palette.inkMuted },
  bannerBox: { borderRadius: radii.banner, paddingVertical: 12, paddingHorizontal: 14, gap: spacing.sm, alignItems: 'flex-start' },
  bannerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, alignSelf: 'stretch' },
  bannerText: { flex: 1, fontWeight: '600', fontSize: 14, lineHeight: 20 },
  section: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: palette.inkMuted,
    marginTop: spacing.sm,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: palette.raised,
  },
  choicePill: { borderRadius: 999, paddingLeft: 12, paddingRight: 20 },
  choiceOn: { borderColor: palette.cobalt, backgroundColor: palette.cobaltTint },
  choiceOff: { opacity: 0.45 },
  choicePressed: { backgroundColor: palette.raisedHigh },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: palette.inkMuted, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: palette.cobalt, backgroundColor: palette.cobalt },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.white },
  choiceTitle: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: palette.ink },
  choiceSubtitle: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: palette.inkMuted },
});
