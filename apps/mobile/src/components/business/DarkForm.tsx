import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { dark, spacing } from '../../theme';
import { Pill } from '../design/Pill';

/**
 * Formulaire sur fond sombre (parcours « Nouvelle livraison » de l'entreprise) : champ, bandeau, titre de section et
 * ligne de choix (véhicule, qui paie). Couleurs `dark` du système de design (theme.ts).
 */

/** Champ de saisie : libellé, erreur (rouge) ou aide, `accessibilityLabel` = libellé (comme `Field`). */
export function DarkField({ label, hint, error, style, ...input }: TextInputProps & { label: string; hint?: string | null; error?: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={dark.textFaint}
        selectionColor={dark.green}
        {...input}
        accessibilityLabel={label}
        style={[styles.input, error ? styles.inputError : null, style]}
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

const BANNER = {
  red: { bg: dark.redSoft, fg: dark.red },
  amber: { bg: dark.amberSoft, fg: dark.amber },
  green: { bg: dark.greenSoft, fg: dark.green },
} as const;

/**
 * Message (erreur, avertissement, confirmation) dans une feuille sombre. `action` : bouton sous le message (ex.
 * « Réessayer » après un chargement en échec, quand rien ne relancera l'appel tout seul).
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
  if (!action) {
    return (
      <Text style={[styles.banner, { backgroundColor: t.bg, color: t.fg }]} accessibilityRole="alert" testID={testID}>
        {message}
      </Text>
    );
  }
  return (
    <View style={[styles.bannerBox, { backgroundColor: t.bg }]} testID={testID}>
      <Text style={[styles.bannerText, { color: t.fg }]} accessibilityRole="alert">
        {message}
      </Text>
      <Pill label={action.label} icon="refresh" tone="outline" onPress={action.onPress} loading={action.loading} testID={action.testID} />
    </View>
  );
}

/** Petit titre de section en capitales (« VÉHICULE », « QUI PAIE LA LIVRAISON ? »). */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}

/**
 * Ligne de choix (bouton radio) : pastille ou pictogramme à gauche, titre et détail, valeur à droite (prix). Choisie :
 * contour vert vif. Inactive (véhicule indisponible) : estompée.
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
  /** card : coins de 18 px ; pill : bouts entièrement arrondis (choix du véhicule, qui paie). */
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
      style={({ pressed }) => [styles.choice, shape === 'pill' && styles.choicePill, selected && styles.choiceOn, disabled && styles.choiceOff, pressed && !disabled && { opacity: 0.88 }]}
      testID={testID}
    >
      {leading ?? <View style={[styles.radio, selected && styles.radioOn]} />}
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
  label: { fontSize: 13.5, fontWeight: '800', color: dark.textMuted },
  input: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.raised,
    color: dark.text,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    fontWeight: '600',
  },
  inputError: { borderColor: dark.red },
  error: { fontSize: 13, fontWeight: '700', color: dark.red },
  hint: { fontSize: 12.5, lineHeight: 17, color: dark.textFaint },
  banner: { borderRadius: 12, padding: spacing.md, fontWeight: '700', fontSize: 14, lineHeight: 19, overflow: 'hidden' },
  bannerBox: { borderRadius: 12, padding: spacing.md, gap: spacing.sm, alignItems: 'flex-start' },
  bannerText: { fontWeight: '700', fontSize: 14, lineHeight: 19 },
  section: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: dark.textFaint,
    marginTop: spacing.sm,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: dark.border,
    backgroundColor: dark.raised,
  },
  choicePill: { borderRadius: 999, paddingLeft: 10, paddingRight: 20 },
  choiceOn: { borderColor: dark.green, backgroundColor: '#13261E' },
  choiceOff: { opacity: 0.45 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: dark.textFaint },
  radioOn: { borderColor: dark.green, borderWidth: 7 },
  choiceTitle: { fontSize: 16, fontWeight: '900', color: dark.text },
  choiceSubtitle: { fontSize: 12.5, lineHeight: 17, color: dark.textMuted },
});
