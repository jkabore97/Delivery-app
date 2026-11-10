import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Text } from '../Text';
import { FitAmount } from '../design/FitAmount';
import { Icon, type IconName } from '../design/Icon';
import { formatFcfa } from '../../lib/format';
import { cashRatio } from '../../lib/driverStatus';
import { palette, radii, shadows, spacing } from '../../theme';

/*
 * Briques Cobalt de l'espace livreur (docs/DESIGN.md) : pastille ronde à pictogramme (les montants en grands chiffres
 * sont des `FitAmount`, components/design/FitAmount.tsx : jamais coupés), jauge des espèces détenues (soleil), étiquette d'état à pictogramme, tuile chiffrée, liste en
 * carte blanche à filets. Le livreur travaille dehors, en plein soleil : grands chiffres tabulaires, texte encre,
 * contrastes de 4,5:1 au moins (mesurés dans le système de design).
 */

/** Tons des pastilles et étiquettes : fond teinté, pictogramme / texte assorti (4,6:1 au moins). */
export type KitTone = 'cobalt' | 'sun' | 'mint' | 'coral' | 'ink' | 'raised' | 'white';

const TONES: Record<KitTone, { bg: string; fg: string }> = {
  cobalt: { bg: palette.cobaltTint, fg: palette.cobaltText },
  sun: { bg: palette.sunTint, fg: palette.sunText },
  mint: { bg: palette.mintTint, fg: palette.mintText },
  coral: { bg: palette.coralTint, fg: palette.coralText },
  ink: { bg: palette.ink, fg: palette.white },
  raised: { bg: palette.raised, fg: palette.ink },
  white: { bg: palette.white, fg: palette.cobalt },
};

/** Pastille ronde à pictogramme (tuiles chiffrées, lignes de liste, en-têtes de carte). Décorative. */
export function IconDisc({ icon, tone = 'cobalt', size = 40, style }: { icon: IconName; tone?: KitTone; size?: number; style?: StyleProp<ViewStyle> }) {
  const t = TONES[tone];
  return (
    <View
      style={[styles.disc, { width: size, height: size, borderRadius: size / 2, backgroundColor: t.bg }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={t.fg} strokeWidth={2.3} />
    </View>
  );
}

/** Part de la ligne qu'un montant peut prendre à côté de son libellé (le libellé garde le reste). */
const LINE_AMOUNT_SHARE = 0.6;

/**
 * Ligne libellé / montant (récapitulatifs : gain de la course, gains du jour, espèces encaissées) : le libellé à gauche
 * (il passe à la ligne au besoin), le montant à droite en `FitAmount`, dans au plus 60 % de la ligne MESURÉE : il
 * rapetisse pour tenir, puis « FCFA » passe à la ligne, jamais coupé ni « … ». `pill` : le montant dans une pilule
 * soleil (espèces). Le montant porte `testID` (texte : `formatFcfa`), la ligne `<testID>-line`.
 */
export function AmountLine({
  label,
  amount,
  size = 18,
  color = palette.ink,
  sign,
  pill = false,
  labelStyle,
  style,
  testID,
}: {
  label: string;
  amount: number;
  size?: number;
  color?: string;
  sign?: '+' | '−';
  pill?: boolean;
  labelStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const [row, setRow] = useState<number | null>(null);
  const width = row === null ? null : Math.max(48, Math.floor((row - spacing.sm) * LINE_AMOUNT_SHARE) - (pill ? 2 * PILL_PAD : 0));
  const figure = <FitAmount amount={amount} size={size} color={color} sign={sign} align="end" width={width ?? MAX_LINE} testID={testID} />;
  return (
    <View
      style={[styles.line, style]}
      testID={testID ? `${testID}-line` : undefined}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w > 0 && w !== row) setRow(w);
      }}
    >
      <Text style={[styles.lineLabel, labelStyle]}>{label}</Text>
      {pill ? <View style={styles.linePill}>{figure}</View> : figure}
    </View>
  );
}

/** Marge intérieure de la pilule soleil d'une `AmountLine`. */
const PILL_PAD = 12;
/** Avant la mesure de la ligne : aucune contrainte (taille maximale). */
const MAX_LINE = 10_000;

/**
 * Barre de progression épaisse (10 px) : dossier (cobalt sur gris), espèces (ambre foncé sur piste soleil pâle, 5,35:1,
 * lisible en plein soleil), plafond atteint (rouge).
 */
export function Meter({
  value,
  color = palette.sun,
  track = palette.raisedHigh,
  height = 10,
  label,
}: {
  value: number;
  color?: string;
  track?: string;
  height?: number;
  label?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0)) * 100);
  return (
    <View
      style={[styles.meterTrack, { height, borderRadius: height / 2, backgroundColor: track }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <View style={[styles.meterFill, { width: `${pct}%`, borderRadius: height / 2, backgroundColor: color }]} />
    </View>
  );
}

/**
 * Espèces détenues / plafond : libellé et montant détenu sur une ligne (le montant passe entier à la ligne suivante sur
 * un écran étroit ou une grande police, jamais coupé), jauge ambre sur piste soleil pâle (rouge plein quand le plafond est atteint), puis le
 * plafond et la légende. `cash-held` : testID du montant détenu ; `<testID>-limit` : la ligne du plafond.
 */
export function CashMeter({
  held,
  limit,
  blocked,
  label = 'Espèces détenues',
  caption,
  testID = 'cash-held',
}: {
  held: number;
  limit: number;
  blocked?: boolean;
  label?: string;
  /** Suite de la ligne du plafond (« à déposer auprès de Yaar »). */
  caption?: string | null;
  testID?: string;
}) {
  const ratio = cashRatio(held, limit);
  const over = !!blocked || (limit > 0 && held >= limit);
  return (
    <View style={styles.cash}>
      <View style={styles.cashRow}>
        <Text style={styles.cashLabel}>{label}</Text>
        <Text style={[styles.cashValue, over && styles.cashValueAlert]} testID={testID} numberOfLines={1}>
          {formatFcfa(held)}
        </Text>
      </View>
      <Meter
        value={ratio}
        color={over ? palette.coralFill : palette.amberText}
        track={over ? palette.coralTint : palette.sunTint}
        label={`${label} : ${Math.round(ratio * 100)} % du plafond`}
      />
      <Text style={[styles.caption, over && styles.captionAlert]} testID={`${testID}-limit`}>
        <Text style={styles.captionStrong}>{`Plafond ${formatFcfa(limit)}`}</Text>
        {caption ? ` · ${caption}` : ''}
      </Text>
    </View>
  );
}

/** Date et heure courtes d'une liste (« 09/11 · 21:42 ») ; l'année seulement si ce n'est pas l'année en cours. */
export function shortDateTime(iso: string, now: number = Date.now()): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const year = d.getUTCFullYear() !== new Date(now).getUTCFullYear() ? `/${d.getUTCFullYear()}` : '';
  return `${dd}/${mo}${year} · ${hh}:${mi}`;
}

/** Étiquette d'état en pilule (28 px, 13/700) avec pictogramme : « Reçue » (coche), « Expirée »… */
export function TagChip({ label, tone = 'raised', icon, testID }: { label: string; tone?: KitTone; icon?: IconName; testID?: string }) {
  const t = tone === 'raised' ? { bg: palette.raised, fg: palette.inkMuted } : TONES[tone];
  return (
    <View style={[styles.tag, { backgroundColor: t.bg }]} testID={testID}>
      {icon ? <Icon name={icon} size={14} color={t.fg} strokeWidth={2.8} /> : null}
      <Text style={[styles.tagText, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Carte blanche Cobalt (rayon 24, ombre douce, sans bordure) à poser sur le fond canvas. */
export function WhiteCard({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <View style={[styles.card, shadows.tile, style]} testID={testID}>
      {children}
    </View>
  );
}

/** Part de la ligne d'une liste que peut prendre son montant à droite. */
const ROW_AMOUNT_SHARE = 0.4;

/**
 * Ligne d'une liste en carte blanche : pastille, titre et sous-titre, valeur à droite ; filet au-dessus sauf la première.
 * `amount` : montant à droite (17/800, `FitAmount` dans au plus 40 % de la ligne mesurée : jamais coupé).
 */
export function ListRow({
  leading,
  title,
  subtitle,
  right,
  amount,
  rightSub,
  first,
  testID,
}: {
  leading?: ReactNode;
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
  amount?: { value: number; sign?: '+' | '−'; color?: string } | null;
  rightSub?: string | null;
  first?: boolean;
  testID?: string;
}) {
  const [row, setRow] = useState<number | null>(null);
  return (
    <View
      style={[styles.row, !first && styles.rowRule]}
      testID={testID}
      onLayout={
        amount
          ? (e) => {
              const w = Math.round(e.nativeEvent.layout.width);
              if (w > 0 && w !== row) setRow(w);
            }
          : undefined
      }
    >
      {leading}
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
      </View>
      {right || amount || rightSub ? (
        <View style={[styles.rowEnd, amount && row !== null ? { maxWidth: Math.floor(row * ROW_AMOUNT_SHARE) } : null]}>
          {amount ? (
            <FitAmount
              amount={amount.value}
              sign={amount.sign}
              size={17}
              color={amount.color ?? palette.ink}
              align="end"
              width={row === null ? MAX_LINE : Math.floor(row * ROW_AMOUNT_SHARE)}
            />
          ) : typeof right === 'string' ? (
            <Text style={styles.rowValue}>{right}</Text>
          ) : (
            right
          )}
          {rightSub ? <Text style={styles.rowSub}>{rightSub}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

/** Titre d'écran (display 30/800) et sa ligne d'explication. */
export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string | null }) {
  return (
    <View style={styles.titleBlock}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text style={styles.titleSub}>{subtitle}</Text> : null}
    </View>
  );
}

/** Titre de section (20/800, en minuscules). */
export function SectionHeading({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.section} accessibilityRole="header" aria-level={2}>
        {children}
      </Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  lineLabel: { flexShrink: 1, fontSize: 15, lineHeight: 20, fontWeight: '700', color: palette.ink },
  linePill: { minHeight: 36, paddingHorizontal: PILL_PAD, borderRadius: 18, justifyContent: 'center', backgroundColor: palette.sun },
  meterTrack: { overflow: 'hidden', alignSelf: 'stretch' },
  meterFill: { height: '100%' },
  cash: { gap: 10 },
  // Libellé et montant sur une ligne ; sur un écran étroit, le montant passe entier à la ligne suivante.
  cashRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: spacing.sm, rowGap: 2 },
  cashLabel: { flexShrink: 0, fontSize: 15, lineHeight: 20, fontWeight: '700', color: palette.ink },
  cashValue: { flexShrink: 0, fontSize: 18, lineHeight: 23, fontWeight: '800', color: palette.ink, fontVariant: ['tabular-nums'], letterSpacing: -0.3 },
  cashValueAlert: { color: palette.coralText },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: palette.inkMuted, fontVariant: ['tabular-nums'] },
  captionStrong: { fontWeight: '700' },
  captionAlert: { color: palette.coralText },
  tag: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, minHeight: 28, borderRadius: 14, paddingHorizontal: 11 },
  tagText: { fontSize: 13, lineHeight: 17, fontWeight: '700' },
  card: { backgroundColor: palette.card, borderRadius: radii.card, padding: 20, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14 },
  rowRule: { borderTopWidth: 1, borderTopColor: palette.line },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: palette.ink },
  rowSub: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: palette.inkMuted, fontVariant: ['tabular-nums'] },
  rowEnd: { alignItems: 'flex-end', gap: 2, flexShrink: 0 },
  rowValue: { fontSize: 16, lineHeight: 21, fontWeight: '800', color: palette.ink, fontVariant: ['tabular-nums'] },
  titleBlock: { gap: 4, paddingTop: spacing.sm },
  title: { fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -0.9, color: palette.ink },
  titleSub: { fontSize: 15, lineHeight: 21, fontWeight: '500', color: palette.inkMuted },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.sm },
  section: { fontSize: 20, lineHeight: 26, fontWeight: '800', letterSpacing: -0.3, color: palette.ink },
});
