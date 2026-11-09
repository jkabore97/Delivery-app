import { useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { FileUploadInput, OrderDto } from '@yaar/shared';
import { Icon, type IconName } from '../../components/design/Icon';
import { Pill } from '../../components/design/Pill';
import { AmountRow, DarkHeader, DarkProgress, DarkScreen } from '../../components/design/Surfaces';
import { RatingCard } from '../../components/Rating';
import { errorMessage, isApiError } from '../../lib/api';
import { amountsToCollect, collectDetail } from '../../lib/delivery';
import { cashRatio } from '../../lib/driverStatus';
import { formatFcfa, formatOrderNumber } from '../../lib/format';
import { useAsync } from '../../hooks/useAsync';
import { capturePhoto } from '../../lib/photo';
import { useApi } from '../../state/auth';
import { useDriver } from '../../state/driver';
import { dark, MIN_TOUCH, spacing, typeScale } from '../../theme';

const CODE_LENGTH = 4;

/** Grand bouton d'action pleine largeur (vert vif) des écrans sombres. */
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
    <Pill
      label={title}
      icon={icon}
      tone="green"
      size="lg"
      onPress={onPress}
      disabled={disabled}
      loading={loading}
      style={styles.primary}
      testID={testID}
    />
  );
}

/**
 * Preuve de livraison, sur fond sombre : d'abord, en très grand, le montant à encaisser auprès du destinataire
 * (marchandise + frais s'il les paie), puis le code à 4 chiffres affiché sur sa page de suivi, et une photo
 * facultative ; « Valider la livraison ». Une fois validée : grande coche, gain de la course, gains du jour et note.
 */
export default function DeliverScreen() {
  const api = useApi();
  const { currentOrder, profile, setCurrentOrder, refreshProfile } = useDriver();
  const [code, setCode] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; upload: FileUploadInput } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [delivered, setDelivered] = useState<OrderDto | null>(null);
  const [rated, setRated] = useState(false);
  const inputRef = useRef<TextInputInstance>(null);
  const earnings = useAsync(() => api.driverEarnings(), [api]);
  const today = earnings.data?.today ?? null;
  const todayRow = today ? (
    <View style={styles.todayRow}>
      <Text style={styles.todayLabel}>{`Gains du jour · ${today.deliveries} course${today.deliveries > 1 ? 's' : ''}`}</Text>
      <Text style={styles.todayValue}>{formatFcfa(today.earnings)}</Text>
    </View>
  ) : null;
  const goHome = () => router.dismissTo('/driver');

  if (delivered) {
    return (
      <DarkScreen edges={['top', 'bottom']} footer={<PrimaryAction title="Retour aux courses" icon="map" onPress={goHome} testID="back-to-home" />} testID="delivery-success">
        <StatusBar style="light" />
        <View style={styles.success}>
          <View style={styles.bigCheck}>
            <Icon name="check" size={56} color={dark.greenInk} strokeWidth={3} />
          </View>
          <Text style={[typeScale.hero, styles.successTitle]} accessibilityRole="header">
            Livraison confirmée
          </Text>
          <Text style={styles.successSub}>Course {formatOrderNumber(delivered.number)} · livrée</Text>
        </View>
        {delivered.driverEarning !== null ? (
          <View style={styles.gainBox}>
            <Text style={styles.gainLabel}>Votre gain</Text>
            <Text style={styles.gainValue}>+{formatFcfa(delivered.driverEarning)}</Text>
          </View>
        ) : null}
        <View style={styles.card}>
          {delivered.cashCollected !== null ? (
            <View style={styles.todayRow}>
              <Text style={styles.todayLabel}>Espèces encaissées</Text>
              <Text style={[styles.todayValue, { color: dark.amber }]}>{formatFcfa(delivered.cashCollected)}</Text>
            </View>
          ) : null}
          {todayRow}
        </View>
        {!rated ? (
          <RatingCard
            title={delivered.store ? 'Notez l’entreprise' : 'Notez le client'}
            tone="dark"
            onSubmit={async (score, comment) => {
              await api.rateOrder(delivered.id, { score, ...(comment ? { comment } : {}) });
              setRated(true);
            }}
          />
        ) : (
          <Text style={styles.thanks}>Merci pour votre note.</Text>
        )}
      </DarkScreen>
    );
  }

  const o = currentOrder;
  if (!o || o.status !== 'PICKED_UP') {
    return (
      <DarkScreen edges={['top', 'bottom']} header={<DarkHeader title="Confirmer la livraison" onBack={() => router.back()} />}>
        <StatusBar style="light" />
        <Text style={styles.muted}>Aucune course à livrer.</Text>
        <Pill label="Retour" icon="back" tone="outline" size="lg" onPress={() => router.back()} />
      </DarkScreen>
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
    try {
      const result = await api.deliverOrder(o.id, { code, ...(photo ? { proofPhoto: photo.upload } : {}) });
      setDelivered(result);
      setCurrentOrder(null);
      void refreshProfile();
      void earnings.reload();
    } catch (e) {
      setError(errorMessage(e));
      if (isApiError(e, 'DELIVERY_CODE_INVALID')) setCode('');
    } finally {
      setBusy(false);
    }
  };

  const amounts = amountsToCollect(o);
  // Les frais payés par l'entreprise ont été encaissés (et comptés) au retrait.
  const cashAfter = (profile?.cashHeld ?? 0) + amounts.atDropoff;
  const limit = profile?.cashLimit ?? 0;
  const recipient = o.recipientName ?? o.client?.name ?? 'Destinataire';
  const ratio = cashRatio(cashAfter, limit);

  return (
    <DarkScreen
      edges={['top', 'bottom']}
      header={<DarkHeader title="Confirmer la livraison" subtitle={`Course ${formatOrderNumber(o.number)} · ${recipient}`} onBack={() => router.back()} />}
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
      <StatusBar style="light" />
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
          <Icon name="check" size={20} color={dark.green} strokeWidth={2.8} />
          <Text style={styles.paidText}>Rien à encaisser : la livraison est déjà payée.</Text>
        </View>
      )}

      <Text style={styles.codeTitle}>{amounts.atDropoff > 0 ? '2. ' : ''}Demandez le code au destinataire</Text>
      <Text style={styles.codeHint}>Il s’affiche sur sa page de suivi (lien reçu par SMS / WhatsApp).</Text>
      <Pressable onPress={() => inputRef.current?.focus()} accessibilityLabel="Saisir le code de livraison" style={styles.codeRow}>
        {Array.from({ length: CODE_LENGTH }).map((_, i) => {
          const active = i === code.length;
          const filled = i < code.length;
          return (
            <View key={i} style={[styles.codeBox, filled && styles.codeBoxFilled, active && styles.codeBoxActive]}>
              <Text style={styles.codeDigit}>{code[i] ?? ''}</Text>
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={inputRef}
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        keyboardType="number-pad"
        maxLength={CODE_LENGTH}
        autoFocus
        style={styles.hiddenInput}
        accessibilityLabel="Code de livraison"
        testID="delivery-code-input"
      />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Pressable onPress={takePhoto} style={styles.photoBox} accessibilityRole="button" accessibilityLabel="Photo du colis remis (facultatif)">
        {photo ? (
          <Image source={{ uri: photo.uri }} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={styles.photoEmpty}>
            <Icon name="camera" size={22} color={dark.textMuted} />
            <Text style={styles.photoText}>Photo du colis remis (facultatif)</Text>
          </View>
        )}
      </Pressable>
      {photo ? <Pill label="Retirer la photo" icon="close" tone="outline" onPress={() => setPhoto(null)} style={{ alignSelf: 'center' }} /> : null}

      <View style={styles.card}>
        {profile ? (
          <>
            <View style={styles.todayRow}>
              <Text style={styles.todayLabel}>Espèces détenues après cette course</Text>
              <Text style={[styles.todayValue, { color: limit && cashAfter >= limit ? dark.red : dark.text }]}>{formatFcfa(cashAfter)}</Text>
            </View>
            <DarkProgress value={ratio} color={limit && cashAfter >= limit ? dark.red : dark.amber} />
            <Text style={styles.small}>Plafond {formatFcfa(limit)} : au-delà, vous ne recevez plus de courses avant dépôt.</Text>
          </>
        ) : null}
        {o.driverEarning !== null ? (
          <View style={styles.todayRow}>
            <Text style={styles.todayLabel}>Votre gain sur cette course</Text>
            <Text style={[styles.todayValue, { color: dark.green }]}>{formatFcfa(o.driverEarning)}</Text>
          </View>
        ) : null}
        {todayRow}
      </View>
    </DarkScreen>
  );
}

const styles = StyleSheet.create({
  primary: { alignSelf: 'stretch', minHeight: MIN_TOUCH },
  muted: { color: dark.textMuted, fontSize: 15 },
  paid: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: dark.greenSoft, borderRadius: 16, padding: spacing.lg },
  paidText: { flex: 1, color: dark.green, fontWeight: '800', fontSize: 15 },
  codeTitle: { ...typeScale.subtitle, color: dark.text, textAlign: 'center', marginTop: spacing.sm },
  codeHint: { color: dark.textMuted, fontSize: 13, textAlign: 'center', marginTop: -6 },
  codeRow: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  codeBox: {
    width: 62,
    height: 74,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: dark.border,
    backgroundColor: dark.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBoxFilled: { borderColor: dark.raisedHigh },
  codeBoxActive: { borderColor: dark.green },
  codeDigit: { fontSize: 32, fontWeight: '900', color: dark.text, fontVariant: ['tabular-nums'] },
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  error: { color: dark.red, backgroundColor: dark.redSoft, borderRadius: 12, padding: spacing.md, fontWeight: '700', overflow: 'hidden', textAlign: 'center' },
  photoBox: {
    minHeight: 84,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  photoEmpty: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  photoText: { color: dark.textMuted, fontWeight: '700' },
  photo: { width: '100%', height: 180 },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: 16, backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.border },
  todayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  todayLabel: { flex: 1, color: dark.textMuted, fontSize: 14, fontWeight: '700' },
  todayValue: { color: dark.text, fontSize: 17, fontWeight: '900', fontVariant: ['tabular-nums'] },
  small: { color: dark.textFaint, fontSize: 12, lineHeight: 16 },
  success: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xl, paddingBottom: spacing.md },
  bigCheck: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: dark.green,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 8,
    borderColor: 'rgba(47,211,138,0.25)',
  },
  successTitle: { color: dark.text, textAlign: 'center' },
  successSub: { color: dark.textMuted, fontSize: 15, fontWeight: '700' },
  gainBox: { alignItems: 'center', gap: 2, backgroundColor: dark.greenSoft, borderRadius: 20, paddingVertical: spacing.lg },
  gainLabel: { color: dark.textMuted, fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  gainValue: { color: dark.green, fontSize: 40, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -0.8 },
  thanks: { color: dark.green, fontWeight: '800', textAlign: 'center', fontSize: 15 },
});
