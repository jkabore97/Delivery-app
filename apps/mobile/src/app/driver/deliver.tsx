import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import { router } from 'expo-router';
import type { FileUploadInput, OrderDto } from '@yaar/shared';
import { Icon, type IconName } from '../../components/design/Icon';
import { Pill } from '../../components/design/Pill';
import { AmountRow, ScreenHeader, SurfaceScreen } from '../../components/design/Surfaces';
import { CodeInput } from '../../components/driver/CodeInput';
import { CashMeter, IconDisc, Money, WhiteCard } from '../../components/driver/DriverKit';
import { RatingCard } from '../../components/Rating';
import { Banner } from '../../components/ui';
import { errorMessage, isApiError } from '../../lib/api';
import { amountsToCollect, collectDetail } from '../../lib/delivery';
import { formatOrderNumber } from '../../lib/format';
import { useAsync } from '../../hooks/useAsync';
import { capturePhoto } from '../../lib/photo';
import { useApi } from '../../state/auth';
import { useDriver } from '../../state/driver';
import { palette, radii, shadows, spacing } from '../../theme';

const CODE_LENGTH = 4;

/** Grand bouton d'action pleine largeur (pilule cobalt de 56 px) en pied d'écran. */
function PrimaryAction({
  title,
  icon,
  onPress,
  disabled,
  loading,
  testID,
}: {
  title: string;
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
}) {
  return (
    <Pill label={title} icon={icon} tone="cobalt" size="lg" onPress={onPress} disabled={disabled} loading={loading} style={styles.primary} testID={testID} />
  );
}

/** Ligne libellé / montant d'un récapitulatif (gains, espèces). */
function SumRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.sumRow}>
      <Text style={styles.sumLabel}>{label}</Text>
      {children}
    </View>
  );
}

/**
 * Preuve de livraison (Cobalt) : d'abord, en tuile SOLEIL, le montant à encaisser auprès du destinataire (marchandise +
 * frais s'il les paie), puis le code à 4 chiffres affiché sur sa page de suivi (grandes cases, clavier numérique ouvert,
 * collage accepté), une photo facultative et le solde d'espèces après la course ; « Valider la livraison ». Une fois
 * validée : grande coche verte, gain de la course en tuile cobalt, gains du jour, espèces encaissées et note.
 */
export default function DeliverScreen() {
  const api = useApi();
  const { currentOrder, profile, setCurrentOrder, refreshProfile } = useDriver();
  const [code, setCode] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; upload: FileUploadInput } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState(false);
  const [delivered, setDelivered] = useState<OrderDto | null>(null);
  const [rated, setRated] = useState(false);
  const earnings = useAsync(() => api.driverEarnings(), [api]);
  const today = earnings.data?.today ?? null;
  const todayLabel = today ? `Gains du jour · ${today.deliveries} course${today.deliveries > 1 ? 's' : ''}` : null;
  const goHome = () => router.dismissTo('/driver');

  if (delivered) {
    return (
      <SurfaceScreen
        edges={['top', 'bottom']}
        contentStyle={styles.successContent}
        footer={<PrimaryAction title="Retour aux courses" icon="map" onPress={goHome} testID="back-to-home" />}
        testID="delivery-success"
      >
        <View style={styles.success}>
          <View style={styles.checkHalo}>
            <View style={styles.bigCheck}>
              <Icon name="check" size={52} color={palette.white} strokeWidth={3.2} />
            </View>
          </View>
          <Text style={styles.successTitle} accessibilityRole="header">
            Livraison confirmée
          </Text>
          <Text style={styles.successSub}>Course {formatOrderNumber(delivered.number)} · livrée</Text>
        </View>
        {delivered.driverEarning !== null ? (
          // La tuile héros cobalt de l'écran : le gain de la course, en très grand.
          <View style={[styles.gainHero, shadows.hero]} testID="delivery-gain">
            <Text style={styles.gainLabel}>Votre gain</Text>
            <Money amount={delivered.driverEarning} sign="+" size={48} color={palette.white} />
            {today && todayLabel ? (
              <>
                <View style={styles.gainRule} />
                <View style={styles.gainDay}>
                  <Text style={styles.gainDayLabel}>{todayLabel}</Text>
                  <Money amount={today.earnings} size={18} color={palette.white} />
                </View>
              </>
            ) : null}
          </View>
        ) : null}
        {delivered.cashCollected !== null || (todayLabel && delivered.driverEarning === null) ? (
          <WhiteCard style={styles.sumCard}>
            {delivered.cashCollected !== null ? (
              <SumRow label="Espèces encaissées">
                <View style={styles.sunPill}>
                  <Money amount={delivered.cashCollected} size={16} />
                </View>
              </SumRow>
            ) : null}
            {todayLabel && today && delivered.driverEarning === null ? (
              <SumRow label={todayLabel}>
                <Money amount={today.earnings} size={17} color={palette.cobalt} />
              </SumRow>
            ) : null}
          </WhiteCard>
        ) : null}
        {!rated ? (
          <RatingCard
            title={delivered.store ? 'Notez l’entreprise' : 'Notez le client'}
            onSubmit={async (score, comment) => {
              await api.rateOrder(delivered.id, { score, ...(comment ? { comment } : {}) });
              setRated(true);
            }}
          />
        ) : (
          <View style={styles.thanks}>
            <Icon name="check" size={18} color={palette.mintText} strokeWidth={2.8} />
            <Text style={styles.thanksText}>Merci pour votre note.</Text>
          </View>
        )}
      </SurfaceScreen>
    );
  }

  const o = currentOrder;
  if (!o || o.status !== 'PICKED_UP') {
    return (
      <SurfaceScreen edges={['top', 'bottom']} header={<ScreenHeader title="Confirmer la livraison" onBack={() => router.back()} />}>
        <WhiteCard style={styles.emptyCard}>
          <IconDisc icon="package" tone="cobalt" size={56} />
          <Text style={styles.emptyText}>Aucune course à livrer.</Text>
          <Pill label="Retour" icon="back" tone="outline" size="lg" onPress={() => router.back()} />
        </WhiteCard>
      </SurfaceScreen>
    );
  }

  const takePhoto = async () => {
    setError(null);
    try {
      const p = await capturePhoto('camera');
      if (p) setPhoto(p);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const submit = async () => {
    if (code.length !== CODE_LENGTH) return;
    setBusy(true);
    setError(null);
    setCodeError(false);
    try {
      const result = await api.deliverOrder(o.id, { code, ...(photo ? { proofPhoto: photo.upload } : {}) });
      setDelivered(result);
      setCurrentOrder(null);
      void refreshProfile();
      void earnings.reload();
    } catch (e) {
      setError(errorMessage(e));
      if (isApiError(e, 'DELIVERY_CODE_INVALID')) {
        setCode('');
        setCodeError(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const amounts = amountsToCollect(o);
  // Les frais payés par l'entreprise ont été encaissés (et comptés) au retrait.
  const cashAfter = (profile?.cashHeld ?? 0) + amounts.atDropoff;
  const limit = profile?.cashLimit ?? 0;
  const recipient = o.recipientName ?? o.client?.name ?? 'Destinataire';
  const over = limit > 0 && cashAfter >= limit;

  return (
    <SurfaceScreen
      edges={['top', 'bottom']}
      header={<ScreenHeader title="Confirmer la livraison" subtitle={`Course ${formatOrderNumber(o.number)} · ${recipient}`} onBack={() => router.back()} />}
      footer={
        <PrimaryAction
          title="Valider la livraison"
          icon="check"
          onPress={submit}
          loading={busy}
          disabled={code.length !== CODE_LENGTH}
          testID="deliver-button"
        />
      }
    >
      {amounts.atDropoff > 0 ? (
        <AmountRow
          hero
          label={`1. Encaissez auprès de ${recipient}`}
          amount={amounts.atDropoff}
          detail={collectDetail(amounts)}
          testID="amount-to-collect"
        />
      ) : (
        <View style={styles.paid}>
          <IconDisc icon="check" tone="mint" size={36} />
          <Text style={styles.paidText}>Rien à encaisser : la livraison est déjà payée.</Text>
        </View>
      )}

      <WhiteCard style={styles.codeCard}>
        <View style={styles.codeHead}>
          <Text style={styles.codeTitle} accessibilityRole="header">
            {amounts.atDropoff > 0 ? '2. ' : ''}Demandez le code au destinataire
          </Text>
          <Text style={styles.codeHint}>Il s’affiche sur sa page de suivi (lien reçu par SMS / WhatsApp).</Text>
        </View>
        <CodeInput
          value={code}
          onChangeText={(t) => {
            setCode(t);
            if (codeError) setCodeError(false);
          }}
          length={CODE_LENGTH}
          autoFocus
          error={codeError}
          onSubmit={() => void submit()}
          accessibilityLabel="Code de livraison"
          testID="delivery-code-input"
        />
        {error ? <Banner message={error} /> : null}
      </WhiteCard>

      <Pressable
        onPress={takePhoto}
        style={({ pressed }) => [styles.photoBox, shadows.tile, pressed && styles.photoPressed]}
        accessibilityRole="button"
        accessibilityLabel="Photo du colis remis (facultatif)"
      >
        {photo ? (
          <Image source={{ uri: photo.uri }} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={styles.photoEmpty}>
            <IconDisc icon="camera" tone="cobalt" size={44} />
            <View style={styles.flex}>
              <Text style={styles.photoTitle}>Photo du colis remis</Text>
              <Text style={styles.photoSub}>Facultatif · preuve en cas de litige</Text>
            </View>
            <Icon name="chevronRight" size={20} color={palette.inkMuted} />
          </View>
        )}
      </Pressable>
      {photo ? <Pill label="Retirer la photo" icon="close" tone="outline" onPress={() => setPhoto(null)} style={styles.center} /> : null}

      <WhiteCard>
        {profile ? (
          <CashMeter
            held={cashAfter}
            limit={limit}
            blocked={over}
            label="Espèces détenues après cette course"
            caption="au-delà, vous ne recevez plus de courses avant dépôt."
            testID="cash-after"
          />
        ) : null}
        {o.driverEarning !== null ? (
          <SumRow label="Votre gain sur cette course">
            <Money amount={o.driverEarning} size={18} color={palette.cobalt} />
          </SumRow>
        ) : null}
        {today && todayLabel ? (
          <SumRow label={todayLabel}>
            <Money amount={today.earnings} size={18} />
          </SumRow>
        ) : null}
      </WhiteCard>
    </SurfaceScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  center: { alignSelf: 'center' },
  primary: { alignSelf: 'stretch', justifyContent: 'center' },
  paid: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.mintTint, borderRadius: 20, padding: spacing.lg },
  paidText: { flex: 1, color: palette.mintText, fontWeight: '800', fontSize: 15, lineHeight: 21 },
  codeCard: { gap: spacing.lg },
  codeHead: { gap: 4 },
  codeTitle: { fontSize: 20, lineHeight: 26, fontWeight: '800', letterSpacing: -0.3, color: palette.ink },
  codeHint: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: palette.inkMuted },
  photoBox: { minHeight: 76, borderRadius: radii.card, backgroundColor: palette.card, overflow: 'hidden', justifyContent: 'center' },
  photoPressed: { backgroundColor: palette.raised },
  photoEmpty: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.lg, paddingVertical: 14 },
  photoTitle: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: palette.ink },
  photoSub: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: palette.inkMuted },
  photo: { width: '100%', height: 180 },
  sumCard: { gap: 14 },
  sumRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  sumLabel: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '700', color: palette.ink },
  sunPill: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, justifyContent: 'center', backgroundColor: palette.sun },
  emptyCard: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xl },
  emptyText: { color: palette.ink, fontSize: 18, lineHeight: 24, fontWeight: '800' },
  successContent: { gap: spacing.lg },
  success: { alignItems: 'center', gap: 6, paddingTop: spacing.xl, paddingBottom: spacing.xs },
  checkHalo: { width: 124, height: 124, borderRadius: 62, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.mintTint, marginBottom: spacing.sm },
  bigCheck: { width: 96, height: 96, borderRadius: 48, backgroundColor: palette.mint, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -0.9, color: palette.ink, textAlign: 'center' },
  successSub: { color: palette.inkMuted, fontSize: 15, lineHeight: 20, fontWeight: '600', fontVariant: ['tabular-nums'] },
  gainHero: { borderRadius: radii.hero, padding: 24, gap: 4, backgroundColor: palette.cobalt },
  gainLabel: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: palette.onCobalt2 },
  gainRule: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.18)', marginVertical: 12 },
  gainDay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  gainDayLabel: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '600', color: palette.onCobalt2 },
  thanks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: spacing.lg, borderRadius: 20, backgroundColor: palette.mintTint },
  thanksText: { color: palette.mintText, fontWeight: '800', fontSize: 15, lineHeight: 20 },
});
