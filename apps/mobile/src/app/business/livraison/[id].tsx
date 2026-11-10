import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/Text';
import { router, useLocalSearchParams } from 'expo-router';
import { isTerminal, type OrderDto } from '@yaar/shared';
import { liveEta, deliveryTimeline } from '../../../components/business/dashboardData';
import { AmountsBlock, CancelReason, DeliveredNote, RecipientBlock, TimesLine } from '../../../components/business/DeliveryDetail';
import { deliveryChip } from '../../../components/business/DeliveryCards';
import { useIsDesktop, PAGE_PADDING, TILE_GAP } from '../../../components/business/desktop/layout';
import { MapTile } from '../../../components/business/desktop/MapTile';
import { PageHeader } from '../../../components/business/desktop/PageHeader';
import { SegmentedProgress } from '../../../components/business/parts';
import { CallRoundButton, WhatsAppRoundButton } from '../../../components/design/ContactButtons';
import { MapIconButton, Pill, StatusChip } from '../../../components/design/Pill';
import { RoundButton, ROUND_BUTTON_SIZES } from '../../../components/design/RoundButton';
import { SurfaceScreen } from '../../../components/design/Surfaces';
import { DisputeBox } from '../../../components/DisputeBox';
import { avatarInitials } from '../../../components/map/markerArt';
import { RatingCard, Stars } from '../../../components/Rating';
import { ShareFeedback, ShareTrackingCard, useShareNotice } from '../../../components/ShareTrackingCard';
import { FloatingChip, LiveTrackingLayout } from '../../../components/tracking/LiveTrackingLayout';
import { ArrivalHeadline, DriverCard, StateDisc } from '../../../components/tracking/TrackingParts';
import { useAsync } from '../../../hooks/useAsync';
import { errorMessage } from '../../../lib/api';
import { canBusinessCancel } from '../../../lib/delivery';
import { confirmAsync } from '../../../lib/dialog';
import { formatDateTime, formatOrderNumber } from '../../../lib/format';
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
import { POLL_MS } from '../../../lib/publicConfig';
import { driverWhatsappText, recipientCallName, recipientWhatsappText, shareFeedback, shareOrCopyTrackingLink } from '../../../lib/share';
import { trackingHeadline } from '../../../lib/trackingSteps';
import { useApi } from '../../../state/auth';
import { useBusiness } from '../../../state/business';
import { useOrderRoom, usePolling, useSocket, useSocketEvent } from '../../../state/socket';
import { ON_COBALT_SURFACE, palette, radii, shadows, spacing, tabular } from '../../../theme';

/**
 * Suivi d'une livraison par l'entreprise (comme Uber Direct). Téléphone : carte claire en direct (livreur animé,
 * itinéraire jusqu'au destinataire en épingle à ses initiales) et feuille blanche : heure d'arrivée en très grand,
 * progression en pilules avec les heures, « Colis pour … », livreur, montants (soleil pour les espèces), annulation
 * avant le retrait ; en bas, boutons ronds « Partager » (le lien de suivi), « WhatsApp client » et « Appeler le
 * livreur ». Ordinateur : la carte à gauche, une colonne de tuiles à droite (heure d'arrivée en tuile cobalt,
 * destinataire, livreur, montants, lien de suivi). L'entreprise ne voit jamais le code de livraison.
 *
 * Pendant que le livreur vient chercher le colis, le titre donne SON arrivée chez l'entreprise (durée restante de
 * l'itinéraire vers le retrait) ; l'heure de livraison au destinataire est rappelée en dessous.
 */
export default function BusinessDeliveryScreen() {
  const { id, created } = useLocalSearchParams<{ id: string; created?: string }>();
  const api = useApi();
  const { store } = useBusiness();
  const { pollIntervalMs } = useSocket();
  const desktop = useIsDesktop();
  const order = useAsync(() => api.getOrder(id), [api, id]);
  const [live, setLive] = useState<LiveDriver | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  // Réussite (« Lien copié. ») effacée après quelques secondes ; échec : le lien s'affiche, à copier à la main.
  const [shareNotice, setShareNotice] = useShareNotice();
  const [retrying, setRetrying] = useState(false);

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
  const businessName = o?.store?.name ?? store?.name ?? null;
  // Épingles « avatar » : l'entreprise (carré encre) et le destinataire (goutte cobalt) à leurs initiales.
  const input = useMemo(
    () => (o ? { ...orderSceneInput(o, live), initials: { pickup: avatarInitials(businessName), dropoff: avatarInitials(o.recipientName) } } : null),
    [o, live, businessName],
  );
  const scene = useMemo(() => {
    if (!input) return null;
    const s = buildScene(input);
    // Livraison terminée : le trajet entier (entreprise → destinataire), pas une seule épingle au zoom maximal.
    if (s.stage === 'delivered' && input.pickup && input.dropoff) {
      const pickup = { lat: input.pickup.lat, lng: input.pickup.lng };
      const dropoff = { lat: input.dropoff.lat, lng: input.dropoff.lng };
      return {
        ...s,
        markers: [{ id: 'pickup', kind: 'pickup' as const, ...pickup, title: input.labels?.pickup, ...(input.initials.pickup ? { initials: input.initials.pickup } : {}) }, ...s.markers],
        fitPoints: [pickup, dropoff],
      };
    }
    // Vue de l'entreprise : livreur en route vers elle en disque soleil.
    return s.stage === 'toPickup' ? { ...s, markers: s.markers.map((m) => (m.kind === 'driver' ? { ...m, tone: 'sun' as const } : m)) } : s;
  }, [input]);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/business'));

  if (!o || !scene || !input) {
    const retry = async () => {
      setRetrying(true);
      try {
        await order.reload();
      } finally {
        setRetrying(false);
      }
    };
    return (
      <SurfaceScreen scroll={false}>
        <View style={styles.waiting}>
          {order.error ? (
            <>
              <StateDisc icon="alert" tone="danger" />
              <Text style={styles.error} accessibilityRole="alert">
                {order.error}
              </Text>
              {/* Mode socket : aucun rafraîchissement automatique ne relancera le chargement. */}
              <Pill label="Réessayer" icon="refresh" tone="cobalt" onPress={() => void retry()} loading={retrying} testID="retry-order" />
            </>
          ) : (
            <ActivityIndicator size="large" color={palette.cobalt} />
          )}
          <Pill label="Retour" icon="back" tone="outline" onPress={goBack} />
        </View>
      </SurfaceScreen>
    );
  }

  const deliveryEta = estimateArrivalMinutes(scene, input, o.etaMinutes);
  const pickupEta = estimatePickupMinutes(scene, input);
  const toPickup = scene.stage === 'toPickup';
  const liveStage = isLiveStage(scene.stage);
  const terminal = isTerminal(o.status);
  const now = Date.now();
  const headline = trackingHeadline(o.status, 'business', { recipient: o.recipientName, driver: o.driver?.name?.split(' ')[0] });
  const shareParty = {
    recipientName: o.recipientName,
    recipientIsBusiness: o.recipientIsBusiness,
    recipientPhone: o.recipientPhone,
    businessName,
  };
  const driverPhone = liveStage ? (o.driver?.phone ?? null) : null;
  const steps = deliveryTimeline(o, now, liveEta(o, now));

  const cancel = () => {
    void confirmAsync({
      title: 'Annuler la livraison ?',
      message: 'Le livreur et le destinataire seront prévenus.',
      cancelText: 'Non, la garder',
      confirmText: 'Oui, annuler',
      destructive: true,
      // Navigateur : boutons « OK » / « Annuler » imposés, où « Annuler » garderait la livraison : on le dit.
      webHint: '« OK » annule la livraison ; « Annuler » la garde.',
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
    setShareNotice(null);
    try {
      const outcome = await shareOrCopyTrackingLink({ ...shareParty, url: o.trackingUrl });
      const text = shareFeedback(outcome);
      setShareNotice(text ? { text, ok: outcome !== 'failed' } : null);
    } catch {
      setShareNotice({ text: shareFeedback('failed')!, ok: false });
    } finally {
      setSharing(false);
    }
  };

  const cancelButton = canBusinessCancel(o.status) ? (
    <Pill label="Annuler la livraison" icon="close" tone="red" onPress={cancel} loading={cancelling} style={desktop ? null : styles.center} testID="cancel-delivery" />
  ) : null;
  const errorNode = actionError ? (
    <Text style={styles.error} accessibilityRole="alert">
      {actionError}
    </Text>
  ) : null;
  const rating = (
    <>
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
        <View style={styles.myRating}>
          <Text style={styles.myRatingLabel}>Votre note</Text>
          <Stars value={o.myRating} size={22} />
        </View>
      ) : null}
    </>
  );
  // Juste après la demande, tant qu'aucun livreur n'est en route : la carte « Prévenez le destinataire » est l'action
  // de l'écran (envoyer le lien) ; les boutons ronds la doubleraient.
  const promptShare = created === '1' && !terminal;
  const shareCard = (
    <ShareTrackingCard
      url={o.trackingUrl}
      recipientName={o.recipientName}
      recipientIsBusiness={o.recipientIsBusiness}
      recipientPhone={o.recipientPhone}
      businessName={businessName}
      prominent={promptShare}
      shortLabel
    />
  );

  if (desktop) {
    return (
      <DesktopDelivery
        order={o}
        scene={scene}
        stageKey={o.status}
        animationMs={Math.max(pollIntervalMs, 4000)}
        onBack={goBack}
        headline={headline.title}
        subtitle={headline.subtitle}
        deliveryEta={deliveryEta}
        pickupEta={pickupEta}
        toPickup={toPickup}
        now={now}
        businessName={businessName}
        driverPhone={driverPhone}
        cancelButton={cancelButton}
        shareCard={terminal ? null : shareCard}
        promptShare={promptShare}
        extra={
          <>
            {errorNode}
            {rating}
          </>
        }
      />
    );
  }

  const slot = ROUND_BUTTON_SIZES.medium;
  const actions = terminal || (promptShare && !driverPhone) ? undefined : (
    <View style={{ gap: spacing.sm }}>
      {shareNotice ? <ShareFeedback notice={shareNotice} testID="share-feedback" /> : null}
      {shareNotice && !shareNotice.ok && o.trackingUrl ? (
        // Copie impossible : le lien, sélectionnable, à copier à la main.
        <Text style={styles.link} selectable testID="tracking-link">
          {o.trackingUrl}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <RoundButton
          // « Partager » (le pictogramme et le libellé lu disent « lien de suivi ») : les trois libellés tiennent côte à
          // côte sur un écran de 360 px.
          label="Partager"
          icon="share"
          tone="primary"
          slot={slot}
          onPress={shareLink}
          loading={sharing}
          disabled={!o.trackingUrl}
          accessibilityLabel="Partager le lien de suivi"
          testID="share-round-button"
        />
        {/* « WhatsApp client » : à côté de « Appeler le livreur », le libellé dit à qui l'on écrit. */}
        <WhatsAppRoundButton
          phone={o.recipientPhone}
          text={recipientWhatsappText({ ...shareParty, url: o.trackingUrl, orderNumber: o.number })}
          label="WhatsApp client"
          contactName={o.recipientName}
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
        />
      ) : (
        <ArrivalHeadline etaMinutes={deliveryEta} headline={headline} now={now} />
      )}
      {steps.length > 0 ? <SegmentedProgress steps={steps} labels /> : null}
      <CancelReason order={o} />
      {promptShare ? shareCard : null}
      <RecipientBlock order={o} terminal={terminal} />
      {o.driver && liveStage ? <DriverCard name={o.driver.name} vehicleType={o.driver.vehicleType} plate={o.driver.plate} ratingAvg={o.driver.ratingAvg} /> : null}
      <AmountsBlock order={o} />
      <DeliveredNote order={o} />
      {rating}
      {errorNode}
      {cancelButton}
      <TimesLine order={o} />
      <DisputeBox orderId={o.id} placeholder="Décrivez le problème (retard, colis abîmé…)" />
    </LiveTrackingLayout>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Ordinateur                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

function DesktopDelivery({
  order: o,
  scene,
  stageKey,
  animationMs,
  onBack,
  headline,
  subtitle,
  deliveryEta,
  pickupEta,
  toPickup,
  now,
  businessName,
  driverPhone,
  cancelButton,
  shareCard,
  promptShare,
  extra,
}: {
  order: OrderDto;
  scene: ReturnType<typeof buildScene>;
  stageKey: string;
  animationMs: number;
  onBack: () => void;
  headline: string;
  subtitle: string | null;
  deliveryEta: number | null;
  pickupEta: number | null;
  toPickup: boolean;
  now: number;
  businessName: string | null;
  driverPhone: string | null;
  cancelButton: ReactNode;
  shareCard: ReactNode;
  /** Juste après la demande : le lien de suivi à envoyer passe en tête de colonne. */
  promptShare: boolean;
  extra: ReactNode;
}) {
  const chip = deliveryChip(o.status);
  const liveStage = isLiveStage(scene.stage);
  const eta = liveEta(o, now);
  const steps = deliveryTimeline(o, now, eta);
  const recipient = recipientCallName(o.recipientName, o.recipientIsBusiness) || 'le destinataire';
  return (
    <View style={styles.page} testID="business-tracking">
      <PageHeader
        back={{ onPress: onBack, label: 'Retour au tableau de bord' }}
        title={`Livraison ${formatOrderNumber(o.number)}`}
        titleAccessory={<StatusChip label={chip.label} tone={chip.tone} dot={chip.dot} />}
        subtitle={[o.recipientName, o.dropoff?.address].filter(Boolean).join(' · ') || undefined}
        actions={cancelButton}
      />
      <View style={styles.deskRow}>
        <MapTile
          markers={scene.markers}
          lines={scene.lines}
          fitPoints={scene.fitPoints}
          cameraKey={stageKey}
          animationMs={animationMs}
          // Pas de pastille « Livraison #… » sur la carte : le titre de la page le dit déjà.
          style={styles.deskMap}
          testID="delivery-map"
        />
        <ScrollView style={styles.deskColumn} contentContainerStyle={styles.deskColumnContent} showsVerticalScrollIndicator={false}>
          {liveStage || o.status === 'SEARCHING_DRIVER' || o.status === 'PENDING' ? (
            <View style={[styles.etaTile, shadows.hero]} testID="tracking-headline" {...ON_COBALT_SURFACE}>
              {eta.kind === 'request' ? (
                // Recherche d'un livreur : l'état en grand, l'heure de la demande en petit (pas une heure géante qui se
                // lirait comme une arrivée).
                <>
                  <Text style={styles.etaKicker}>{`Demandée à ${eta.clock}${eta.inText ? ` · ${eta.inText}` : ''}`}</Text>
                  <Text style={[styles.etaClock, styles.etaWord, styles.etaWordSearch]} numberOfLines={2} testID="tracking-state">
                    {headline}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.etaKicker}>{toPickup ? 'Livreur au retrait vers' : 'Arrivée vers'}</Text>
                  <View style={styles.etaRow}>
                    <Text style={[styles.etaClock, !eta.clock && styles.etaWord]}>{eta.clock ?? eta.label}</Text>
                    {eta.clock && eta.inText ? <Text style={styles.etaIn}>{eta.inText}</Text> : null}
                  </View>
                  <Text style={styles.etaHeadline}>{headline}</Text>
                </>
              )}
              {toPickup && deliveryEta !== null ? (
                <Text style={styles.etaSub} testID="eta-secondary">
                  {deliveryEtaLine(deliveryEta, now, recipient, pickupEta)}
                </Text>
              ) : subtitle ? (
                <Text style={styles.etaSub}>{subtitle}</Text>
              ) : null}
              {steps.length > 0 ? <SegmentedProgress steps={steps} onCobalt labels style={styles.etaSteps} /> : null}
            </View>
          ) : (
            <View style={[styles.tile, shadows.tile, styles.stateTile]} testID="tracking-headline">
              <StateDisc icon={o.status === 'DELIVERED' ? 'check' : 'close'} tone={o.status === 'DELIVERED' ? 'success' : 'danger'} size={52} />
              <View style={styles.flex}>
                <Text style={styles.stateTitle}>{headline}</Text>
                <Text style={styles.stateSub}>
                  {o.status === 'DELIVERED' && o.deliveredAt ? `Livrée le ${formatDateTime(o.deliveredAt)}` : o.cancelledAt ? `Annulée le ${formatDateTime(o.cancelledAt)}` : ''}
                </Text>
              </View>
            </View>
          )}
          {steps.length > 0 && !liveStage && o.status === 'DELIVERED' ? (
            <View style={[styles.tile, shadows.tile, styles.tilePad]}>
              <SegmentedProgress steps={steps} labels />
            </View>
          ) : null}
          <CancelReason order={o} />
          {shareCard && promptShare ? <View style={[styles.tile, shadows.tile, styles.tilePad]}>{shareCard}</View> : null}
          {o.driver && liveStage ? (
            <View style={[styles.tile, shadows.tile, styles.tilePad]}>
              <DriverCard
                name={o.driver.name}
                vehicleType={o.driver.vehicleType}
                plate={o.driver.plate}
                ratingAvg={o.driver.ratingAvg}
                phone={driverPhone}
                whatsappText={driverWhatsappText({ driver: o.driver.name, businessName, orderNumber: o.number })}
              />
            </View>
          ) : null}
          <View style={[styles.tile, shadows.tile, styles.tilePad]}>
            <RecipientBlock order={o} terminal={isTerminal(o.status)} onCard />
          </View>
          {shareCard && !promptShare ? <View style={[styles.tile, shadows.tile, styles.tilePad]}>{shareCard}</View> : null}
          <View style={[styles.tile, shadows.tile, styles.tilePad]}>
            <Text style={styles.tileTitle}>Montants</Text>
            <AmountsBlock order={o} />
          </View>
          <DeliveredNote order={o} />
          {extra}
          <View style={[styles.tile, shadows.tile, styles.tilePad]}>
            <DisputeBox orderId={o.id} placeholder="Décrivez le problème (retard, colis abîmé…)" />
          </View>
          <TimesLine order={o} />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  waiting: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  actions: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start', paddingTop: spacing.xs },
  link: { color: palette.ink, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  myRating: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  myRatingLabel: { color: palette.ink, fontSize: 14, fontWeight: '700' },
  error: { color: palette.coralText, backgroundColor: palette.coralTint, borderRadius: radii.banner, padding: spacing.md, fontWeight: '700', overflow: 'hidden', textAlign: 'center' },
  center: { alignSelf: 'center' },
  page: { flex: 1, padding: PAGE_PADDING, backgroundColor: palette.canvas },
  deskRow: { flex: 1, flexDirection: 'row', gap: TILE_GAP, marginTop: 16, minHeight: 0 },
  deskMap: { flex: 1, minWidth: 0 },
  deskColumn: { width: 440, flexGrow: 0 },
  deskColumnContent: { gap: TILE_GAP, paddingBottom: 8 },
  tile: { backgroundColor: palette.card, borderRadius: 24 },
  tilePad: { padding: 20, gap: 14 },
  tileTitle: { fontSize: 17, lineHeight: 22, fontWeight: '800', letterSpacing: -0.25, color: palette.ink },
  etaTile: { borderRadius: radii.hero, backgroundColor: palette.cobalt, padding: 24, gap: 4 },
  etaKicker: { fontSize: 14, lineHeight: 18, fontWeight: '600', color: palette.onCobalt2 },
  etaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  etaClock: { fontSize: 64, lineHeight: 64, fontWeight: '800', letterSpacing: -2.6, color: palette.onCobalt, marginLeft: -2, ...tabular },
  etaWord: { fontSize: 32, lineHeight: 38, letterSpacing: -0.8, marginLeft: 0 },
  etaWordSearch: { fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  etaIn: { fontSize: 18, lineHeight: 22, fontWeight: '800', color: palette.onCobalt, ...tabular },
  etaHeadline: { marginTop: 6, fontSize: 15, lineHeight: 20, fontWeight: '700', color: palette.onCobalt },
  etaSub: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: palette.onCobalt2, ...tabular },
  etaSteps: { marginTop: 16 },
  stateTile: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20 },
  stateTitle: { fontSize: 20, lineHeight: 26, fontWeight: '800', letterSpacing: -0.3, color: palette.ink },
  stateSub: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: palette.inkMuted, ...tabular },
});
