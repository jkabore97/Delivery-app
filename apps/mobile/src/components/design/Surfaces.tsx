import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { formatFcfa } from '../../lib/format';
import { colors, dark, SHEET_RADIUS, spacing, typeScale } from '../../theme';
import { MapIconButton } from './Pill';
import type { Surface } from './RoundButton';

/**
 * Surface de feuille du bas (coins supérieurs de 24 px), sombre par défaut, avec poignée facultative. Pour une feuille
 * posée sur une carte plein écran avec caméra et « Recentrer », préférer `LiveTrackingLayout sheetTheme="dark"`.
 */
export function SheetSurface({
  children,
  theme = 'dark',
  handle = false,
  style,
  onLayout,
  testID,
}: {
  children: ReactNode;
  theme?: Surface;
  handle?: boolean;
  style?: StyleProp<ViewStyle>;
  onLayout?: (e: LayoutChangeEvent) => void;
  testID?: string;
}) {
  const darkTheme = theme === 'dark';
  return (
    <View style={[styles.sheet, darkTheme ? styles.sheetDark : styles.sheetLight, style]} onLayout={onLayout} testID={testID}>
      {handle ? <View style={[styles.handle, { backgroundColor: darkTheme ? dark.border : '#D5DBE1' }]} /> : null}
      {children}
    </View>
  );
}

/**
 * Écran plein sur fond sombre (zone sûre, défilement, bloc d'action fixé en bas). `header` : barre du haut, par
 * exemple `<DarkHeader title=… onBack=… />`.
 */
export function DarkScreen({
  children,
  header,
  footer,
  scroll = true,
  edges = ['top', 'bottom'],
  contentStyle,
  testID,
}: {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={edges} testID={testID}>
      {header}
      {scroll ? (
        <ScrollView contentContainerStyle={[styles.content, contentStyle]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, contentStyle]}>{children}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

/** Barre du haut d'un écran sombre : retour (facultatif), titre très gras, sous-titre discret. */
export function DarkHeader({ title, subtitle, onBack, right }: { title: string; subtitle?: string | null; onBack?: () => void; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      {onBack ? <MapIconButton icon="back" onPress={onBack} accessibilityLabel="Retour" theme="dark" /> : null}
      <View style={styles.flex}>
        <Text style={styles.headerTitle} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** Tons des montants : amber = espèces à encaisser, green = gain, text = neutre. */
export type AmountTone = 'amber' | 'green' | 'text';

function amountColor(tone: AmountTone, theme: Surface): string {
  if (theme === 'dark') return tone === 'amber' ? dark.amber : tone === 'green' ? dark.green : dark.text;
  return tone === 'amber' ? '#9A4F00' : tone === 'green' ? colors.green : colors.text;
}

/**
 * Ligne de montant : libellé (et détail) à gauche, montant en chiffres tabulaires à droite ; `hero` : montant en
 * très grand sous le libellé (ex. « Encaissez 16 500 FCFA » avant le code). Comme AmountBox, l'élément du montant
 * porte le testID `<testID>-value` (vérifications exactes des montants dans les tests de bout en bout).
 */
export function AmountRow({
  label,
  amount,
  detail,
  tone = 'amber',
  theme = 'dark',
  hero = false,
  testID,
}: {
  label: string;
  amount: number;
  detail?: string | null;
  tone?: AmountTone;
  theme?: Surface;
  hero?: boolean;
  testID?: string;
}) {
  const color = amountColor(tone, theme);
  const darkTheme = theme === 'dark';
  const soft = tone === 'amber' ? (darkTheme ? dark.amberSoft : colors.orangeLight) : tone === 'green' ? (darkTheme ? dark.greenSoft : colors.greenLight) : darkTheme ? dark.raised : colors.background;
  const value = (
    <Text style={[hero ? styles.amountHero : styles.amountValue, { color }]} testID={testID ? `${testID}-value` : undefined} numberOfLines={1} adjustsFontSizeToFit>
      {formatFcfa(amount)}
    </Text>
  );
  return (
    <View style={[styles.amount, { backgroundColor: soft }, hero && styles.amountHeroBox]} testID={testID}>
      {hero ? (
        <>
          <Text style={[styles.amountLabel, { color: darkTheme ? dark.text : colors.text }]}>{label}</Text>
          {value}
          {detail ? <Text style={[styles.amountDetail, { color: darkTheme ? dark.textMuted : colors.textMuted }]}>{detail}</Text> : null}
        </>
      ) : (
        <>
          <View style={styles.flex}>
            <Text style={[styles.amountLabel, { color: darkTheme ? dark.text : colors.text }]}>{label}</Text>
            {detail ? <Text style={[styles.amountDetail, { color: darkTheme ? dark.textMuted : colors.textMuted }]}>{detail}</Text> : null}
          </View>
          {value}
        </>
      )}
    </View>
  );
}

/** Barre de progression fine sur fond sombre (plafond d'espèces…) ; `value` de 0 à 1. */
export function DarkProgress({ value, color = dark.amber }: { value: number; color?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0)) * 100);
  return (
    <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sheet: { borderTopLeftRadius: SHEET_RADIUS, borderTopRightRadius: SHEET_RADIUS, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  sheetDark: {
    backgroundColor: dark.surface,
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  sheetLight: {
    backgroundColor: colors.white,
    shadowColor: '#0F2E22',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: spacing.sm },
  screen: { flex: 1, backgroundColor: dark.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    backgroundColor: dark.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: dark.border,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  headerTitle: { ...typeScale.subtitle, color: dark.text, fontWeight: '900' },
  headerSubtitle: { fontSize: 13, color: dark.textMuted, fontWeight: '600' },
  amount: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: 16, padding: spacing.md },
  amountHeroBox: { flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: spacing.lg },
  amountLabel: { fontSize: 14, fontWeight: '800' },
  amountDetail: { fontSize: 12.5, fontWeight: '600', lineHeight: 17 },
  amountValue: { fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -0.2 },
  amountHero: { fontSize: 40, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -0.8 },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
