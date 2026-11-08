import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { isTerminal, LABELS } from '@yaar/shared';
import { DisputeBox } from '../../../components/DisputeBox';
import { RatingCard, Stars } from '../../../components/Rating';
import { ShareTrackingCard } from '../../../components/ShareTrackingCard';
import { FloatingButton, FloatingChip, LiveTrackingLayout } from '../../../components/tracking/LiveTrackingLayout';
import {
  AmountBox,
  ArrivalHeadline,
  CallButton,
  DriverCard,
  InfoRow,
  StepsProgress,
} from '../../../components/tracking/TrackingParts';
import { Banner, Button, KeyValue, Loading, Muted, Screen } from '../../../components/ui';
import { useAsync } from '../../../hooks/useAsync';
import { errorMessage } from '../../../lib/api';
import { amountsToCollect, canBusinessCancel, FEE_PAYER_LABELS } from '../../../lib/delivery';
import { formatDateTime, formatFcfa, formatOrderNumber, formatTime } from '../../../lib/format';
import { buildScene, estimateArrivalMinutes, isLiveStage, orderSceneInput, type LiveDriver } from '../../../lib/liveScene';
import { formatPhone } from '../../../lib/phone';
import { POLL_MS } from '../../../lib/publicConfig';
import { trackingHeadline, trackingSteps } from '../../../lib/trackingSteps';
import { confirmAsync } from '../../../lib/dialog';
import { useApi } from '../../../state/auth';
import { useBusiness } from '../../../state/business';
import { useOrderRoom, usePolling, useSocket, useSocketEvent } from '../../../state/socket';
import { colors, spacing } from '../../../theme';

/**
 * Suivi d'une livraison par l'entreprise (comme Uber Direct) : carte en direct (livreur animé, itinéraire),
 * heure d'arrivée, étapes, livreur, destinataire, montants, lien de suivi à envoyer, annulation avant le
 * retrait. L'entreprise ne voit jamais le code de livraison (réservé au destinataire).
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

  useOrderRoom(id);
  useSocketEvent('order.updated', (e) => {
    if (e.orderId === id) void order.reload(true);
  });
  useSocketEvent('driver.location', (e) => {
    if (e.orderId === id) setLive({ lat: e.lat, lng: e.lng, heading: e.heading });
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
  const input = useMemo(() => (o ? orderSceneInput(o, live) : null), [o, live]);
  const scene = useMemo(() => (input ? buildScene(input) : null), [input]);

  if (!o || !scene || !input) {
    return (
      <Screen>
        {order.error ? <Banner message={order.error} /> : <Loading />}
        <Button title="Retour" variant="outline" onPress={() => (router.canGoBack() ? router.back() : router.replace('/business'))} />
      </Screen>
    );
  }

  const businessName = o.store?.name ?? store?.name ?? null;
  const eta = estimateArrivalMinutes(scene, input, o.etaMinutes);
  const headline = trackingHeadline(o.status, 'business', { recipient: o.recipientName, driver: o.driver?.name?.split(' ')[0] });
  const amounts = amountsToCollect(o);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/business'));

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

  const share = (
    <ShareTrackingCard
      url={o.trackingUrl}
      recipientName={o.recipientName}
      recipientPhone={o.recipientPhone}
      businessName={businessName}
      prominent={created === '1' && !isTerminal(o.status)}
    />
  );

  return (
    <LiveTrackingLayout
      markers={scene.markers}
      lines={scene.lines}
      fitPoints={scene.fitPoints}
      stageKey={o.status}
      animationMs={pollIntervalMs}
      topLeft={<FloatingButton label="←" onPress={goBack} accessibilityLabel="Retour" />}
      topCenter={<FloatingChip testID="order-chip">{`Livraison ${formatOrderNumber(o.number)}`}</FloatingChip>}
      testID="business-tracking"
    >
      <ArrivalHeadline etaMinutes={eta} headline={headline} />
      {o.status !== 'CANCELLED' ? <StepsProgress steps={trackingSteps(o.status, 'business')} color={colors.green} /> : null}
      {o.status === 'CANCELLED' && o.cancelReason ? <Muted>Motif : {o.cancelReason}</Muted> : null}

      {created === '1' && !isTerminal(o.status) ? share : null}

      {o.driver && isLiveStage(scene.stage) ? (
        <DriverCard
          name={o.driver.name}
          vehicleType={o.driver.vehicleType}
          plate={o.driver.plate}
          ratingAvg={o.driver.ratingAvg}
          phone={o.driver.phone}
        />
      ) : null}

      <View style={styles.block}>
        <InfoRow
          icon={o.recipientIsBusiness ? '🏢' : '🏠'}
          title={`${o.recipientName ?? 'Destinataire'}${o.recipientIsBusiness ? ' · entreprise' : ''}`}
          subtitle={o.recipientPhone ? formatPhone(o.recipientPhone) : null}
          right={o.recipientPhone && !isTerminal(o.status) ? <CallButton phone={o.recipientPhone} color={colors.orange} testID="call-recipient" /> : null}
          testID="recipient-card"
        />
        {o.dropoff ? (
          <InfoRow
            icon="📍"
            title={o.dropoff.address}
            subtitle={o.dropoff.landmark ? `Repère : ${o.dropoff.landmark}` : null}
          />
        ) : null}
        {o.parcelDescription ? <InfoRow icon="📦" title={o.parcelDescription} subtitle={o.notes ? `Instructions : ${o.notes}` : null} /> : null}
      </View>

      <View style={styles.block} testID="amounts">
        <KeyValue label={`Livraison (${LABELS.vehicleType[o.vehicleType]})`} value={formatFcfa(o.deliveryFee)} />
        {amounts.feePaidBy ? (
          <KeyValue
            label="Payée par"
            value={`${FEE_PAYER_LABELS[amounts.feePaidBy].title} ${FEE_PAYER_LABELS[amounts.feePaidBy].detail}`}
          />
        ) : null}
        {amounts.goods > 0 ? <KeyValue label="Marchandise à encaisser" value={formatFcfa(amounts.goods)} /> : null}
      </View>
      {amounts.atDropoff > 0 && o.status !== 'CANCELLED' ? (
        <AmountBox
          label={o.status === 'DELIVERED' ? 'Encaissé auprès du destinataire' : 'Le destinataire paie à la livraison'}
          amount={amounts.atDropoff}
          detail={amounts.goods > 0 ? 'La marchandise vous est reversée par Yaar.' : null}
          testID="recipient-amount"
        />
      ) : null}
      {amounts.atPickup > 0 && (o.status === 'SEARCHING_DRIVER' || o.status === 'ASSIGNED') ? (
        <AmountBox label="À payer au livreur au retrait" amount={amounts.atPickup} testID="pickup-amount" />
      ) : null}

      {created !== '1' && !isTerminal(o.status) ? share : null}

      {o.status === 'DELIVERED' && o.deliveredAt ? (
        <Banner message={`Livrée le ${formatDateTime(o.deliveredAt)}.`} tone="green" />
      ) : null}
      {o.canRate ? (
        <RatingCard
          title="Notez le livreur"
          onSubmit={async (score, comment) => {
            await api.rateOrder(o.id, { score, ...(comment ? { comment } : {}) });
            await order.reload(true);
          }}
        />
      ) : null}
      {o.myRating ? (
        <View style={styles.block}>
          <Muted>Votre note</Muted>
          <Stars value={o.myRating} size={22} />
        </View>
      ) : null}

      {actionError ? <Banner message={actionError} /> : null}
      {canBusinessCancel(o.status) ? (
        <Button title="Annuler la livraison" variant="outline" onPress={cancel} loading={cancelling} testID="cancel-delivery" />
      ) : null}
      <Text style={styles.meta}>
        Demandée à {formatTime(o.createdAt)}
        {o.assignedAt ? ` · livreur à ${formatTime(o.assignedAt)}` : ''}
        {o.pickedUpAt ? ` · récupérée à ${formatTime(o.pickedUpAt)}` : ''}
      </Text>
      <DisputeBox orderId={o.id} color={colors.orange} placeholder="Décrivez le problème (retard, colis abîmé…)" />
    </LiveTrackingLayout>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  meta: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
});
