import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { Text } from '../Text';
import { palette, SHEET_RADIUS, shadows, spacing, typography } from '../../theme';
import { MapIconButton } from './Pill';
import { FitAmount } from './FitAmount';
import { useTabBarInset } from './tabBarInset';

/**
 * Feuille du bas Cobalt : blanche, coins supérieurs de 32 px, ombre de feuille, poignée facultative (40 × 5). Pour une
 * feuille posée sur une carte plein écran avec caméra et « Recentrer », préférer `LiveTrackingLayout`.
 */
export function SheetSurface({
  children,
  handle = false,
  style,
  onLayout,
  testID,
}: {
  children: ReactNode;
  handle?: boolean;
  style?: StyleProp<ViewStyle>;
  onLayout?: (e: LayoutChangeEvent) => void;
  testID?: string;
}) {
  return (
    <View style={[styles.sheet, shadows.sheet, style]} onLayout={onLayout} testID={testID}>
      {handle ? <View style={styles.handle} /> : null}
      {children}
    </View>
  );
}

/**
 * Écran plein Cobalt (fond canvas, zone sûre, défilement, bloc d'action fixé en bas sur fond blanc). `header` : barre
 * du haut, ex. `<ScreenHeader title=… onBack=… />`. Au-dessus de la barre d'onglets flottante, le contenu garde la
 * place de la barre.
 */
export function SurfaceScreen({
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
  const tabInset = useTabBarInset();
  return (
    <SafeAreaView style={styles.screen} edges={edges} testID={testID}>
      {header}
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, tabInset ? { paddingBottom: tabInset + spacing.lg } : null, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, tabInset ? { paddingBottom: tabInset } : null, contentStyle]}>{children}</View>
      )}
      {footer ? <View style={[styles.footer, shadows.sheet]}>{footer}</View> : null}
    </SafeAreaView>
  );
}

/** Barre du haut d'un écran : retour (disque blanc), titre 20/800, sous-titre discret. */
export function ScreenHeader({ title, subtitle, onBack, right }: { title: string; subtitle?: string | null; onBack?: () => void; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      {onBack ? <MapIconButton icon="back" onPress={onBack} accessibilityLabel="Retour" /> : null}
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

/**
 * Tons des montants : amber = espèces à encaisser (tuile SOLEIL, texte encre), green = gain (mint), text = neutre.
 */
export type AmountTone = 'amber' | 'green' | 'text';

// `figure` (et non `value`) : le plugin Babel de Reanimated prendrait `x.value` dans un style pour une valeur animée.
const AMOUNT_TONES: Record<AmountTone, { bg: string; label: string; detail: string; figure: string }> = {
  amber: { bg: palette.sun, label: palette.ink, detail: palette.onSun2, figure: palette.ink },
  green: { bg: palette.mintTint, label: palette.ink, detail: palette.mintText, figure: palette.mintText },
  text: { bg: palette.raised, label: palette.ink, detail: palette.inkMuted, figure: palette.ink },
};

/** Part de la ligne qu'un montant peut prendre à côté de son libellé (le libellé garde le reste, 40 % au moins). */
const ROW_AMOUNT_SHARE = 0.6;

/**
 * Ligne de montant : libellé (et détail) à gauche, montant en chiffres tabulaires à droite (« FCFA » plus petit) ;
 * `hero` : montant en très grand sous le libellé (ex. « Encaissez 16 500 FCFA » avant le code). Espèces : tuile soleil,
 * texte encre. Le montant n'est JAMAIS coupé (`FitAmount`) : il rapetisse pour tenir (dans 60 % de la ligne, ou toute
 * la largeur en `hero`), puis « FCFA » passe à la ligne. Comme AmountBox, l'élément du montant porte le testID
 * `<testID>-value` (vérifications exactes des montants : son texte est `formatFcfa`).
 */
export function AmountRow({
  label,
  amount,
  detail,
  tone = 'amber',
  hero = false,
  testID,
}: {
  label: string;
  amount: number;
  detail?: string | null;
  tone?: AmountTone;
  hero?: boolean;
  testID?: string;
}) {
  const t = AMOUNT_TONES[tone];
  const { width: windowWidth } = useWindowDimensions();
  // Largeur intérieure de la ligne (mesurée ; avant la mesure : feuille de téléphone moins les marges).
  const [inner, setInner] = useState<number | null>(null);
  const rowInner = inner ?? Math.min(windowWidth, 440) - 32 - 2 * spacing.lg;
  const value = hero ? (
    <FitAmount amount={amount} size={40} minSize={24} color={t.figure} testID={testID ? `${testID}-value` : undefined} style={styles.amountHeroValue} />
  ) : (
    <FitAmount
      amount={amount}
      size={22}
      unitScale={0.6}
      color={t.figure}
      align="end"
      width={Math.floor((rowInner - spacing.md) * ROW_AMOUNT_SHARE)}
      testID={testID ? `${testID}-value` : undefined}
    />
  );
  return (
    <View
      style={[styles.amount, { backgroundColor: t.bg }, hero && styles.amountHeroBox, tone === 'amber' && shadows.sun]}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width) - 2 * spacing.lg;
        if (w > 0 && w !== inner) setInner(w);
      }}
      testID={testID}
    >
      {hero ? (
        <>
          <Text style={[styles.amountLabel, { color: t.label }]}>{label}</Text>
          {value}
          {detail ? <Text style={[styles.amountDetail, { color: t.detail }]}>{detail}</Text> : null}
        </>
      ) : (
        <>
          <View style={styles.flexText}>
            <Text style={[styles.amountLabel, { color: t.label }]}>{label}</Text>
            {detail ? <Text style={[styles.amountDetail, { color: t.detail }]}>{detail}</Text> : null}
          </View>
          {value}
        </>
      )}
    </View>
  );
}

/** Barre de progression fine (plafond d'espèces…) ; `value` de 0 à 1. Espèces : soleil par défaut. */
export function ProgressTrack({ value, color = palette.sun }: { value: number; color?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0)) * 100);
  return (
    <View style={styles.track} accessibilityRole="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexText: { flex: 1, gap: 2 },
  sheet: {
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: palette.card,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: spacing.sm, backgroundColor: palette.handle },
  screen: { flex: 1, backgroundColor: palette.canvas },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    backgroundColor: palette.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  headerTitle: { ...typography.title, color: palette.ink },
  headerSubtitle: { fontSize: 13, lineHeight: 18, color: palette.inkMuted, fontWeight: '600' },
  amount: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: 20, paddingVertical: 14, paddingHorizontal: spacing.lg },
  amountHeroBox: { flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: 20, borderRadius: 24 },
  amountLabel: { fontSize: 14, lineHeight: 19, fontWeight: '700' },
  amountDetail: { fontSize: 12.5, lineHeight: 17, fontWeight: '600' },
  amountHeroValue: { alignSelf: 'stretch' },
  track: { height: 8, borderRadius: 4, backgroundColor: palette.raisedHigh, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
