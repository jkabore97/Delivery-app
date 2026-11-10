import { useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { arrivalClockFr, formatDurationFr, LABELS, type VehicleType } from '@yaar/shared';
import { Text } from '../Text';
import { estimateTextWidth } from '../../fonts';
import { telUrl, whatsappUrl } from '../../lib/tel';
import { touchTarget } from '../../lib/touchTarget';
import type { Headline, TrackingStep } from '../../lib/trackingSteps';
import { alpha, FOCUS_RING_INNER, FOCUS_SHAPE, palette, shadows, spacing } from '../../theme';
import { FitAmount } from '../design/FitAmount';
import { avatarInitials } from '../map/markerArt';
import { TrackingIcon, type IconName } from './TrackingIcon';

/**
 * Éléments des feuilles de suivi (page publique du destinataire, suivi d'une livraison par l'entreprise), au dessin
 * Cobalt : grands chiffres 800 tabulaires, progression en pilules segmentées, carte du code en cobalt plein, montant en
 * tuile soleil, carte du livreur. Ce fichier n'importe PAS le système de design (react-native-svg) : la page publique,
 * ouverte depuis un SMS en 3G, reste légère ; ses pictogrammes passent par `TrackingIcon` (SVG du navigateur sur le
 * web).
 */
/** Étoile de la note du livreur (jaune foncé, pictogramme seulement : jamais de texte jaune). */
const STAR = '#E0A400';

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
 * à 20 px. Largeur estimée d'après les avances de la police (`estimateTextWidth` de src/fonts.ts) ; pastille : 8,4 px
 * par caractère + 24 px (+ 8 d'écart). Si la police du téléphone est plus large ou agrandie, la pastille passe
 * simplement à la ligne.
 */
export function headlineFontSize(text: string, pill: string | null, width: number, max: number, pillCharWidth = 8.4, pillPad = 24): number {
  const room = width - (pill ? pillPad + pill.length * pillCharWidth + 8 : 0);
  for (let s = Math.floor(max); s > 20; s--) if (estimateTextWidth(text, s, -s * 0.04) <= room) return s;
  return Math.min(max, 20);
}

/** Écran court (téléphone d'entrée de gamme, 360 × 640) : heure, code et montant visibles sans faire défiler. */
const SHORT_SCREEN_MAX_HEIGHT = 700;

/**
 * Titre de la feuille : pendant la course, l'heure d'arrivée en très grand (800, chiffres tabulaires) sous son
 * libellé (« Arrivée vers », ou « Au retrait vers » pour l'entreprise pendant le retrait), avec « dans 12 min » en
 * pastille sur la même ligne (l'heure rapetisse sur un petit écran), puis l'état de la livraison en cobalt ; sinon
 * l'état en titre. `secondary` : seconde estimation plus discrète (heure de livraison pendant le retrait). Lu par les
 * lecteurs d'écran en une phrase : « Arrivée vers 14:32 · dans 12 min ».
 *
 * `size` :
 * - 'standard' (défaut) : heure jusqu'à 48 px (34 sur écran court, libellé alors sur la ligne de l'heure), pastille
 *   14/700 ;
 * - 'hero' : la grande heure de la page publique (et du détail entreprise) : jusqu'à 64 px (48 sur écran court),
 *   pastille 16/800, libellé 14/700 au-dessus, état 16/800 ; sur écran court, la phrase du livreur cède sa place quand
 *   l'heure est affichée (son nom est sur sa carte) : heure, code et montant restent visibles à 360 × 640.
 * `widthGuess` : largeur du contenu avant sa mesure (évite un saut au premier affichage, ex. panneau de 388 px).
 */
export function ArrivalHeadline({
  etaMinutes,
  headline,
  label = 'Arrivée vers',
  imminentLabel = 'Arrivée imminente',
  secondary,
  size = 'standard',
  widthGuess,
  now = Date.now(),
  testID = 'tracking-headline',
}: {
  etaMinutes: number | null;
  headline: Headline;
  label?: string;
  imminentLabel?: string;
  secondary?: string | null;
  size?: 'standard' | 'hero';
  widthGuess?: number;
  now?: number;
  testID?: string;
}) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [boxWidth, setBoxWidth] = useState<number | null>(null);
  const hero = size === 'hero';
  const short = windowHeight < SHORT_SCREEN_MAX_HEIGHT;
  const clockMax = hero ? (short ? 48 : 64) : short ? 34 : 48;
  const imminent = etaMinutes !== null && (!Number.isFinite(etaMinutes) || etaMinutes < 1);
  const clock = etaMinutes !== null && !imminent ? arrivalClockFr(Math.round(etaMinutes), now) : null;
  const eta = etaMinutes === null ? null : imminent ? imminentLabel : `${label} ${clock} · dans ${formatDurationFr(etaMinutes)}`;
  const pill = etaMinutes !== null && !imminent ? `dans ${formatDurationFr(etaMinutes)}` : null;
  const width = boxWidth ?? widthGuess ?? SHEET_CONTENT_GUESS(windowWidth);
  // Standard, écran court : libellé sur la ligne de l'heure (15/700 : environ 7,6 px par caractère).
  const labelInline = !hero && short && !!clock;
  const labelWidth = labelInline ? Math.ceil(label.length * 7.6) + 8 : 0;
  const fontSize = clock
    ? Math.max(hero ? 36 : 20, headlineFontSize(clock, pill, width - labelWidth, clockMax, hero ? 9 : 8.4, hero ? 28 : 24))
    : hero
      ? 32
      : headlineFontSize(imminentLabel, null, width, 30);
  const clockStyle = clock
    ? { fontSize, lineHeight: Math.round(fontSize * (hero ? 1.04 : 1.08)), letterSpacing: -Math.round(fontSize * 0.04 * 10) / 10 }
    : { fontSize, lineHeight: Math.round(fontSize * 1.2), letterSpacing: -0.8 };
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
            {clock && !labelInline ? <Text style={hero ? styles.etaLabelHero : styles.etaLabel}>{label}</Text> : null}
            <View style={[styles.etaRow, hero && styles.etaRowHero]}>
              {labelInline ? <Text style={styles.etaInlineLabel}>{label}</Text> : null}
              <Text style={[styles.eta, clockStyle]}>{clock ?? imminentLabel}</Text>
              {pill ? (
                <View style={[styles.etaPill, hero && styles.etaPillHero]}>
                  <Text style={[styles.etaPillText, hero && styles.etaPillTextHero]}>{pill}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <Text style={hero ? styles.headlineStateHero : styles.headlineState}>{headline.title}</Text>
          {secondary ? (
            <Text style={styles.secondary} testID="eta-secondary">
              {secondary}
            </Text>
          ) : null}
          {headline.subtitle && !(hero && short && clock) ? <Text style={hero ? styles.subtitleHero : styles.muted}>{headline.subtitle}</Text> : null}
        </>
      ) : (
        <>
          <Text style={styles.title} accessibilityRole="header">
            {headline.title}
          </Text>
          {headline.subtitle ? <Text style={hero ? styles.subtitleHero : styles.muted}>{headline.subtitle}</Text> : null}
        </>
      )}
    </View>
  );
}

/**
 * Progression en 4 étapes : pilules segmentées (faites en cobalt, en cours remplie à moitié, à venir en gris clair) et
 * libellés dessous. `color` : couleur des étapes faites (cobalt par défaut).
 */
export function StepsProgress({ steps, color = palette.cobalt }: { steps: TrackingStep[]; color?: string }) {
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
      {...FOCUS_RING_INNER}
    >
      {({ pressed }) => (
        <>
          <View
            {...FOCUS_SHAPE}
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
export function StateDisc({ icon, tone, size = 56 }: { icon: IconName; tone: 'success' | 'danger' | 'neutral'; size?: number }) {
  const bg = tone === 'success' ? palette.mintTint : tone === 'danger' ? palette.coralTint : palette.raised;
  const fg = tone === 'success' ? palette.mintText : tone === 'danger' ? palette.coralText : palette.inkMuted;
  return (
    <View style={[styles.stateDisc, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <TrackingIcon name={icon} size={Math.round(size * 0.48)} color={fg} strokeWidth={2.6} />
    </View>
  );
}

const VEHICLE_ICON: Record<VehicleType, IconName> = { BIKE: 'bike', MOTO: 'moto', CAR: 'car' };

/** Initiales d'un nom quand il en donne deux, sinon null. */
function twoInitials(name: string | null): string | null {
  const letters = name ? avatarInitials(name) : null;
  return letters && letters.length >= 2 ? letters : null;
}

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
}: {
  name: string | null;
  vehicleType: VehicleType;
  plate: string | null;
  ratingAvg: number | null;
  /** Numéro du livreur : boutons « Appeler » (testID call-driver) et « WhatsApp » (whatsapp-driver). */
  phone?: string | null;
  whatsappText?: string | null;
}) {
  return (
    <View style={styles.driverCard} testID="driver-card">
      <View style={styles.driverRow}>
        {/* Deux initiales (« Issouf S. » → IS) ; un prénom seul : le véhicule plutôt qu'une lettre isolée. */}
        <DriverAvatar vehicleType={vehicleType} initials={twoInitials(name)} />
        <View style={styles.driverText}>
          <View style={styles.nameRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {name ?? 'Votre livreur'}
            </Text>
            {ratingAvg !== null ? (
              <View style={styles.rating} accessible accessibilityLabel={`Note ${ratingAvg.toFixed(1).replace('.', ',')} sur 5`}>
                <TrackingIcon name="star" size={14} color={STAR} />
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
export function DeliveryCodeChip({ code, compact = false }: { code: string; compact?: boolean }) {
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
 * Montant à payer / à encaisser : tuile soleil, texte encre (espèces) ; tuile verte (reversé à l'entreprise). Le
 * montant est en chiffres 800 tabulaires avec « FCFA » plus petit, jamais coupé (`FitAmount` : il rapetisse pour
 * tenir dans 60 % de la ligne, puis « FCFA » passe à la ligne). `icon` : pastille à gauche (ex. « cash »).
 * `compact` (par défaut sur un écran court, 360 × 640) : tuile basse d'une ligne, sans pastille, pour que le montant
 * reste visible sous le code sans faire défiler. L'élément du montant porte le testID `<testID>-value` (son texte est
 * `formatFcfa` : vérifications exactes).
 */
export function AmountBox({
  label,
  amount,
  detail,
  tone = 'amber',
  icon,
  compact,
  testID,
}: {
  label: string;
  amount: number;
  detail?: string | null;
  /** amber = espèces à payer / encaisser (soleil) ; green = reversé à l'entreprise. */
  tone?: 'amber' | 'green';
  /** Pastille à gauche (masquée en `compact`). */
  icon?: IconName;
  /** Tuile basse d'une ligne ; par défaut sur un écran court (hauteur < 700 px). */
  compact?: boolean;
  testID?: string;
}) {
  const green = tone === 'green';
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const low = compact ?? windowHeight < SHORT_SCREEN_MAX_HEIGHT;
  const [inner, setInner] = useState<number | null>(null);
  const padding = low ? 14 : spacing.lg;
  const rowInner = inner ?? SHEET_CONTENT_GUESS(windowWidth) - 2 * padding;
  const iconRoom = icon && !low ? 40 + spacing.md : 0;
  const amountWidth = Math.floor((rowInner - iconRoom - spacing.md) * 0.6);
  return (
    <View
      style={[styles.amount, low && styles.amountCompact, green ? styles.amountGreen : [styles.amountSun, shadows.sun]]}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width) - 2 * padding;
        if (w > 0 && w !== inner) setInner(w);
      }}
      testID={testID}
    >
      {icon && !low ? (
        <View style={[styles.amountIcon, green && styles.amountIconGreen]}>
          <TrackingIcon name={icon} size={22} color={green ? palette.mintText : palette.ink} strokeWidth={2.2} />
        </View>
      ) : null}
      <View style={styles.amountText}>
        <Text style={styles.amountLabel}>{label}</Text>
        {detail ? <Text style={[styles.amountDetail, green && { color: palette.mintText }]}>{detail}</Text> : null}
      </View>
      <FitAmount
        amount={amount}
        size={low ? 22 : 24}
        unitScale={0.58}
        color={green ? palette.mintText : palette.ink}
        align="end"
        width={amountWidth}
        testID={testID ? `${testID}-value` : undefined}
      />
    </View>
  );
}

/** Ligne d'information avec pictogramme dans un disque blanc (adresse, expéditeur, colis…). */
export function InfoRow({
  icon,
  title,
  subtitle,
  right,
  testID,
}: {
  icon: IconName;
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
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
export function InfoBlock({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <View style={styles.block} testID={testID}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  headline: { gap: 4 },
  etaLabel: { fontSize: 13, lineHeight: 17, fontWeight: '600', color: palette.inkMuted },
  etaLabelHero: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: palette.inkMuted },
  etaInlineLabel: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: palette.ink },
  // Sur une ligne (taille de l'heure calculée) ; à la ligne seulement si la police du téléphone est bien plus large.
  etaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 10, rowGap: 4 },
  eta: { fontWeight: '800', color: palette.ink, fontVariant: ['tabular-nums'] },
  etaPill: { borderRadius: 999, minHeight: 32, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: palette.cobaltTint, flexShrink: 0 },
  etaPillText: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: palette.cobaltText, fontVariant: ['tabular-nums'] },
  etaRowHero: { columnGap: 12 },
  etaPillHero: { minHeight: 36, paddingHorizontal: 14 },
  etaPillTextHero: { fontSize: 16, lineHeight: 20, fontWeight: '800' },
  headlineStateHero: { fontSize: 16, lineHeight: 21, fontWeight: '800', color: palette.cobalt },
  subtitleHero: { fontSize: 14, lineHeight: 19, fontWeight: '500', color: palette.inkMuted },
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
  amount: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 72, borderRadius: 20, paddingVertical: 12, paddingHorizontal: spacing.lg },
  amountCompact: { minHeight: 60, paddingVertical: 8, paddingHorizontal: 14, gap: 10 },
  amountIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(palette.ink, 0.08) },
  amountIconGreen: { backgroundColor: palette.white },
  amountSun: { backgroundColor: palette.sun },
  amountGreen: { backgroundColor: palette.mintTint },
  amountText: { flex: 1, gap: 2 },
  amountLabel: { fontSize: 14, lineHeight: 19, fontWeight: '800', color: palette.ink, letterSpacing: -0.1 },
  amountDetail: { fontSize: 12.5, lineHeight: 17, fontWeight: '600', color: palette.onSun2 },
  info: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  infoIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.white },
  infoText: { flex: 1, gap: 1 },
  infoTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: palette.ink },
  block: { gap: 14, padding: spacing.lg, borderRadius: 20, backgroundColor: palette.raised },
});
