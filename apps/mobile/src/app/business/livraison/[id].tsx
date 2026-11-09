import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { isTerminal, LABELS } from '@yaar/shared';
import { CallRoundButton, WhatsAppRoundButton } from '../../../components/design/ContactButtons';
import { Icon } from '../../../components/design/Icon';
import { MapIconButton, Pill } from '../../../components/design/Pill';
import { RoundButton, ROUND_BUTTON_SIZES } from '../../../components/design/RoundButton';
import { DarkScreen } from '../../../components/design/Surfaces';
import { DisputeBox } from '../../../components/DisputeBox';
import { avatarInitials } from '../../../components/map/markerArt';
import { RatingCard, Stars } from '../../../components/Rating';
import { ShareTrackingCard } from '../../../components/ShareTrackingCard';
import { FloatingChip, LiveTrackingLayout } from '../../../components/tracking/LiveTrackingLayout';
import { AmountBox, ArrivalHeadline, DriverCard, InfoRow, StepsProgress } from '../../../components/tracking/TrackingParts';
import { useAsync } from '../../../hooks/useAsync';
import { errorMessage } from '../../../lib/api';
import { amountsToCollect, canBusinessCancel, collectDetail, FEE_PAYER_LABELS } from '../../../lib/delivery';
import { confirmAsync } from '../../../lib/dialog';
import { formatDateTime, formatFcfa, formatOrderNumber, formatTime } from '../../../lib/format';
import {
  buildScene,
  deliveryEtaLine,
  estimateArrivalMinutes,
  estimatePickupMinutes,
  isLiveStage,
  orderSceneInput,
  type LiveDriver,
} from '../../../lib/liveScene';
import { fixTime } from '../../../lib/map/motion';
import { formatPhone } from '../../../lib/phone';
import { POLL_MS } from '../../../lib/publicConfig';
import { recipientCallName, recipientWhatsappText, shareFeedback, shareOrCopyTrackingLink } from '../../../lib/share';
import { trackingHeadline, trackingSteps } from '../../../lib/trackingSteps';
import { useApi } from '../../../state/auth';
import { useBusiness } from '../../../state/business';
import { useOrderRoom, usePolling, useSocket, useSocketEvent } from '../../../state/socket';
import { dark, spacing, typeScale } from '../../../theme';

/**
 * Suivi d'une livraison par l'entreprise (comme Uber Direct) : carte claire en direct (livreur animé, itinéraire
 * jusqu'au destinataire en épingle à ses initiales), feuille sombre : heure d'arrivée et état, étapes, « Colis pour
 * … » (adresse, repère, colis), livreur, montants (ce que paie le destinataire, ce qui revient à l'entreprise),
 * annulation avant le retrait ; en bas, boutons ronds « Partager le lien », « WhatsApp » (au destinataire, message
 * prérempli avec le lien de suivi) et « Appeler le livreur ». L'entreprise ne voit jamais le code de livraison.
 *
 * Pendant que le livreur vient chercher le colis, le titre donne SON arrivée chez l'entreprise (durée restante de
 * l'itinéraire vers le retrait) ; l'heure de livraison au destinataire est rappelée en dessous.
 */
export default function BusinessDeliveryScreen() {
  const { id, created } = useLocalSearchParams<{ id: string; created?: string }>();
  const api = useApi();
  const { store } = useBusiness();
  const { pollIntervalMs } = useSocket();
  const order = useAsync(() => api.getOrder(id), [api, id]);
  const [live, setLive] = useState<LiveDriver | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  useOrderRoom(id);
  useSocketEvent('order.updated', (e) => {
    if (e.orderId === id) void order.reload(true);
  });
  useSocketEvent('driver.location', (e) => {
    if (e.orderId === id) setLive({ lat: e.lat, lng: e.lng, heading: e.heading, at: fixTime(e.at) });
  });
  // Mode poll (Vercel) : GET /orders/:id toutes les pollIntervalMs pendant la recherche et la course.
  const status = order.data?.status;
  const liveStatus = status === 'SEARCHING_DRIVER' || status === 'ASSIGNED' || status === 'PICKED_UP';
  usePolling(
    () => order.reload(true),
    liveStatus ? POLL_MS.businessDeliveryLive : POLL_MS.businessDeliveryWaiting,
    !!status && !isTerminal(status),
  );

  const o = order.data;
  // Destinataire en épingle « avatar » à ses initiales ; l'entreprise garde son pictogramme (c'est chez elle).
  const input = useMemo(() => (o ? { ...orderSceneInput(o, live), initials: { dropoff: avatarInitials(o.recipientName) } } : null), [o, live]);
  const scene = useMemo(() => (input ? buildScene(input) : null), [input]);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/business'));

  if (!o || !scene || !input) {
    return (
      <DarkScreen>
        <View style={styles.waiting}>
          {order.error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {order.error}
            </Text>
          ) : (
            <ActivityIndicator size="large" color={dark.green} />
          )}
          <Pill label="Retour" icon="back" tone="outline" onPress={goBack} />
        </View>
      </DarkScreen>
    );
  }

  const businessName = o.store?.name ?? store?.name ?? null;
  const deliveryEta = estimateArrivalMinutes(scene, input, o.etaMinutes);
  const pickupEta = estimatePickupMinutes(scene, input);
  const toPickup = scene.stage === 'toPickup';
  const liveStage = isLiveStage(scene.stage);
  const terminal = isTerminal(o.status);
  const now = Date.now();
  const headline = trackingHeadline(o.status, 'business', { recipient: o.recipientName, driver: o.driver?.name?.split(' ')[0] });
  const amounts = amountsToCollect(o);
  const recipient = o.recipientName ?? 'le destinataire';
  const shareParty = {
    recipientName: o.recipientName,
    recipientIsBusiness: o.recipientIsBusiness,
    recipientPhone: o.recipientPhone,
    businessName,
  };
  const driverPhone = liveStage ? (o.driver?.phone ?? null) : null;

  const cancel = () => {
    void confirmAsync({
      title: 'Annuler la livraison',
      message: 'Le livreur et le destinataire seront prévenus. Annuler cette demande ?',
      cancelText: 'Non',
      confirmText: 'Oui, annuler',
      destructive: true,
    }).then(async (ok) => {
      if (!ok) return;
      setCancelling(true);
      setActionError(null);
      try {
        order.setData(await api.cancelOrder(o.id, 'Annulée par l’entreprise'));
      } catch (e) {
        setActionError(errorMessage(e));
      } finally {
        setCancelling(false);
      }
    });
  };

  const shareLink = async () => {
    if (!o.trackingUrl) return;
    setSharing(true);
    setShareMessage(null);
    try {
      setShareMessage(shareFeedback(await shareOrCopyTrackingLink({ ...shareParty, url: o.trackingUrl })));
    } catch {
      setShareMessage(shareFeedback('failed'));
    } finally {
      setSharing(false);
    }
  };

  const slot = ROUND_BUTTON_SIZES.medium;
  // Juste après la demande, tant qu'aucun livreur n'est en route : la carte « Prévenez le destinataire » est l'action
  // de l'écran (envoyer le lien) ; les boutons ronds la doubleraient.
  const promptShare = created === '1' && !terminal;
  const actions = terminal || (promptShare && !driverPhone) ? undefined : (
    <View style={{ gap: spacing.sm }}>
      {shareMessage ? (
        <Text style={styles.feedback} accessibilityLiveRegion="polite">
          {shareMessage}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <RoundButton
          label="Partager le lien"
          icon="share"
          tone="primary"
          slot={slot}
          onPress={shareLink}
          loading={sharing}
          disabled={!o.trackingUrl}
          accessibilityLabel="Partager le lien de suivi"
          testID="share-round-button"
        />
        <WhatsAppRoundButton
          phone={o.recipientPhone}
          text={recipientWhatsappText({ ...shareParty, url: o.trackingUrl, orderNumber: o.number })}
          slot={slot}
          testID="whatsapp-recipient"
        />
        {driverPhone ? <CallRoundButton phone={driverPhone} label="Appeler le livreur" slot={slot} testID="call-driver" /> : null}
      </View>
    </View>
  );

  return (
    <LiveTrackingLayout
      markers={scene.markers}
      lines={scene.lines}
      fitPoints={scene.fitPoints}
      stageKey={o.status}
      animationMs={Math.max(pollIntervalMs, 4000)}
      sheetTheme="dark"
      topLeft={<MapIconButton icon="back" onPress={goBack} accessibilityLabel="Retour" testID="back-button" />}
      topCenter={<FloatingChip testID="order-chip">{`Livraison ${formatOrderNumber(o.number)}`}</FloatingChip>}
      footer={actions}
      testID="business-tracking"
    >
      {toPickup ? (
        <ArrivalHeadline
          etaMinutes={pickupEta}
          label="Au retrait vers"
          imminentLabel="Arrivée au retrait imminente"
          secondary={deliveryEtaLine(deliveryEta, now, recipientCallName(o.recipientName, o.recipientIsBusiness), pickupEta)}
          headline={headline}
          now={now}
          theme="dark"
        />
      ) : (
        <ArrivalHeadline etaMinutes={deliveryEta} headline={headline} now={now} theme="dark" />
      )}
      {o.status !== 'CANCELLED' ? <StepsProgress steps={trackingSteps(o.status, 'business')} theme="dark" /> : null}
      {o.status === 'CANCELLED' && o.cancelReason ? <Text style={styles.reason}>Motif : {o.cancelReason}</Text> : null}

      {promptShare ? (
        <ShareTrackingCard
          url={o.trackingUrl}
          recipientName={o.recipientName}
          recipientIsBusiness={o.recipientIsBusiness}
          recipientPhone={o.recipientPhone}
          businessName={businessName}
          prominent
          tone="dark"
        />
      ) : null}

      <View style={styles.block} testID="recipient-card">
        <View style={styles.recipientTop}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typeScale.kicker, styles.kicker]}>Colis pour</Text>
            <Text style={styles.recipientName}>
              {o.recipientName ?? 'Destinataire'}
              {o.recipientIsBusiness ? <Text style={styles.recipientTag}> · entreprise</Text> : null}
            </Text>
            {o.recipientPhone ? <Text style={styles.phone}>{formatPhone(o.recipientPhone)}</Text> : null}
          </View>
          {o.recipientPhone && !terminal ? (
            <CallRoundButton phone={o.recipientPhone} label={`Appeler ${recipient}`} size="small" showLabel={false} testID="call-recipient" />
          ) : null}
        </View>
        {o.dropoff ? (
          <InfoRow icon="pin" title={o.dropoff.address} subtitle={o.dropoff.landmark ? `Repère : ${o.dropoff.landmark}` : null} theme="dark" />
        ) : null}
        {o.parcelDescription ? <InfoRow icon="package" title={o.parcelDescription} theme="dark" /> : null}
        {o.notes ? <Text style={styles.notes}>« {o.notes} »</Text> : null}
      </View>

      {o.driver && liveStage ? (
        <DriverCard name={o.driver.name} vehicleType={o.driver.vehicleType} plate={o.driver.plate} ratingAvg={o.driver.ratingAvg} theme="dark" />
      ) : null}

      <View style={{ gap: spacing.sm }} testID="amounts">
        {amounts.atDropoff > 0 && o.status !== 'CANCELLED' ? (
          <AmountBox
            label={o.status === 'DELIVERED' ? 'Encaissé auprès du destinataire' : 'Le destinataire paie à la livraison'}
            amount={amounts.atDropoff}
            detail={collectDetail(amounts)}
            theme="dark"
            testID="recipient-amount"
          />
        ) : null}
        {amounts.goods > 0 && o.status !== 'CANCELLED' ? (
          <AmountBox
            label={o.status === 'DELIVERED' ? 'Reversé à votre entreprise' : 'Pour votre entreprise'}
            amount={amounts.goods}
            detail="Valeur de la marchandise : encaissée par le livreur, reversée par Yaar."
            tone="green"
            theme="dark"
            testID="business-amount"
          />
        ) : null}
        {amounts.atPickup > 0 && (o.status === 'SEARCHING_DRIVER' || o.status === 'ASSIGNED') ? (
          <AmountBox label="À payer au livreur au retrait" amount={amounts.atPickup} detail="Frais de livraison, en espèces." theme="dark" testID="pickup-amount" />
        ) : null}
        <View style={styles.feeRow} testID="delivery-fee">
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.feeLabel}>Frais de livraison · {LABELS.vehicleType[o.vehicleType].toLowerCase()}</Text>
            {amounts.feePaidBy ? (
              <Text style={styles.feePayer}>
                Payés par {FEE_PAYER_LABELS[amounts.feePaidBy].title.toLowerCase()} {FEE_PAYER_LABELS[amounts.feePaidBy].detail}
              </Text>
            ) : null}
          </View>
          <Text style={styles.feeValue}>{formatFcfa(o.deliveryFee)}</Text>
        </View>
      </View>

      {o.status === 'DELIVERED' && o.deliveredAt ? (
        <View style={styles.delivered}>
          <Icon name="check" size={18} color={dark.green} strokeWidth={2.8} />
          <Text style={styles.deliveredText}>Livrée le {formatDateTime(o.deliveredAt)}.</Text>
        </View>
      ) : null}
      {o.canRate ? (
        <RatingCard
          title="Notez le livreur"
          tone="dark"
          onSubmit={async (score, comment) => {
            await api.rateOrder(o.id, { score, ...(comment ? { comment } : {}) });
            await order.reload(true);
          }}
        />
      ) : null}
      {o.myRating ? (
        <View style={styles.myRating}>
          <Text style={styles.feeLabel}>Votre note</Text>
          <Stars value={o.myRating} size={22} emptyColor={dark.raisedHigh} />
        </View>
      ) : null}

      {actionError ? (
        <Text style={styles.error} accessibilityRole="alert">
          {actionError}
        </Text>
      ) : null}
      {canBusinessCancel(o.status) ? (
        <Pill
          label="Annuler la livraison"
          icon={<Icon name="close" size={16} color={dark.red} strokeWidth={2.6} />}
          tone="outline"
          onPress={cancel}
          loading={cancelling}
          style={styles.center}
          textStyle={{ color: dark.red }}
          testID="cancel-delivery"
        />
      ) : null}
      <Text style={styles.meta}>
        Demandée à {formatTime(o.createdAt)}
        {o.assignedAt ? ` · livreur à ${formatTime(o.assignedAt)}` : ''}
        {o.pickedUpAt ? ` · récupérée à ${formatTime(o.pickedUpAt)}` : ''}
      </Text>
      <DisputeBox orderId={o.id} tone="dark" placeholder="Décrivez le problème (retard, colis abîmé…)" />
    </LiveTrackingLayout>
  );
}

const styles = StyleSheet.create({
  waiting: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, paddingVertical: spacing.xl * 3 },
  actions: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start', paddingTop: spacing.xs },
  feedback: { color: dark.green, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  reason: { color: dark.red, fontSize: 14, fontWeight: '700' },
  block: { gap: spacing.md, padding: spacing.md, borderRadius: 18, backgroundColor: dark.raised, borderWidth: 1, borderColor: dark.border },
  recipientTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  kicker: { color: dark.green },
  recipientName: { ...typeScale.subtitle, color: dark.text, fontWeight: '900' },
  recipientTag: { fontSize: 14, fontWeight: '700', color: dark.textMuted },
  phone: { color: dark.textMuted, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  notes: { color: dark.textMuted, fontSize: 14, lineHeight: 20, fontStyle: 'italic' },
  feeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md },
  feeLabel: { color: dark.text, fontSize: 14, fontWeight: '800' },
  feeValue: { color: dark.text, fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  feePayer: { color: dark.textMuted, fontSize: 12.5, fontWeight: '600' },
  delivered: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: dark.greenSoft, borderRadius: 12, padding: spacing.md },
  deliveredText: { color: dark.green, fontWeight: '800', fontSize: 14 },
  myRating: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  error: { color: dark.red, backgroundColor: dark.redSoft, borderRadius: 12, padding: spacing.md, fontWeight: '700', overflow: 'hidden' },
  center: { alignSelf: 'center' },
  meta: { fontSize: 12, color: dark.textFaint, textAlign: 'center' },
});
