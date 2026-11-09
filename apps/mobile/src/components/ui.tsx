import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Text, TextInput } from './Text';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { MIN_TOUCH, palette, radii, shadows, spacing, typography } from '../theme';
import { useTabBarInset } from './design/tabBarInset';
import { TrackingIcon, type IconName } from './tracking/TrackingIcon';

/*
 * Composants de base Cobalt (docs/DESIGN.md). Ce fichier est aussi chargé par la page publique de suivi : il n'utilise
 * que `TrackingIcon` (SVG du navigateur sur le web), jamais react-native-svg.
 */

/* ------------------------------ Mise en page ------------------------------ */

/**
 * Écran Cobalt : fond canvas, défilement (tirer pour actualiser avec `onRefresh`), bloc fixé en bas sur fond blanc.
 * Au-dessus de la barre d'onglets flottante, le contenu garde la place de la barre.
 */
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
  const tabInset = useTabBarInset();
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, tabInset && !footer ? { paddingBottom: tabInset + spacing.lg } : null, style]}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={palette.cobalt} colors={[palette.cobalt]} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, tabInset && !footer ? { paddingBottom: tabInset } : null, style]}>{children}</View>
      )}
      {footer ? <View style={[styles.footer, shadows.sheet, tabInset ? { paddingBottom: tabInset } : null]}>{footer}</View> : null}
    </SafeAreaView>
  );
}

/**
 * Carte Cobalt : blanche, coins de 24 px, ombre douce, sans bordure. `highlight` : contour coloré de 2 px (ex. dossier
 * en attente) ; Cobalt n'a pas de liseré latéral.
 */
export function Card({
  children,
  style,
  highlight,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Contour coloré (ex. commande à traiter). */
  highlight?: string;
}) {
  return <View style={[styles.card, shadows.tile, highlight ? { borderColor: highlight, borderWidth: 2 } : null, style]}>{children}</View>;
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

/** Titre d'écran (display 30/800). */
export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[styles.title, style]} accessibilityRole="header">
      {children}
    </Text>
  );
}

/** Nom, titre de carte (18/700). */
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

/** Texte secondaire (13/500, encre secondaire : 5,96:1 sur blanc, 5,26:1 sur canvas). */
export function Muted({
  children,
  style,
  numberOfLines,
  testID,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  testID?: string;
}) {
  return (
    <Text style={[styles.muted, style]} numberOfLines={numberOfLines} testID={testID}>
      {children}
    </Text>
  );
}

/** Titre de section (« En cours », 17/800, en minuscules : Cobalt n'écrit pas ses titres en capitales). */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.sectionTitle} accessibilityRole="header">
      {children}
    </Text>
  );
}

/* ------------------------------ Boutons ------------------------------ */

type ButtonVariant = 'solid' | 'outline' | 'ghost';

/**
 * Bouton Cobalt en pilule : solid = plein (cobalt par défaut, texte blanc 16/700, 56 px) ; outline = secondaire (blanc à
 * filet fin, texte encre) ; ghost = tertiaire (texte de la couleur, cobalt par défaut). `small` : 44 px, 14/700.
 * Une couleur pleine destructive (`palette.coralFill`) donne le bouton « Annuler la livraison ».
 */
export function Button({
  title,
  onPress,
  color = palette.cobalt,
  variant = 'solid',
  disabled,
  loading,
  style,
  small,
  icon,
  textColor: textColorProp,
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
  /** Pictogramme avant le titre, dessiné de la couleur du texte (ex. `(c) => <Icon name="camera" color={c} />`). */
  icon?: (color: string) => ReactNode;
  /** Couleur du texte (et du pictogramme) à la place de celle par défaut (blanc sur un bouton plein). */
  textColor?: string;
  testID?: string;
}) {
  const inactive = disabled || loading;
  const base: ViewStyle =
    variant === 'solid'
      ? { backgroundColor: color, borderColor: color }
      : variant === 'outline'
        ? { backgroundColor: palette.white, borderColor: palette.line }
        : { backgroundColor: 'transparent', borderColor: 'transparent' };
  const textColor = textColorProp ?? (variant === 'solid' ? palette.white : variant === 'outline' ? palette.ink : color);
  const glow = variant === 'solid' && color === palette.cobalt && !inactive ? shadows.cobalt : variant === 'outline' ? styles.buttonHairShadow : null;
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
        glow,
        inactive && styles.buttonDisabled,
        pressed && !inactive && (variant === 'ghost' ? styles.ghostPressed : styles.buttonPressed),
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : icon ? (
        <View style={styles.buttonContent}>
          {icon(textColor)}
          <Text style={[styles.buttonText, small && styles.buttonTextSmall, { color: textColor }]}>{title}</Text>
        </View>
      ) : (
        <Text style={[styles.buttonText, small && styles.buttonTextSmall, { color: textColor }]}>{title}</Text>
      )}
    </Pressable>
  );
}

/** Pastille de choix (adresse enregistrée, filtre…) : pilule raised ; choisie : `color` plein (cobalt), texte blanc. */
export function Chip({
  label,
  selected,
  onPress,
  color = palette.cobalt,
  selectedTextColor = palette.white,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
  /** Texte de la pastille choisie (blanc par défaut). */
  selectedTextColor?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && { backgroundColor: color }, pressed && !selected && styles.chipPressed]}
    >
      <Text style={[styles.chipText, selected && { color: selectedTextColor }]}>{label}</Text>
    </Pressable>
  );
}

/* ------------------------------ Formulaires ------------------------------ */

/**
 * Champ Cobalt : libellé au-dessus, champ rempli (raised) de 56 px aux coins de 16 px, anneau cobalt de 2 px au focus,
 * erreur en rouge foncé sous le champ (sinon `hint`). `accessibilityLabel` = libellé.
 */
export function Field({
  label,
  hint,
  error,
  ...input
}: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
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
        style={[styles.input, input.multiline && styles.inputMultiline, focused && styles.inputFocused, error ? styles.inputError : null, input.style]}
      />
      {error ? (
        <Text style={styles.fieldError} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Muted>{hint}</Muted>
      ) : null}
    </View>
  );
}

/* ------------------------------ États ------------------------------ */

/** Tons : green = réussite (mint), orange = avertissement (soleil doux), blue = information (cobalt), red = erreur, grey. */
type Tone = 'green' | 'orange' | 'blue' | 'red' | 'grey';

const TONES: Record<Tone, { bg: string; fg: string; icon: IconName }> = {
  green: { bg: palette.mintTint, fg: palette.mintText, icon: 'check' },
  orange: { bg: palette.sunTint, fg: palette.sunText, icon: 'alert' },
  blue: { bg: palette.cobaltTint, fg: palette.cobaltText, icon: 'info' },
  red: { bg: palette.coralTint, fg: palette.coralText, icon: 'alert' },
  grey: { bg: palette.raised, fg: palette.inkMuted, icon: 'info' },
};

/** Petite étiquette d'état en pilule (12/700, fond teinté, texte assorti). */
export function Badge({ label, tone = 'grey' }: { label: string; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.badgeText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

/**
 * Bandeau (information, avertissement, erreur, réussite) : fond teinté, coins de 16 px, pictogramme à gauche (celui du
 * ton par défaut, ou `icon`), texte assorti (4,6:1 au moins).
 */
export function Banner({
  message,
  tone = 'red',
  icon,
}: {
  message: string;
  tone?: Tone;
  /** Pictogramme avant le message, dessiné de la couleur du texte (par défaut celui du ton). */
  icon?: (color: string) => ReactNode;
}) {
  const t = TONES[tone];
  return (
    <View style={[styles.banner, { backgroundColor: t.bg }]} accessibilityRole="alert">
      <View style={styles.bannerIcon}>{icon ? icon(t.fg) : <TrackingIcon name={t.icon} size={18} color={t.fg} strokeWidth={2.4} />}</View>
      <Text style={[styles.bannerText, { color: t.fg }]}>{message}</Text>
    </View>
  );
}

export function Loading({ label = 'Chargement…' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={palette.cobalt} />
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

/** Tuile chiffrée (KPI) : grand nombre 800 tabulaire, libellé 13/600 dessous. */
export function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <View style={[styles.stat, shadows.tile]}>
      <Text style={[styles.statValue, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
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
      <Text style={[styles.kvLabel, strong && styles.kvLabelStrong]}>{label}</Text>
      <Text style={[styles.kvValue, strong && styles.kvValueStrong, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

/** Puce de couleur devant une adresse (retrait, livraison). */
export function Dot({ color }: { color: string }) {
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

/** Barre de progression horizontale (plafond d'espèces, délai d'une offre) : piste grise, remplissage cobalt. */
export function ProgressBar({ value, color = palette.cobalt }: { value: number; color?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
      <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: palette.canvas },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: palette.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: spacing.sm,
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: radii.card,
    padding: 20,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { ...typography.display, color: palette.ink },
  subtitle: { fontSize: 18, lineHeight: 23, fontWeight: '700', letterSpacing: -0.2, color: palette.ink },
  body: { ...typography.body, color: palette.ink },
  bold: { fontWeight: '700' },
  muted: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: palette.inkMuted },
  sectionTitle: { fontSize: 17, lineHeight: 22, fontWeight: '800', letterSpacing: -0.2, color: palette.ink, marginTop: spacing.sm },
  button: {
    minHeight: MIN_TOUCH,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  buttonSmall: { minHeight: 44, paddingHorizontal: spacing.lg },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  ghostPressed: { backgroundColor: palette.raised },
  buttonHairShadow: { boxShadow: '0 1px 2px rgba(12, 18, 34, 0.05)' },
  buttonText: { fontSize: 16, lineHeight: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  buttonTextSmall: { fontSize: 14, lineHeight: 18 },
  buttonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    backgroundColor: palette.raised,
  },
  chipPressed: { backgroundColor: palette.raisedHigh },
  chipText: { fontSize: 14, lineHeight: 18, color: palette.ink, fontWeight: '600' },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: palette.ink },
  fieldError: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: palette.coralText },
  input: {
    minHeight: MIN_TOUCH,
    borderRadius: radii.input,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingHorizontal: spacing.lg,
    // 16 px (et non 15) : en dessous, Safari sur iPhone agrandit la page au focus d'un champ.
    fontSize: 16,
    fontWeight: '500',
    color: palette.ink,
    backgroundColor: palette.raised,
  },
  inputMultiline: { paddingTop: 14, paddingBottom: 14, minHeight: 96, textAlignVertical: 'top' },
  // Anneau de focus : la bordure cobalt de 2 px (6,1:1 sur blanc) remplace le contour du navigateur.
  inputFocused: { borderColor: palette.cobalt, backgroundColor: palette.white, outlineWidth: 0 },
  inputError: { borderColor: palette.coralText },
  badge: { minHeight: 24, paddingHorizontal: 10, borderRadius: 12, alignSelf: 'flex-start', justifyContent: 'center' },
  badgeText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radii.banner },
  bannerIcon: { paddingTop: 1 },
  bannerText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  empty: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: palette.inkMuted, textAlign: 'center' },
  stat: {
    flex: 1,
    backgroundColor: palette.card,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    gap: 2,
  },
  statValue: { fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.6, color: palette.ink, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: palette.inkMuted },
  /** Montants : chiffres tabulaires (espaces fines des milliers bien visibles, colonnes alignées). */
  tabular: { fontVariant: ['tabular-nums'] },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  kvLabel: { flexShrink: 1, fontSize: 15, lineHeight: 21, fontWeight: '500', color: palette.ink },
  kvLabelStrong: { fontWeight: '700' },
  kvValue: { fontSize: 15, lineHeight: 21, fontWeight: '700', color: palette.ink, fontVariant: ['tabular-nums'] },
  kvValueStrong: { fontSize: 18, lineHeight: 23, fontWeight: '800', letterSpacing: -0.3 },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: palette.raisedHigh, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
});
