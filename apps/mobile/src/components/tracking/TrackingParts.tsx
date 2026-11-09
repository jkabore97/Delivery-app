import type { ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { arrivalClockFr, formatDurationFr, LABELS, type VehicleType } from '@yaar/shared';
import { formatFcfa, initials } from '../../lib/format';
import { telUrl } from '../../lib/tel';
import type { Headline, TrackingStep } from '../../lib/trackingSteps';
import { colors, radius, spacing } from '../../theme';
import { VEHICLE_EMOJI } from '../VehicleOptions';

/**
 * Titre de la feuille : grande heure d'arrivée pendant la course, sinon l'état de la livraison. `label` : « Arrivée
 * vers » (livraison) ou « Au retrait vers » (entreprise, livreur en route vers elle) ; `secondary` : seconde
 * estimation plus discrète (ex. heure de livraison pendant le retrait).
 */
export function ArrivalHeadline({
  etaMinutes,
  headline,
  label = 'Arrivée vers',
  imminentLabel = 'Arrivée imminente',
  secondary,
  now = Date.now(),
  testID = 'tracking-headline',
}: {
  etaMinutes: number | null;
  headline: Headline;
  label?: string;
  imminentLabel?: string;
  secondary?: string | null;
  now?: number;
  testID?: string;
}) {
  const imminent = etaMinutes !== null && (!Number.isFinite(etaMinutes) || etaMinutes < 1);
  const clock = etaMinutes !== null && !imminent ? arrivalClockFr(Math.round(etaMinutes), now) : null;
  const eta = etaMinutes === null ? null : imminent ? imminentLabel : `${label} ${clock} · dans ${formatDurationFr(etaMinutes)}`;
  return (
    <View style={{ gap: 2 }} testID={testID}>
      {eta ? (
        <>
          {/* « Arrivée vers 14:32 · dans 12 min » : heure en grand, délai en pastille. */}
          <View style={styles.etaRow} accessible accessibilityRole="header" accessibilityLabel={eta}>
            <Text style={styles.eta}>{imminent ? imminentLabel : `${label} ${clock}`}</Text>
            {!imminent ? (
              <View style={styles.etaPill}>
                <Text style={styles.etaPillText}>dans {formatDurationFr(etaMinutes!)}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.headlineSmall}>{headline.title}</Text>
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

/** Progression en 4 étapes (barres + libellés). */
export function StepsProgress({ steps, color = colors.green }: { steps: TrackingStep[]; color?: string }) {
  return (
    <View style={styles.steps} accessibilityRole="progressbar" testID="tracking-steps">
      {steps.map((s) => (
        <View key={s.key} style={styles.step}>
          <View
            style={[
              styles.stepBar,
              s.state === 'done' && { backgroundColor: color },
              s.state === 'current' && { backgroundColor: color, opacity: 0.45 },
            ]}
          />
          <Text
            style={[styles.stepLabel, s.state !== 'todo' && { color: colors.text }, s.state === 'current' && { color, fontWeight: '800' }]}
            numberOfLines={1}
          >
            {s.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function CallButton({ phone, color = colors.green, label = 'Appeler', testID }: { phone: string; color?: string; label?: string; testID?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${phone}`}
      onPress={() => void Linking.openURL(telUrl(phone))}
      style={[styles.call, { backgroundColor: color }]}
      testID={testID}
    >
      <Text style={styles.callText}>📞 {label}</Text>
    </Pressable>
  );
}

/** Livreur : prénom, note, véhicule et immatriculation, bouton d'appel. */
export function DriverCard({
  name,
  vehicleType,
  plate,
  ratingAvg,
  phone,
  color = colors.green,
}: {
  name: string | null;
  vehicleType: VehicleType;
  plate: string | null;
  ratingAvg: number | null;
  phone: string | null;
  color?: string;
}) {
  return (
    <View style={styles.card} testID="driver-card">
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials(name)}</Text>
        <View style={styles.avatarVehicle}>
          <Text style={{ fontSize: 13 }}>{VEHICLE_EMOJI[vehicleType]}</Text>
        </View>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {name ?? 'Votre livreur'}
          {ratingAvg !== null ? <Text style={styles.rating}>{`  ★ ${ratingAvg.toFixed(1).replace('.', ',')}`}</Text> : null}
        </Text>
        <Text style={styles.muted} numberOfLines={1}>
          {LABELS.vehicleType[vehicleType]}
          {plate ? ` · ${plate}` : ''}
        </Text>
        <Text style={styles.verified}>✓ Identité vérifiée par Yaar</Text>
      </View>
      {phone ? <CallButton phone={phone} color={color} testID="call-driver" /> : null}
    </View>
  );
}

/** Code de livraison en grand (destinataire uniquement). */
export function DeliveryCodeChip({ code }: { code: string }) {
  const spaced = code.split('').join(' ');
  return (
    <View style={styles.code} accessibilityLabel={`Code de livraison ${spaced}`} testID="delivery-code">
      <Text style={styles.codeLabel}>Donnez ce code au livreur</Text>
      <Text style={styles.codeDigits}>{code.split('').join('  ')}</Text>
      <Text style={styles.codeHint}>Seulement quand vous avez le colis en main.</Text>
    </View>
  );
}

/** Montant à payer / à encaisser. */
export function AmountBox({ label, amount, detail, testID }: { label: string; amount: number; detail?: string | null; testID?: string }) {
  return (
    <View style={styles.amount} testID={testID}>
      <View style={{ flex: 1 }}>
        <Text style={styles.amountLabel}>{label}</Text>
        {detail ? <Text style={styles.amountDetail}>{detail}</Text> : null}
      </View>
      <Text style={styles.amountValue} testID={testID ? `${testID}-value` : undefined}>
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
  testID,
}: {
  icon: string;
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
  testID?: string;
}) {
  return (
    <View style={styles.info} testID={testID}>
      <Text style={styles.infoIcon}>{icon}</Text>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={styles.infoTitle}>{title}</Text>
        {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export { CallButton };

const styles = StyleSheet.create({
  etaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: spacing.sm, rowGap: 4 },
  eta: { fontSize: 24, fontWeight: '900', color: colors.text, letterSpacing: -0.4 },
  etaPill: { backgroundColor: colors.green, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  etaPillText: { color: colors.white, fontWeight: '900', fontSize: 14 },
  verified: { fontSize: 11, color: colors.green, fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '900', color: colors.text, letterSpacing: -0.3 },
  headlineSmall: { fontSize: 15, fontWeight: '700', color: colors.green },
  secondary: { fontSize: 14, fontWeight: '700', color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
  steps: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, gap: 5 },
  stepBar: { height: 5, borderRadius: 3, backgroundColor: colors.border },
  stepLabel: { fontSize: 12, color: colors.textMuted, lineHeight: 15 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: '#F7F9FA',
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontWeight: '900', color: colors.green, fontSize: 16 },
  avatarVehicle: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  rating: { fontSize: 14, fontWeight: '700', color: '#B4610A' },
  call: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 10 },
  callText: { color: colors.white, fontWeight: '800', fontSize: 14 },
  code: {
    backgroundColor: colors.greenLight,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.green,
    borderStyle: 'dashed',
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  codeLabel: { fontSize: 13, fontWeight: '800', color: colors.green, textTransform: 'uppercase', letterSpacing: 0.5 },
  codeDigits: { fontSize: 42, fontWeight: '900', color: colors.green, letterSpacing: 2 },
  codeHint: { fontSize: 12, color: colors.textMuted },
  amount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.orangeLight,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  amountLabel: { fontSize: 14, fontWeight: '800', color: '#9A4F00' },
  amountDetail: { fontSize: 12, color: '#9A4F00' },
  // Chiffres tabulaires : les espaces fines des milliers restent visibles (« 1 000 », pas « 1000 »).
  amountValue: { fontSize: 20, fontWeight: '900', color: '#9A4F00', fontVariant: ['tabular-nums'] },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  infoIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  infoTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
});
