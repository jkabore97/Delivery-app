import { useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatDistanceFr, formatDurationFr, LABELS, type AddressDto } from '@yaar/shared';
import { CallRoundButton, WhatsAppRoundButton } from '../../components/design/ContactButtons';
import { Icon } from '../../components/design/Icon';
import { MapIconButton, Pill } from '../../components/design/Pill';
import { RoundButton, ROUND_BUTTON_SIZES } from '../../components/design/RoundButton';
import { AmountRow, DarkScreen } from '../../components/design/Surfaces';
import { DisputeBox } from '../../components/DisputeBox';
import { SosButton } from '../../components/DriverWidgets';
import { avatarInitials } from '../../components/map/markerArt';
import { FloatingChip, LiveTrackingLayout } from '../../components/tracking/LiveTrackingLayout';
import { errorMessage } from '../../lib/api';
import { amountsToCollect, collectDetail, nextStep } from '../../lib/delivery';
import { confirmAsync } from '../../lib/dialog';
import { formatFcfa, formatOrderNumber, summarizeItems } from '../../lib/format';
import { buildScene, orderSceneInput } from '../../lib/liveScene';
import { externalDirectionsUrl, webDirectionsUrl } from '../../lib/navigation';
import { formatPhone } from '../../lib/phone';
import { useApi } from '../../state/auth';
import { useDriver } from '../../state/driver';
import { useOrderRoom } from '../../state/socket';
import { dark, spacing, typeScale } from '../../theme';

async function launchDirections(dest: AddressDto, label: string) {
  const url = externalDirectionsUrl(dest, label);
  try {
    await Linking.openURL(url);
  } catch {
    await Linking.openURL(webDirectionsUrl(dest));
  }
}

/**
 * Le GPS n'est suivi qu'au premier plan (aucune localisation en arrière-plan, exigence légale) :
 * on prévient le livreur que le client ne verra plus sa position tant qu'il reste dans l'autre application.
 */
function openDirections(dest: AddressDto, label: string) {
  void confirmAsync({
    title: 'Ouvrir l’itinéraire ?',
    message:
      'Tant que Yaar n’est pas à l’écran, votre position n’est plus transmise : le destinataire et Yaar verront votre dernière position connue. Revenez dans Yaar dès que possible.',
    cancelText: 'Rester dans Yaar',
    confirmText: 'Ouvrir le GPS',
  }).then((ok) => {
    if (ok) void launchDirections(dest, label);
  });
}

/** Prénom pour un message (« Awa Kaboré » → « Awa ») ; rien pour une entreprise. */
function firstName(name: string | null | undefined, business: boolean): string | null {
  if (!name || business) return null;
  return name.trim().split(/\s+/)[0] ?? null;
}

/**
 * Course en cours (comme les applications de coursiers) : carte claire avec l'itinéraire vers la cible de l'étape
 * (entreprise, puis destinataire en épingle « avatar » à ses initiales), position du livreur animée et suivie,
 * feuille sombre : étape (« 1 · RÉCUPÉRER » / « 2 · LIVRER »), entreprise ou « Colis pour … », adresse et repère,
 * colis, instructions, montants à encaisser, puis la rangée de boutons ronds (Récupéré / Livré, WhatsApp, Appeler).
 * Les adresses ne sont visibles que pour le livreur affecté.
 */
export default function DriverOrderScreen() {
  const api = useApi();
  const { currentOrder: o, setCurrentOrder, position, profile, refreshCurrentOrder, refreshProfile, orderNotice, clearOrderNotice } = useDriver();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useOrderRoom(o?.id);

  const me = position ? { lat: position.lat, lng: position.lng, heading: position.heading ?? null } : null;
  const recipient = o ? (o.recipientName ?? o.client?.name ?? null) : null;
  const scene = useMemo(
    () =>
      o
        ? buildScene({
            ...orderSceneInput(o, me),
            initials: { pickup: avatarInitials(o.store?.name), dropoff: avatarInitials(recipient) },
          })
        : null,
    [o, me?.lat, me?.lng, me?.heading, recipient], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!o || !scene) {
    return (
      <DarkScreen edges={['top', 'bottom']}>
        {orderNotice ? (
          <Text style={styles.notice} accessibilityRole="alert">
            {orderNotice}
          </Text>
        ) : null}
        <View style={styles.empty}>
          <Icon name="package" size={44} color={dark.textFaint} />
          <Text style={styles.emptyTitle}>Aucune course en cours.</Text>
          <Pill
            label="Retour"
            icon="back"
            tone="green"
            size="lg"
            onPress={() => {
              clearOrderNotice();
              router.back();
            }}
          />
        </View>
      </DarkScreen>
    );
  }

  const pickupStage = o.status === 'ASSIGNED';
  const target = pickupStage ? o.pickup : o.dropoff;
  const storeName = o.store?.name ?? null;
  const targetLabel = pickupStage ? (storeName ?? 'Retrait') : (recipient ?? 'Livraison');
  const contactPhone = pickupStage ? (o.store?.phone ?? o.client?.phone ?? null) : (o.recipientPhone ?? o.client?.phone ?? null);
  const contactName = pickupStage ? (storeName ?? o.client?.name ?? 'l’expéditeur') : (recipient ?? 'le destinataire');
  const title = pickupStage ? (storeName ?? 'Point de retrait') : `Colis pour ${recipient ?? 'le destinataire'}`;
  const step = nextStep(o, me);
  const metrics =
    step && step.distanceM !== null && step.minutes !== null ? `${formatDistanceFr(step.distanceM)} · ${formatDurationFr(step.minutes)}` : null;
  const amounts = amountsToCollect(o);
  const num = formatOrderNumber(o.number);
  const hello = firstName(recipient, !!o.recipientIsBusiness);
  const whatsappText = pickupStage
    ? `Bonjour, je suis ${profile?.name ?? 'le livreur'} de Yaar Livraison : j’arrive pour récupérer la course ${num}.`
    : `Bonjour${hello ? ` ${hello}` : ''}, je suis votre livreur Yaar Livraison : j’arrive avec votre colis (${num}).`;
  const slot = ROUND_BUTTON_SIZES.big;

  const pickup = async () => {
    setBusy(true);
    setError(null);
    try {
      setCurrentOrder(await api.pickupOrder(o.id));
      // Frais payés par l'entreprise : encaissés au retrait, le solde d'espèces change.
      void refreshProfile();
    } catch (e) {
      setError(errorMessage(e));
      void refreshCurrentOrder();
    } finally {
      setBusy(false);
    }
  };

  return (
    <LiveTrackingLayout
      markers={scene.markers}
      lines={scene.lines}
      fitPoints={scene.fitPoints}
      stageKey={o.status}
      animationMs={1200}
      allowRotate
      sheetTheme="dark"
      topLeft={<MapIconButton icon="back" onPress={() => router.back()} accessibilityLabel="Retour" />}
      topCenter={<FloatingChip>{`Course ${num} · ${LABELS.orderStatus[o.status]}`}</FloatingChip>}
      topRight={<SosButton size={48} />}
      testID="driver-order"
      footer={
        <View style={styles.actions}>
          {pickupStage ? (
            <RoundButton
              label="Récupéré"
              icon="check"
              size="big"
              tone="primary"
              slot={slot}
              onPress={pickup}
              loading={busy}
              accessibilityLabel={o.type === 'FOOD' ? 'J’ai récupéré la commande' : 'J’ai récupéré le colis'}
              testID="pickup-button"
            />
          ) : (
            <RoundButton
              label="Livré"
              icon="check"
              size="big"
              tone="primary"
              slot={slot}
              onPress={() => router.push('/driver/deliver')}
              accessibilityLabel="Confirmer la livraison (code du destinataire)"
              testID="go-deliver"
            />
          )}
          <WhatsAppRoundButton phone={contactPhone} text={whatsappText} slot={slot} testID="whatsapp-contact" />
          <CallRoundButton phone={contactPhone} slot={slot} testID="call-contact" />
        </View>
      }
    >
      <View style={styles.step} testID="next-step">
        <Text style={[typeScale.kicker, styles.kicker]}>{pickupStage ? '1 · RÉCUPÉRER' : '2 · LIVRER'}</Text>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {target ? (
          <Text style={styles.address}>
            {target.address}
            {target.landmark ? ` · Repère : ${target.landmark}` : ''}
          </Text>
        ) : null}
        <View style={styles.pills}>
          {metrics ? <Pill label={metrics} icon="route" tone="outline" testID="step-metrics" /> : null}
          {target ? (
            <Pill label="Itinéraire" icon="navigation" tone="green" onPress={() => openDirections(target, targetLabel)} testID="directions-button" />
          ) : null}
        </View>
        {contactPhone ? (
          <Text style={styles.contact}>
            Contact : {contactName} · {formatPhone(contactPhone)}
          </Text>
        ) : null}
      </View>

      {o.parcelDescription || o.items.length > 0 || o.notes ? (
        <View style={styles.block}>
          {o.parcelDescription ? (
            <View style={styles.line}>
              <Icon name="package" size={18} color={dark.textMuted} />
              <Text style={styles.lineText}>{o.parcelDescription}</Text>
            </View>
          ) : null}
          {o.items.length > 0 ? (
            <View style={styles.line}>
              <Icon name="list" size={18} color={dark.textMuted} />
              <Text style={styles.lineText}>{summarizeItems(o.items)}</Text>
            </View>
          ) : null}
          {o.notes ? <Text style={styles.notes}>« {o.notes} »</Text> : null}
        </View>
      ) : null}

      {pickupStage && amounts.atPickup > 0 ? (
        <AmountRow
          label="À encaisser auprès de l’entreprise"
          amount={amounts.atPickup}
          detail="Frais de livraison payés au retrait."
          testID="collect-at-pickup"
        />
      ) : null}
      {amounts.atDropoff > 0 ? (
        <AmountRow
          label={pickupStage ? 'Ensuite, à encaisser auprès du destinataire' : 'À encaisser auprès du destinataire'}
          amount={amounts.atDropoff}
          detail={collectDetail(amounts)}
          testID="collect-at-dropoff"
        />
      ) : (
        <Text style={styles.muted}>Rien à encaisser auprès du destinataire.</Text>
      )}

      {pickupStage && o.dropoff ? (
        <Text style={styles.muted}>
          Ensuite : livrer à {recipient ?? 'le destinataire'} · {o.dropoff.address}
        </Text>
      ) : null}
      {o.driverEarning !== null ? (
        <View style={styles.earning}>
          <Text style={styles.earningLabel}>Votre gain sur cette course</Text>
          <Text style={styles.earningValue}>{formatFcfa(o.driverEarning)}</Text>
        </View>
      ) : null}
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <DisputeBox orderId={o.id} tone="dark" placeholder="Décrivez le problème (destinataire absent, retrait impossible…)" />
    </LiveTrackingLayout>
  );
}

const styles = StyleSheet.create({
  step: { gap: 6 },
  kicker: { color: dark.green },
  title: { ...typeScale.title, color: dark.text },
  address: { color: dark.textMuted, fontSize: 14, lineHeight: 20 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4 },
  contact: { color: dark.textFaint, fontSize: 12.5, fontWeight: '600' },
  block: { gap: spacing.sm, padding: spacing.md, borderRadius: 16, backgroundColor: dark.raised, borderWidth: 1, borderColor: dark.border },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lineText: { flex: 1, color: dark.text, fontSize: 15, fontWeight: '700' },
  notes: { color: dark.textMuted, fontSize: 14, lineHeight: 20, fontStyle: 'italic' },
  muted: { color: dark.textMuted, fontSize: 13.5, lineHeight: 19 },
  earning: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  earningLabel: { color: dark.textMuted, fontSize: 14, fontWeight: '700' },
  earningValue: { color: dark.green, fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  error: { color: dark.red, backgroundColor: dark.redSoft, borderRadius: 12, padding: spacing.md, fontWeight: '700', overflow: 'hidden' },
  actions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 28, paddingTop: spacing.xs },
  notice: { color: dark.amber, backgroundColor: dark.amberSoft, borderRadius: 12, padding: spacing.md, fontWeight: '700', overflow: 'hidden' },
  empty: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xl * 2 },
  emptyTitle: { color: dark.text, fontSize: 18, fontWeight: '900' },
});
