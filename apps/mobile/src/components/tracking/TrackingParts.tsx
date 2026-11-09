import { useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { arrivalClockFr, formatDurationFr, LABELS, type VehicleType } from '@yaar/shared';
import { Text } from '../Text';
import { formatFcfa } from '../../lib/format';
import { telUrl, whatsappUrl } from '../../lib/tel';
import { touchTarget } from '../../lib/touchTarget';
import type { Headline, TrackingStep } from '../../lib/trackingSteps';
import { palette, shadows, spacing } from '../../theme';
import { avatarInitials } from '../map/markerArt';
import { TrackingIcon, type IconName } from './TrackingIcon';

/**
 * Éléments des feuilles de suivi (page publique du destinataire, suivi d'une livraison par l'entreprise), au dessin
 * Cobalt : grands chiffres 800 tabulaires, progression en pilules segmentées, carte du code en cobalt plein, montant en
 * tuile soleil, carte du livreur. Ce fichier n'importe PAS le système de design (react-native-svg) : la page publique,
 * ouverte depuis un SMS en 3G, reste légère ; ses pictogrammes passent par `TrackingIcon` (SVG du navigateur sur le
 * web).
 */
/** @deprecated Cobalt n'a qu'un thème (clair) : 'dark' donne le même rendu. */
export type TrackingTheme = 'light' | 'dark';

interface Palette {
  text: string;
  muted: string;
  faint: string;
  /** Action principale, étape en cours, ligne d'état. */
  accent: string;
  /** Texte posé sur `accent`. */
  accentInk: string;
  /** Cartes posées dans la feuille (fond rempli, sans ombre). */
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

const COBALT_PALETTE: Palette = {
  text: palette.ink,
  muted: palette.inkMuted,
  faint: palette.inkMuted,
  accent: palette.cobalt,
  accentInk: palette.onCobalt,
  card: palette.raised,
  border: palette.line,
  stepTodo: palette.raisedHigh,
  codeBg: palette.cobalt,
  amountBg: palette.sun,
  amountText: palette.ink,
  discBg: palette.white,
  discFg: palette.cobalt,
  discBorder: palette.line,
  star: '#E0A400',
  danger: palette.coralText,
  dangerSoft: palette.coralTint,
  successSoft: palette.mintTint,
  warning: palette.amberText,
};

/** Couleurs des éléments de suivi (les deux entrées sont la palette Cobalt : plus de thème sombre). */
export const TRACKING_PALETTES: Record<TrackingTheme, Palette> = { light: COBALT_PALETTE, dark: COBALT_PALETTE };

/** Ouvre un lien (appel, WhatsApp) sans jamais lever d'erreur (application absente : rien ne se passe). */
export function openLink(url: string): void {
  try {
    void Promise.resolve(Linking.openURL(url)).catch(() => undefined);
  } catch {
    /* lien refusé par la plateforme */
  }
}

/** Largeur du contenu d'une feuille avant sa mesure : téléphone (fenêtre − marges), colonne de 440 px sur un ordinateur. */
const SHEET_CONTENT_GUESS = (windowWidth: number) => Math.min(windowWidth, 440) - 32;

/**
 * Taille d'un texte pour qu'il tienne sur la même ligne que sa pastille (« dans 12 min ») dans `width` px : de `max`
 * à 20 px. Estimation prudente de la largeur des caractères (`charWidth` × la taille ; 0,52 pour un titre très gras,
 * davantage pour des chiffres tabulaires ; pastille : 8,4 px par caractère + 24 px) ; si la police du téléphone est
 * plus large ou agrandie, la pastille passe simplement à la ligne.
 */
export function headlineFontSize(text: string, pill: string | null, width: number, max: number, charWidth = 0.52): number {
  const room = width - (pill ? 24 + pill.length * 8.4 + 8 : 0);
  return Math.max(20, Math.min(max, Math.floor(room / (charWidth * Math.max(1, text.length)))));
}

/** Largeur moyenne des chiffres tabulaires 800 et du « : » de l'heure (part de la taille). */
const CLOCK_CHAR_WIDTH = 0.62;

/**
 * Titre de la feuille : pendant la course, l'heure d'arrivée en très grand (800, chiffres tabulaires) sous son
 * libellé (« Arrivée vers », ou « Au retrait vers » pour l'entreprise pendant le retrait), avec « dans 12 min » en
 * pastille sur la même ligne (l'heure rapetisse sur un petit écran), puis l'état de la livraison en cobalt ; sinon
 * l'état en titre. `secondary` : seconde estimation plus discrète (heure de livraison pendant le retrait). Lu par les
 * lecteurs d'écran en une phrase : « Arrivée vers 14:32 · dans 12 min ».
 */
export function ArrivalHeadline({
  etaMinutes,
  headline,
  label = 'Arrivée vers',
  imminentLabel = 'Arrivée imminente',
  secondary,
  now = Date.now(),
  theme: _theme,
  testID = 'tracking-headline',
}: {
  etaMinutes: number | null;
  headline: Headline;
  label?: string;
  imminentLabel?: string;
  secondary?: string | null;
  now?: number;
  /** @deprecated */
  theme?: TrackingTheme;
  testID?: string;
}) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [boxWidth, setBoxWidth] = useState<number | null>(null);
  // Petit téléphone (hauteur < 700 px) : heure un peu moins grande, le code et le montant restent visibles.
  const clockMax = windowHeight < 700 ? 40 : 48;
  const imminent = etaMinutes !== null && (!Number.isFinite(etaMinutes) || etaMinutes < 1);
  const clock = etaMinutes !== null && !imminent ? arrivalClockFr(Math.round(etaMinutes), now) : null;
  const eta = etaMinutes === null ? null : imminent ? imminentLabel : `${label} ${clock} · dans ${formatDurationFr(etaMinutes)}`;
  const pill = etaMinutes !== null && !imminent ? `dans ${formatDurationFr(etaMinutes)}` : null;
  const width = boxWidth ?? SHEET_CONTENT_GUESS(windowWidth);
  const fontSize = clock ? headlineFontSize(clock, pill, width, clockMax, CLOCK_CHAR_WIDTH) : headlineFontSize(imminentLabel, null, width, 30);
  return (
    <View
      style={styles.headline}
      testID={testID}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w > 0 && w !== boxWidth) setBoxWidth(w);
      }}
    >
      {eta ? (
        <>
          {/* « Arrivée vers » / « 14:32 » en très grand / « dans 12 min » en pastille : lu en une phrase. */}
          <View accessible accessibilityRole="header" accessibilityLabel={eta}>
            {clock ? <Text style={styles.etaLabel}>{label}</Text> : null}
            <View style={styles.etaRow}>
              <Text
                style={[
                  styles.eta,
                  { fontSize, lineHeight: Math.round(fontSize * 1.08), letterSpacing: clock ? -Math.round(fontSize * 0.04 * 10) / 10 : -0.6 },
                ]}
              >
                {clock ?? imminentLabel}
              </Text>
              {pill ? (
                <View style={styles.etaPill}>
                  <Text style={styles.etaPillText}>{pill}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <Text style={styles.headlineState}>{headline.title}</Text>
          {secondary ? (
            <Text style={styles.secondary} testID="eta-secondary">
              {secondary}
            </Text>
          ) : null}
          {headline.subtitle ? <Text style={styles.muted}>{headline.subtitle}</Text> : null}
        </>
      ) : (
        <>
          <Text style={styles.title} accessibilityRole="header">
            {headline.title}
          </Text>
          {headline.subtitle ? <Text style={styles.muted}>{headline.subtitle}</Text> : null}
        </>
      )}
    </View>
  );
}

/**
 * Progression en 4 étapes : pilules segmentées (faites en cobalt, en cours remplie à moitié, à venir en gris clair) et
 * libellés dessous. `color` : couleur des étapes faites (cobalt par défaut).
 */
export function StepsProgress({ steps, color = palette.cobalt, theme: _theme }: { steps: TrackingStep[]; color?: string; /** @deprecated */ theme?: TrackingTheme }) {
  const index = steps.findIndex((s) => s.state === 'current');
  const current = index >= 0 ? steps[index] : null;
  const done = steps.filter((s) => s.state === 'done').length;
  return (
    <View
      style={styles.steps}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: steps.length, now: done, text: current ? `Étape ${index + 1} sur ${steps.length} : ${current.label}` : `${done} étapes sur ${steps.length}` }}
      testID="tracking-steps"
    >
      {steps.map((s) => (
        <View key={s.key} style={styles.step}>
          <View style={styles.stepBar}>
            {s.state === 'done' ? <View style={[styles.stepFill, { backgroundColor: color, width: '100%' }]} /> : null}
            {s.state === 'current' ? <View style={[styles.stepFill, { backgroundColor: color, width: '55%' }]} /> : null}
          </View>
          <Text style={[styles.stepLabel, s.state === 'done' && styles.stepDone, s.state === 'current' && { color, fontWeight: '800' }]} numberOfLines={1}>
            {s.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const ROUND_TONES: Record<'primary' | 'neutral' | 'danger', { bg: string; fg: string; float: boolean }> = {
  primary: { bg: palette.cobalt, fg: palette.onCobalt, float: false },
  neutral: { bg: palette.white, fg: palette.cobalt, float: true },
  danger: { bg: palette.coralFill, fg: palette.white, float: false },
};

/**
 * Bouton rond (disque + pictogramme, libellé 13/600 dessous) : même dessin que `RoundButton` du système de design, sans
 * react-native-svg (page publique). Zone tactile de 56 px au moins.
 */
export function TrackingRoundButton({
  label,
  icon,
  onPress,
  size = 52,
  tone = 'neutral',
  theme: _theme,
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
  /** @deprecated */
  theme?: TrackingTheme;
  showLabel?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const t = ROUND_TONES[tone];
  const touch = touchTarget(size);
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={touch.hitSlop}
      style={[styles.roundColumn, touch.style]}
      testID={testID}
    >
      {({ pressed }) => (
        <>
          <View
            style={[
              styles.roundDisc,
              { width: size, height: size, borderRadius: size / 2, backgroundColor: t.bg },
              t.float && shadows.float,
              disabled && styles.inactive,
              pressed && !disabled && styles.pressed,
            ]}
          >
            <TrackingIcon name={icon} size={Math.round(size * 0.42)} color={t.fg} strokeWidth={2.3} />
          </View>
          {showLabel ? (
            <Text style={[styles.roundLabel, disabled && styles.inactive]} numberOfLines={1}>
              {label}
            </Text>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

/** Grand disque d'état (livrée, annulée, lien expiré…) en tête de feuille ou de carte. */
export function StateDisc({ icon, tone, theme: _theme, size = 56 }: { icon: IconName; tone: 'success' | 'danger' | 'neutral'; /** @deprecated */ theme?: TrackingTheme; size?: number }) {
  const bg = tone === 'success' ? palette.mintTint : tone === 'danger' ? palette.coralTint : palette.raised;
  const fg = tone === 'success' ? palette.mintText : tone === 'danger' ? palette.coralText : palette.inkMuted;
  return (
    <View style={[styles.stateDisc, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <TrackingIcon name={icon} size={Math.round(size * 0.48)} color={fg} strokeWidth={2.6} />
    </View>
  );
}

const VEHICLE_ICON: Record<VehicleType, IconName> = { BIKE: 'bike', MOTO: 'moto', CAR: 'car' };

/** Pastille ronde du livreur (soleil) : son véhicule de profil, ou ses initiales (`initials`). */
export function DriverAvatar({ vehicleType, initials, size = 48 }: { vehicleType: VehicleType; initials?: string | null; size?: number }) {
  return (
    <View style={[styles.driverAvatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {initials ? (
        <Text style={[styles.driverInitials, { fontSize: Math.round(size * 0.32) }]}>{initials}</Text>
      ) : (
        <TrackingIcon name={VEHICLE_ICON[vehicleType]} size={Math.round(size * 0.56)} color={palette.ink} strokeWidth={2.2} />
      )}
    </View>
  );
}

/**
 * Livreur : pastille soleil à ses initiales, prénom, note (étoile dessinée : la police n'a pas d'étoile partout),
 * véhicule et immatriculation, identité vérifiée ; boutons ronds « Appeler » et « WhatsApp » (message prérempli
 * `whatsappText`) quand son numéro est fourni.
 */
export function DriverCard({
  name,
  vehicleType,
  plate,
  ratingAvg,
  phone,
  whatsappText,
  theme: _theme,
}: {
  name: string | null;
  vehicleType: VehicleType;
  plate: string | null;
  ratingAvg: number | null;
  /** Numéro du livreur : boutons « Appeler » (testID call-driver) et « WhatsApp » (whatsapp-driver). */
  phone?: string | null;
  whatsappText?: string | null;
  /** @deprecated */
  theme?: TrackingTheme;
}) {
  return (
    <View style={styles.driverCard} testID="driver-card">
      <View style={styles.driverRow}>
        <DriverAvatar vehicleType={vehicleType} initials={name ? avatarInitials(name) : null} />
        <View style={styles.driverText}>
          <View style={styles.nameRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {name ?? 'Votre livreur'}
            </Text>
            {ratingAvg !== null ? (
              <View style={styles.rating} accessible accessibilityLabel={`Note ${ratingAvg.toFixed(1).replace('.', ',')} sur 5`}>
                <TrackingIcon name="star" size={14} color={COBALT_PALETTE.star} />
                <Text style={styles.ratingText}>{ratingAvg.toFixed(1).replace('.', ',')}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.driverMeta} numberOfLines={1}>
            {LABELS.vehicleType[vehicleType]}
            {plate ? ` · ${plate}` : ''}
          </Text>
          <View style={styles.verifiedRow}>
            <TrackingIcon name="shield" size={14} color={palette.mintText} strokeWidth={2.4} />
            <Text style={styles.verified} numberOfLines={1}>
              Identité vérifiée par Yaar
            </Text>
          </View>
        </View>
      </View>
      {phone ? (
        <View style={styles.contacts}>
          <TrackingRoundButton
            label="Appeler"
            icon="phone"
            size={52}
            onPress={() => openLink(telUrl(phone))}
            accessibilityLabel={`Appeler ${name ?? 'le livreur'} (${phone})`}
            testID="call-driver"
          />
          <TrackingRoundButton
            label="WhatsApp"
            icon="chat"
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

/**
 * Code de livraison (destinataire uniquement) : la tuile cobalt pleine de la page, chiffres 800 tabulaires en blanc.
 * `compact` (écran court, ex. 360 × 640) : chiffres plus petits et marges réduites, pour que le montant à payer reste
 * visible sans faire défiler la feuille.
 */
export function DeliveryCodeChip({ code, theme: _theme, compact = false }: { code: string; /** @deprecated */ theme?: TrackingTheme; compact?: boolean }) {
  const spaced = code.split('').join(' ');
  return (
    <View style={[styles.code, shadows.hero, compact && styles.codeCompact]} accessibilityLabel={`Code de livraison ${spaced}`} testID="delivery-code">
      <View style={styles.codeLabelRow}>
        <TrackingIcon name="shield" size={16} color={palette.onCobalt2} strokeWidth={2.4} />
        <Text style={styles.codeLabel}>Donnez ce code au livreur</Text>
      </View>
      <Text style={[styles.codeDigits, compact && styles.codeDigitsCompact]}>{code.split('').join('  ')}</Text>
      <Text style={styles.codeHint}>Seulement quand vous avez le colis en main.</Text>
    </View>
  );
}

/**
 * Montant à payer / à encaisser : tuile soleil, texte encre (espèces) ; tuile verte (reversé à l'entreprise).
 * L'élément du montant porte le testID `<testID>-value` (vérifications exactes).
 */
export function AmountBox({
  label,
  amount,
  detail,
  tone = 'amber',
  theme: _theme,
  testID,
}: {
  label: string;
  amount: number;
  detail?: string | null;
  /** amber = espèces à payer / encaisser (soleil) ; green = reversé à l'entreprise. */
  tone?: 'amber' | 'green';
  /** @deprecated */
  theme?: TrackingTheme;
  testID?: string;
}) {
  const green = tone === 'green';
  return (
    <View style={[styles.amount, green ? styles.amountGreen : [styles.amountSun, shadows.sun]]} testID={testID}>
      <View style={styles.amountText}>
        <Text style={styles.amountLabel}>{label}</Text>
        {detail ? <Text style={[styles.amountDetail, green && { color: palette.mintText }]}>{detail}</Text> : null}
      </View>
      <Text style={[styles.amountValue, green && { color: palette.mintText }]} testID={testID ? `${testID}-value` : undefined}>
        {formatFcfa(amount)}
      </Text>
    </View>
  );
}

/** Ligne d'information avec pictogramme dans un disque blanc (adresse, expéditeur, colis…). */
export function InfoRow({
  icon,
  title,
  subtitle,
  right,
  theme: _theme,
  testID,
}: {
  icon: IconName;
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
  /** @deprecated */
  theme?: TrackingTheme;
  testID?: string;
}) {
  return (
    <View style={styles.info} testID={testID}>
      <View style={styles.infoIcon}>
        <TrackingIcon name={icon} size={18} color={palette.ink} strokeWidth={2.2} />
      </View>
      <View style={styles.infoText}>
        <Text style={styles.infoTitle}>{title}</Text>
        {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** Bloc qui regroupe des lignes d'information (fond rempli, coins de 20 px, sans bordure). */
export function InfoBlock({ children, theme: _theme, testID }: { children: ReactNode; /** @deprecated */ theme?: TrackingTheme; testID?: string }) {
  return (
    <View style={styles.block} testID={testID}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  headline: { gap: 4 },
  etaLabel: { fontSize: 13, lineHeight: 17, fontWeight: '600', color: palette.inkMuted },
  // Sur une ligne (taille de l'heure calculée) ; à la ligne seulement si la police du téléphone est bien plus large.
  etaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 10, rowGap: 4 },
  eta: { fontWeight: '800', color: palette.ink, fontVariant: ['tabular-nums'] },
  etaPill: { borderRadius: 999, minHeight: 32, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: palette.cobaltTint, flexShrink: 0 },
  etaPillText: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: palette.cobaltText, fontVariant: ['tabular-nums'] },
  headlineState: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: palette.cobalt },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.6, color: palette.ink },
  secondary: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: palette.ink, fontVariant: ['tabular-nums'] },
  muted: { fontSize: 13.5, lineHeight: 19, fontWeight: '500', color: palette.inkMuted },
  steps: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, gap: 8 },
  stepBar: { height: 8, borderRadius: 4, backgroundColor: palette.raisedHigh, overflow: 'hidden' },
  stepFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4 },
  stepLabel: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: palette.inkMuted },
  stepDone: { color: palette.ink, fontWeight: '700' },
  roundColumn: { alignItems: 'center', gap: 6 },
  roundDisc: { alignItems: 'center', justifyContent: 'center' },
  roundLabel: { fontSize: 13, lineHeight: 17, fontWeight: '600', color: palette.ink },
  inactive: { opacity: 0.45 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.96 }] },
  stateDisc: { alignItems: 'center', justifyContent: 'center' },
  driverAvatar: { backgroundColor: palette.sun, alignItems: 'center', justifyContent: 'center' },
  driverInitials: { fontWeight: '800', color: palette.ink, letterSpacing: 0.2 },
  driverCard: { gap: spacing.lg, padding: spacing.lg, borderRadius: 20, backgroundColor: palette.raised },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  driverText: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flexShrink: 1, fontSize: 16, lineHeight: 21, fontWeight: '700', color: palette.ink },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: palette.ink, fontVariant: ['tabular-nums'] },
  driverMeta: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: palette.inkMuted, fontVariant: ['tabular-nums'] },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  verified: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: palette.mintText },
  contacts: { flexDirection: 'row', justifyContent: 'space-evenly' },
  code: { borderRadius: 24, paddingVertical: 18, paddingHorizontal: 20, alignItems: 'center', gap: 4, backgroundColor: palette.cobalt },
  codeCompact: { paddingVertical: 12, gap: 0 },
  codeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  codeLabel: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: palette.onCobalt2 },
  codeDigits: { fontSize: 50, lineHeight: 58, fontWeight: '800', letterSpacing: 2, color: palette.onCobalt, fontVariant: ['tabular-nums'] },
  codeDigitsCompact: { fontSize: 44, lineHeight: 50 },
  codeHint: { fontSize: 12.5, lineHeight: 17, fontWeight: '600', color: palette.onCobalt2, textAlign: 'center' },
  amount: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: 20, paddingVertical: 14, paddingHorizontal: spacing.lg },
  amountSun: { backgroundColor: palette.sun },
  amountGreen: { backgroundColor: palette.mintTint },
  amountText: { flex: 1, gap: 2 },
  amountLabel: { fontSize: 14, lineHeight: 19, fontWeight: '700', color: palette.ink },
  amountDetail: { fontSize: 12.5, lineHeight: 17, fontWeight: '600', color: palette.onSun2 },
  // Chiffres tabulaires : les espaces fines des milliers restent visibles (« 1 000 », pas « 1000 »).
  amountValue: { fontSize: 22, lineHeight: 27, fontWeight: '800', letterSpacing: -0.5, color: palette.ink, fontVariant: ['tabular-nums'] },
  info: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  infoIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.white },
  infoText: { flex: 1, gap: 1 },
  infoTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: palette.ink },
  block: { gap: 14, padding: spacing.lg, borderRadius: 20, backgroundColor: palette.raised },
});
