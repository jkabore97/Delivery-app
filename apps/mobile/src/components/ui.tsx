import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../theme';

/* ------------------------------ Mise en page ------------------------------ */

export function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  edges = ['top'],
  style,
  footer,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  /** Bloc fixé en bas (bouton principal). */
  footer?: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, style]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, style]}>{children}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
  highlight,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Bordure colorée (ex. commande NOUVELLE en orange). */
  highlight?: string;
}) {
  return (
    <View style={[styles.card, highlight ? { borderColor: highlight, borderWidth: 2 } : null, style]}>
      {children}
    </View>
  );
}

export function Row({
  children,
  style,
  gap = spacing.sm,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  gap?: number;
}) {
  return <View style={[styles.row, { gap }, style]}>{children}</View>;
}

export function Spacer({ size = spacing.md }: { size?: number }) {
  return <View style={{ height: size }} />;
}

/* ------------------------------ Textes ------------------------------ */

export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[styles.title, style]} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Subtitle({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.subtitle, style]}>{children}</Text>;
}

export function Body({
  children,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  return (
    <Text style={[styles.body, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function Muted({
  children,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  return (
    <Text style={[styles.muted, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

/* ------------------------------ Boutons ------------------------------ */

type ButtonVariant = 'solid' | 'outline' | 'ghost';

export function Button({
  title,
  onPress,
  color = colors.green,
  variant = 'solid',
  disabled,
  loading,
  style,
  small,
  testID,
}: {
  title: string;
  onPress: () => void;
  color?: string;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
  testID?: string;
}) {
  const inactive = disabled || loading;
  const base: ViewStyle =
    variant === 'solid'
      ? { backgroundColor: color, borderColor: color }
      : variant === 'outline'
        ? { backgroundColor: colors.white, borderColor: colors.border }
        : { backgroundColor: 'transparent', borderColor: 'transparent' };
  const textColor = variant === 'solid' ? colors.white : variant === 'outline' ? colors.text : color;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        base,
        inactive && styles.buttonDisabled,
        pressed && !inactive && styles.buttonPressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.buttonText, small && styles.buttonTextSmall, { color: textColor }]}>{title}</Text>
      )}
    </Pressable>
  );
}

/** Petite pastille cliquable (choix d'une adresse enregistrée, filtre...). */
export function Chip({
  label,
  selected,
  onPress,
  color = colors.green,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[styles.chip, selected && { backgroundColor: color, borderColor: color }]}
    >
      <Text style={[styles.chipText, selected && { color: colors.white }]}>{label}</Text>
    </Pressable>
  );
}

/* ------------------------------ Formulaires ------------------------------ */

export function Field({
  label,
  hint,
  error,
  ...input
}: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        {...input}
        accessibilityLabel={label}
        style={[styles.input, error ? { borderColor: colors.red } : null, input.style]}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? <Muted>{hint}</Muted> : null}
    </View>
  );
}

/* ------------------------------ États ------------------------------ */

type Tone = 'green' | 'orange' | 'blue' | 'red' | 'grey';

const TONES: Record<Tone, { bg: string; fg: string }> = {
  green: { bg: colors.greenLight, fg: colors.green },
  orange: { bg: colors.orangeLight, fg: '#B4610A' },
  blue: { bg: colors.blueLight, fg: colors.blue },
  red: { bg: colors.redLight, fg: colors.red },
  grey: { bg: '#EEF1F4', fg: colors.textMuted },
};

export function Badge({ label, tone = 'grey' }: { label: string; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.badgeText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

export function Banner({ message, tone = 'red' }: { message: string; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <View style={[styles.banner, { backgroundColor: t.bg }]} accessibilityRole="alert">
      <Text style={{ color: t.fg, fontWeight: '600' }}>{message}</Text>
    </View>
  );
}

export function Loading({ label = 'Chargement…' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.green} />
      <Muted style={{ marginTop: spacing.sm }}>{label}</Muted>
    </View>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Muted>{label}</Muted>
    </View>
  );
}

/** Ligne libellé / valeur (récapitulatif de paiement, gains...). */
export function KeyValue({
  label,
  value,
  strong,
  valueColor,
}: {
  label: string;
  value: string;
  strong?: boolean;
  valueColor?: string;
}) {
  return (
    <View style={styles.kv}>
      <Text style={[styles.body, strong && styles.bold]}>{label}</Text>
      <Text style={[styles.body, styles.bold, strong && { fontSize: 18 }, valueColor ? { color: valueColor } : null]}>
        {value}
      </Text>
    </View>
  );
}

/** Puce de couleur devant une adresse (orange = retrait, vert = livraison). */
export function Dot({ color }: { color: string }) {
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

/** Barre de progression horizontale (plafond d'espèces, délai d'une offre). */
export function ProgressBar({ value, color = colors.green }: { value: number; color?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
      <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md },
  footer: {
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, color: colors.text },
  bold: { fontWeight: '700' },
  muted: { fontSize: 13, color: colors.textMuted },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonSmall: { minHeight: 40, paddingHorizontal: spacing.md },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.8 },
  buttonText: { fontSize: 16, fontWeight: '700' },
  buttonTextSmall: { fontSize: 14 },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chipText: { fontSize: 14, color: colors.text, fontWeight: '600' },
  field: { gap: 6 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  fieldError: { fontSize: 13, color: colors.red },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.white,
  },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  banner: { padding: spacing.md, borderRadius: radius.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  empty: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.textMuted, textAlign: 'center' },
  stat: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: { fontSize: 20, fontWeight: '800', color: colors.text },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: '#E9EDF1', overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
});
