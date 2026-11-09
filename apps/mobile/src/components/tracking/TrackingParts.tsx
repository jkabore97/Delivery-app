import type { ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { arrivalClockFr, formatDurationFr, LABELS, type VehicleType } from '@yaar/shared';
import { formatFcfa } from '../../lib/format';
import { telUrl, whatsappUrl } from '../../lib/tel';
import type { Headline, TrackingStep } from '../../lib/trackingSteps';
import { MAP_COLORS } from '../../lib/map/style';
import { colors, dark, radius, spacing } from '../../theme';
import { ArtView } from '../map/MarkerViews';
import { vehicleSideGlyph } from '../map/markerArt';
import { TrackingIcon, type IconName } from './TrackingIcon';

/**
 * Éléments des feuilles de suivi (page publique du destinataire, suivi d'une livraison par l'entreprise), en thème
 * clair ou sombre (`theme`). Ce fichier n'importe PAS le système de design (react-native-svg) : la page publique,
 * ouverte depuis un SMS en 3G, reste légère ; ses pictogrammes passent par `TrackingIcon` (SVG du navigateur sur le
 * web). Mêmes tailles et mêmes couleurs que le système de design (`dark` de theme.ts, boutons ronds de 48 à 64 px).
 */
export type TrackingTheme = 'light' | 'dark';

interface Palette {
  text: string;
  muted: string;
  faint: string;
  /** Action principale, étape en cours, code. */
  accent: string;
  /** Texte posé sur `accent`. */
  accentInk: string;
  /** Cartes posées dans la feuille. */
  card: string;
  border: string;
  stepTodo: string;
  codeBg: string;
  amountBg: string;
  amountText: string;
  discBg: string;
  discFg: string;
  discBorder: string;
  star: string;
  danger: string;
  dangerSoft: string;
  successSoft: string;
  warning: string;
}

export const TRACKING_PALETTES: Record<TrackingTheme, Palette> = {
  light: {
    text: colors.text,
    muted: colors.textMuted,
    faint: colors.textMuted,
    accent: colors.green,
    accentInk: colors.white,
    card: '#F7F9FA',
    border: colors.border,
    stepTodo: colors.border,
    codeBg: colors.greenLight,
    amountBg: colors.orangeLight,
    amountText: '#9A4F00',
    discBg: colors.white,
    discFg: colors.text,
    discBorder: colors.border,
    star: '#B4610A',
    danger: colors.red,
    dangerSoft: colors.redLight,
    successSoft: colors.greenLight,
    warning: '#9A4F00',
  },
  dark: {
    text: dark.text,
    muted: dark.textMuted,
    faint: dark.textFaint,
    accent: dark.green,
    accentInk: dark.greenInk,
    card: dark.raised,
    border: dark.border,
    stepTodo: dark.raisedHigh,
    codeBg: dark.greenSoft,
    amountBg: dark.amberSoft,
    amountText: dark.amber,
    discBg: dark.raised,
    discFg: dark.text,
    discBorder: dark.border,
    star: dark.amber,
    danger: dark.red,
    dangerSoft: dark.redSoft,
    successSoft: dark.greenSoft,
    warning: dark.amber,
  },
};

/** Ouvre un lien (appel, WhatsApp) sans jamais lever d'erreur (application absente : rien ne se passe). */
export function openLink(url: string): void {
  try {
    void Promise.resolve(Linking.openURL(url)).catch(() => undefined);
  } catch {
    /* lien refusé par la plateforme */
  }
}

/**
 * Titre de la feuille : grande heure d'arrivée pendant la course (« Arrivée vers 14:32 » et « dans 12 min » en
 * pastille), sinon l'état de la livraison. `label` : « Arrivée vers » (livraison) ou « Au retrait vers » (entreprise,
 * livreur en route vers elle) ; `secondary` : seconde estimation plus discrète (heure de livraison pendant le retrait).
 */
export function ArrivalHeadline({
  etaMinutes,
  headline,
  label = 'Arrivée vers',
  imminentLabel = 'Arrivée imminente',
  secondary,
  now = Date.now(),
  theme = 'light',
  testID = 'tracking-headline',
}: {
  etaMinutes: number | null;
  headline: Headline;
  label?: string;
  imminentLabel?: string;
  secondary?: string | null;
  now?: number;
  theme?: TrackingTheme;
  testID?: string;
}) {
  const p = TRACKING_PALETTES[theme];
  const big = theme === 'dark';
  const imminent = etaMinutes !== null && (!Number.isFinite(etaMinutes) || etaMinutes < 1);
  const clock = etaMinutes !== null && !imminent ? arrivalClockFr(Math.round(etaMinutes), now) : null;
  const eta = etaMinutes === null ? null : imminent ? imminentLabel : `${label} ${clock} · dans ${formatDurationFr(etaMinutes)}`;
  return (
    <View style={{ gap: 3 }} testID={testID}>
      {eta ? (
        <>
          {/* « Arrivée vers 14:32 · dans 12 min » : heure en grand, délai en pastille. */}
          <View style={styles.etaRow} accessible accessibilityRole="header" accessibilityLabel={eta}>
            <Text style={[styles.eta, big && styles.etaBig, { color: p.text }]}>{imminent ? imminentLabel : `${label} ${clock}`}</Text>
            {!imminent ? (
              <View style={[styles.etaPill, { backgroundColor: p.accent }]}>
                <Text style={[styles.etaPillText, { color: p.accentInk }]}>dans {formatDurationFr(etaMinutes!)}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.headlineSmall, { color: p.accent }]}>{headline.title}</Text>
          {secondary ? (
            <Text style={[styles.secondary, { color: p.text }]} testID="eta-secondary">
              {secondary}
            </Text>
          ) : null}
          {headline.subtitle ? <Text style={[styles.muted, { color: p.muted }]}>{headline.subtitle}</Text> : null}
        </>
      ) : (
        <>
          <Text style={[styles.title, big && styles.titleBig, { color: p.text }]} accessibilityRole="header">
            {headline.title}
          </Text>
          {headline.subtitle ? <Text style={[styles.muted, { color: p.muted }]}>{headline.subtitle}</Text> : null}
        </>
      )}
    </View>
  );
}

/** Progression en 4 étapes (barres + libellés). */
export function StepsProgress({ steps, color, theme = 'light' }: { steps: TrackingStep[]; color?: string; theme?: TrackingTheme }) {
  const p = TRACKING_PALETTES[theme];
  const c = color ?? p.accent;
  return (
    <View style={styles.steps} accessibilityRole="progressbar" testID="tracking-steps">
      {steps.map((s) => (
        <View key={s.key} style={styles.step}>
          <View
            style={[
              styles.stepBar,
              { backgroundColor: p.stepTodo },
              s.state === 'done' && { backgroundColor: c },
              s.state === 'current' && { backgroundColor: c, opacity: 0.5 },
            ]}
          />
          <Text
            style={[
              styles.stepLabel,
              { color: p.faint },
              s.state === 'done' && { color: p.text },
              s.state === 'current' && { color: c, fontWeight: '900' },
            ]}
            numberOfLines={1}
          >
            {s.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const ROUND_TONES: Record<TrackingTheme, Record<'primary' | 'neutral' | 'danger', { bg: string; fg: string; border: string }>> = {
  dark: {
    primary: { bg: dark.green, fg: dark.greenInk, border: dark.green },
    neutral: { bg: dark.raised, fg: dark.text, border: dark.border },
    danger: { bg: dark.redFill, fg: '#FFFFFF', border: dark.redFill },
  },
  light: {
    primary: { bg: colors.green, fg: '#FFFFFF', border: colors.green },
    neutral: { bg: '#FFFFFF', fg: colors.text, border: colors.border },
    danger: { bg: colors.red, fg: '#FFFFFF', border: colors.red },
  },
};

/**
 * Bouton rond (disque + pictogramme, libellé dessous) : même dessin que `RoundButton` du système de design, sans
 * react-native-svg (page publique). Zone tactile de 56 px au moins.
 */
export function TrackingRoundButton({
  label,
  icon,
  onPress,
  size = 52,
  tone = 'neutral',
  theme = 'light',
  showLabel = true,
  disabled,
  accessibilityLabel,
  testID,
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
  size?: number;
  tone?: 'primary' | 'neutral' | 'danger';
  theme?: TrackingTheme;
  showLabel?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const t = ROUND_TONES[theme][tone];
  const pad = Math.max(0, Math.ceil((56 - size) / 2));
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={pad ? { top: pad, bottom: pad, left: pad, right: pad } : undefined}
      style={styles.roundColumn}
      testID={testID}
    >
      {({ pressed }) => (
        <>
          <View
            style={[
              styles.roundDisc,
              { width: size, height: size, borderRadius: size / 2, backgroundColor: t.bg, borderColor: t.border },
              disabled && styles.inactive,
              pressed && !disabled && styles.pressed,
            ]}
          >
            <TrackingIcon name={icon} size={Math.round(size * 0.42)} color={t.fg} strokeWidth={2.4} />
          </View>
          {showLabel ? (
            <Text style={[styles.roundLabel, { color: theme === 'dark' ? dark.text : colors.text }, disabled && styles.inactive]} numberOfLines={1}>
              {label}
            </Text>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

/** Grand disque d'état (livrée, annulée, lien expiré…) en tête de feuille ou de carte. */
export function StateDisc({ icon, tone, theme = 'light', size = 56 }: { icon: IconName; tone: 'success' | 'danger' | 'neutral'; theme?: TrackingTheme; size?: number }) {
  const p = TRACKING_PALETTES[theme];
  const bg = tone === 'success' ? p.successSoft : tone === 'danger' ? p.dangerSoft : p.card;
  const fg = tone === 'success' ? p.accent : tone === 'danger' ? p.danger : p.muted;
  return (
    <View style={[styles.stateDisc, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <TrackingIcon name={icon} size={Math.round(size * 0.5)} color={fg} strokeWidth={2.6} />
    </View>
  );
}

/** Disque vert du livreur avec son véhicule de profil : le même dessin que son marqueur sur la carte. */
export function DriverAvatar({ vehicleType, size = 48 }: { vehicleType: VehicleType; size?: number }) {
  return (
    <View style={[styles.driverAvatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <ArtView rects={vehicleSideGlyph(vehicleType)} size={Math.round(size * 0.58)} />
    </View>
  );
}

/**
 * Livreur : prénom, note, véhicule et immatriculation, identité vérifiée ; boutons ronds « Appeler » et « WhatsApp »
 * (message prérempli `whatsappText`) quand son numéro est fourni.
 */
export function DriverCard({
  name,
  vehicleType,
  plate,
  ratingAvg,
  phone,
  whatsappText,
  theme = 'light',
}: {
  name: string | null;
  vehicleType: VehicleType;
  plate: string | null;
  ratingAvg: number | null;
  /** Numéro du livreur : boutons « Appeler » (testID call-driver) et « WhatsApp » (whatsapp-driver). */
  phone?: string | null;
  whatsappText?: string | null;
  theme?: TrackingTheme;
}) {
  const p = TRACKING_PALETTES[theme];
  return (
    <View style={[styles.driverCard, { backgroundColor: p.card, borderColor: p.border }]} testID="driver-card">
      <View style={styles.driverRow}>
        <DriverAvatar vehicleType={vehicleType} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.cardTitle, { color: p.text }]} numberOfLines={1}>
            {name ?? 'Votre livreur'}
            {ratingAvg !== null ? <Text style={[styles.rating, { color: p.star }]}>{`  ★ ${ratingAvg.toFixed(1).replace('.', ',')}`}</Text> : null}
          </Text>
          <Text style={[styles.muted, { color: p.muted }]} numberOfLines={1}>
            {LABELS.vehicleType[vehicleType]}
            {plate ? ` · ${plate}` : ''}
          </Text>
          <View style={styles.verifiedRow}>
            <TrackingIcon name="check" size={13} color={p.accent} strokeWidth={3} />
            <Text style={[styles.verified, { color: p.accent }]} numberOfLines={1}>
              Identité vérifiée par Yaar
            </Text>
          </View>
        </View>
      </View>
      {phone ? (
        <View style={[styles.contacts, { borderTopColor: p.border }]}>
          <TrackingRoundButton
            label="Appeler"
            icon="phone"
            theme={theme}
            size={52}
            onPress={() => openLink(telUrl(phone))}
            accessibilityLabel={`Appeler ${name ?? 'le livreur'} (${phone})`}
            testID="call-driver"
          />
          <TrackingRoundButton
            label="WhatsApp"
            icon="chat"
            theme={theme}
            size={52}
            onPress={() => openLink(whatsappUrl(phone, whatsappText))}
            accessibilityLabel={`Écrire à ${name ?? 'votre livreur'} sur WhatsApp`}
            testID="whatsapp-driver"
          />
        </View>
      ) : null}
    </View>
  );
}

/** Code de livraison en grand (destinataire uniquement). */
export function DeliveryCodeChip({ code, theme = 'light' }: { code: string; theme?: TrackingTheme }) {
  const p = TRACKING_PALETTES[theme];
  const spaced = code.split('').join(' ');
  return (
    <View
      style={[styles.code, { backgroundColor: p.codeBg, borderColor: p.accent }]}
      accessibilityLabel={`Code de livraison ${spaced}`}
      testID="delivery-code"
    >
      <Text style={[styles.codeLabel, { color: p.accent }]}>Donnez ce code au livreur</Text>
      <Text style={[styles.codeDigits, theme === 'dark' && styles.codeDigitsBig, { color: p.accent }]}>{code.split('').join('  ')}</Text>
      <Text style={[styles.codeHint, { color: p.muted }]}>Seulement quand vous avez le colis en main.</Text>
    </View>
  );
}

/** Montant à payer / à encaisser ; l'élément du montant porte le testID `<testID>-value` (vérifications exactes). */
export function AmountBox({
  label,
  amount,
  detail,
  tone = 'amber',
  theme = 'light',
  testID,
}: {
  label: string;
  amount: number;
  detail?: string | null;
  /** amber = espèces à payer / encaisser ; green = reversé à l'entreprise. */
  tone?: 'amber' | 'green';
  theme?: TrackingTheme;
  testID?: string;
}) {
  const p = TRACKING_PALETTES[theme];
  const green = tone === 'green';
  const fg = green ? p.accent : p.amountText;
  const bg = green ? p.successSoft : p.amountBg;
  return (
    <View style={[styles.amount, { backgroundColor: bg }]} testID={testID}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.amountLabel, { color: theme === 'dark' ? p.text : fg }]}>{label}</Text>
        {detail ? <Text style={[styles.amountDetail, { color: theme === 'dark' ? p.muted : fg }]}>{detail}</Text> : null}
      </View>
      <Text style={[styles.amountValue, { color: fg }]} testID={testID ? `${testID}-value` : undefined}>
        {formatFcfa(amount)}
      </Text>
    </View>
  );
}

/** Ligne d'information avec pictogramme (adresse, expéditeur, colis…). */
export function InfoRow({
  icon,
  title,
  subtitle,
  right,
  theme = 'light',
  testID,
}: {
  icon: IconName;
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
  theme?: TrackingTheme;
  testID?: string;
}) {
  const p = TRACKING_PALETTES[theme];
  return (
    <View style={styles.info} testID={testID}>
      <View style={styles.infoIcon}>
        <TrackingIcon name={icon} size={20} color={p.muted} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[styles.infoTitle, { color: p.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.muted, { color: p.muted }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** Bloc (carte) qui regroupe des lignes d'information. */
export function InfoBlock({ children, theme = 'light', testID }: { children: ReactNode; theme?: TrackingTheme; testID?: string }) {
  const p = TRACKING_PALETTES[theme];
  return (
    <View style={[styles.block, { backgroundColor: theme === 'dark' ? p.card : colors.white, borderColor: p.border }]} testID={testID}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  etaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: spacing.sm, rowGap: 4 },
  eta: { fontSize: 24, fontWeight: '900', letterSpacing: -0.4 },
  etaBig: { fontSize: 30, letterSpacing: -0.6 },
  etaPill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  etaPillText: { fontWeight: '900', fontSize: 14, fontVariant: ['tabular-nums'] },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.3 },
  titleBig: { fontSize: 26, letterSpacing: -0.5 },
  headlineSmall: { fontSize: 16, fontWeight: '800' },
  secondary: { fontSize: 14, fontWeight: '700' },
  muted: { fontSize: 13.5, lineHeight: 19 },
  steps: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, gap: 6 },
  stepBar: { height: 6, borderRadius: 3 },
  stepLabel: { fontSize: 12, lineHeight: 15, fontWeight: '700' },
  roundColumn: { alignItems: 'center', gap: 6 },
  roundDisc: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  roundLabel: { fontSize: 12.5, fontWeight: '800' },
  inactive: { opacity: 0.45 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  stateDisc: { alignItems: 'center', justifyContent: 'center' },
  driverAvatar: {
    backgroundColor: MAP_COLORS.driver,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 17, fontWeight: '900', letterSpacing: -0.2 },
  rating: { fontSize: 14, fontWeight: '800' },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verified: { fontSize: 11.5, fontWeight: '800' },
  driverCard: { gap: spacing.md, padding: spacing.md, borderRadius: 18, borderWidth: 1 },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  contacts: { flexDirection: 'row', justifyContent: 'space-evenly', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md },
  code: {
    borderRadius: 18,
    borderWidth: 2,
    borderStyle: 'dashed',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  codeLabel: { fontSize: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  codeDigits: { fontSize: 42, fontWeight: '900', letterSpacing: 2, fontVariant: ['tabular-nums'] },
  codeDigitsBig: { fontSize: 50, lineHeight: 58 },
  codeHint: { fontSize: 12.5 },
  amount: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: 16, padding: spacing.md },
  amountLabel: { fontSize: 14, fontWeight: '800' },
  amountDetail: { fontSize: 12.5, lineHeight: 17, fontWeight: '600' },
  // Chiffres tabulaires : les espaces fines des milliers restent visibles (« 1 000 », pas « 1000 »).
  amountValue: { fontSize: 21, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -0.2 },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  infoIcon: { width: 24, alignItems: 'center', paddingTop: 1 },
  infoTitle: { fontSize: 15, fontWeight: '700' },
  block: { gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
});
