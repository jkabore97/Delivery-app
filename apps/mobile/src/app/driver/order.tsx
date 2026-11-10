import { useMemo, useState } from 'react';
import { Linking, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '../../components/Text';
import { router } from 'expo-router';
import { formatDistanceFr, formatDurationFr, type AddressDto } from '@yaar/shared';
import { CallRoundButton, WhatsAppRoundButton } from '../../components/design/ContactButtons';
import { Icon } from '../../components/design/Icon';
import { MapIconButton, Pill } from '../../components/design/Pill';
import { RoundButton } from '../../components/design/RoundButton';
import { AmountRow, SurfaceScreen } from '../../components/design/Surfaces';
import { DisputeBox } from '../../components/DisputeBox';
import { AmountLine } from '../../components/driver/DriverKit';
import { SosButton } from '../../components/DriverWidgets';
import { avatarInitials } from '../../components/map/markerArt';
import { FloatingChip, LiveTrackingLayout } from '../../components/tracking/LiveTrackingLayout';
import { Banner } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { amountsToCollect, collectDetail, nextStep, stageCollect } from '../../lib/delivery';
import { confirmAsync } from '../../lib/dialog';
import { formatFcfa, formatOrderNumber, summarizeItems } from '../../lib/format';
import { buildScene, orderSceneInput } from '../../lib/liveScene';
import { externalDirectionsUrl, webDirectionsUrl } from '../../lib/navigation';
import { useApi } from '../../state/auth';
import { useDriver } from '../../state/driver';
import { useOrderRoom } from '../../state/socket';
import { palette, radii, spacing } from '../../theme';

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
    title: 'Ouvrir l’itinéraire ?',
    message:
      'Tant que Yaar n’est pas à l’écran, votre position n’est plus transmise : le destinataire et Yaar verront votre dernière position connue. Revenez dans Yaar dès que possible.',
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

/** Petit téléphone (hauteur < 700 px, ex. 360 × 640) : feuille plus haute, boutons ronds plus petits. */
const SHORT_SCREEN = 700;
/** Hauteur du fondu posé au-dessus du pied de feuille fixé (le contenu qui défile s'y efface, jamais coupé net). */
const FADE = 28;
/**
 * Petit téléphone : nombre de lignes de la cible et de l'adresse ; le repère, lui, n'est jamais coupé et passe juste
 * sous la cible, au-dessus du fondu, même avec un long nom ou une longue adresse.
 */
const SHORT_LINES = 2;

/**
 * Course en cours (comme les applications de coursiers), au dessin Cobalt : carte claire avec l'itinéraire vers la
 * cible de l'étape (entreprise, puis destinataire en épingle à ses initiales), position du livreur animée et suivie,
 * feuille blanche : l'étape en titre fort (« Récupérer » / « Livrer ») avec la distance et le temps restants, la cible,
 * l'adresse et le repère, détail des espèces, colis, instructions ; fixés en bas (jamais à faire défiler, même sur
 * 360 × 640) : les espèces de l'étape en cours en barre SOLEIL (lib/delivery `stageCollect`) et la rangée de boutons
 * ronds (Récupéré / Livré en cobalt, Itinéraire, WhatsApp, Appeler en blanc). Le contenu qui défile s'efface sous un
 * fondu au-dessus de ce pied (aucune ligne coupée net) et sa dernière ligne remonte au-dessus du fondu. Les adresses ne
 * sont visibles que pour le livreur affecté.
 */
export default function DriverOrderScreen() {
  const api = useApi();
  const { currentOrder: o, setCurrentOrder, position, profile, refreshCurrentOrder, refreshProfile, orderNotice, clearOrderNotice } = useDriver();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { height } = useWindowDimensions();
  const short = height < SHORT_SCREEN;
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
      <SurfaceScreen edges={['top', 'bottom']}>
        {orderNotice ? <Banner message={orderNotice} tone="orange" /> : null}
        <View style={styles.empty}>
          <View style={styles.emptyDisc}>
            <Icon name="package" size={40} color={palette.cobaltText} />
          </View>
          <Text style={styles.emptyTitle}>Aucune course en cours.</Text>
          <Pill
            label="Retour"
            icon="back"
            tone="cobalt"
            size="lg"
            onPress={() => {
              clearOrderNotice();
              router.back();
            }}
          />
        </View>
      </SurfaceScreen>
    );
  }

  const pickupStage = o.status === 'ASSIGNED';
  const target = pickupStage ? o.pickup : o.dropoff;
  const storeName = o.store?.name ?? null;
  const targetLabel = pickupStage ? (storeName ?? 'Retrait') : (recipient ?? 'Livraison');
  // Numéro joint par les boutons WhatsApp / Appeler (lu par les lecteurs d'écran dans leur libellé).
  const contactPhone = pickupStage ? (o.store?.phone ?? o.client?.phone ?? null) : (o.recipientPhone ?? o.client?.phone ?? null);
  const contactName = pickupStage ? storeName : recipient;
  const title = pickupStage ? (storeName ?? 'Point de retrait') : `Colis pour ${recipient ?? 'le destinataire'}`;
  const step = nextStep(o, me);
  const metrics = step && step.distanceM !== null && step.minutes !== null ? `${formatDistanceFr(step.distanceM)} · ${formatDurationFr(step.minutes)}` : null;
  const amounts = amountsToCollect(o);
  // Espèces de l'étape en cours : fixées au-dessus des boutons (testID collect-at-pickup / collect-at-dropoff).
  const stageCash = stageCollect(o.status, amounts);
  const num = formatOrderNumber(o.number);
  const hello = firstName(recipient, !!o.recipientIsBusiness);
  const whatsappText = pickupStage
    ? `Bonjour, je suis ${profile?.name ?? 'le livreur'} de Yaar Livraison : j’arrive pour récupérer la course ${num}.`
    : `Bonjour${hello ? ` ${hello}` : ''}, je suis votre livreur Yaar Livraison : j’arrive avec votre colis (${num}).`;
  // Boutons ronds : 84 / 64 px (72 / 48 px, zone tactile de 56, sur un petit téléphone : place au détail).
  const primarySize = short ? 72 : 84;
  const contactSize = short ? 'small' : 'medium';
  const secondaryDiameter = short ? 48 : 64;

  // Repère de la cible : bloc cobalt doux, jamais coupé.
  const landmark = target?.landmark ? (
    <View style={styles.landmark} testID="order-landmark">
      <Icon name="flag" size={16} color={palette.cobaltText} strokeWidth={2.4} />
      <Text style={styles.landmarkText}>
        <Text style={styles.landmarkLabel}>Repère : </Text>
        {target.landmark}
      </Text>
    </View>
  ) : null;

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
      sheetMaxRatio={short ? 0.64 : 0.58}
      topLeft={<MapIconButton icon="back" onPress={() => router.back()} accessibilityLabel="Retour" />}
      // Étape vue par le livreur (et non le statut affiché à l'entreprise, « Livreur en route »).
      topCenter={<FloatingChip testID="driver-order-chip">{`Course ${num} · ${pickupStage ? 'Retrait' : 'Livraison'}`}</FloatingChip>}
      topRight={<SosButton size={48} />}
      testID="driver-order"
      // Fondu blanc sur le bas du contenu qui défile : rien ne paraît coupé net au-dessus du pied fixé.
      fadeBottom={FADE}
      footer={
        <>
          {stageCash ? (
            <AmountRow label={stageCash.label} amount={stageCash.amount} testID={stageCash.at === 'pickup' ? 'collect-at-pickup' : 'collect-at-dropoff'} />
          ) : null}
          <View style={[styles.actions, short && styles.actionsShort]}>
            {pickupStage ? (
              <RoundButton
                label="Récupéré"
                icon="check"
                diameter={primarySize}
                tone="primary"
                slot={primarySize}
                onPress={pickup}
                loading={busy}
                accessibilityLabel={o.type === 'FOOD' ? 'J’ai récupéré la commande' : 'J’ai récupéré le colis'}
                testID="pickup-button"
              />
            ) : (
              <RoundButton
                label="Livré"
                icon="check"
                diameter={primarySize}
                tone="primary"
                slot={primarySize}
                onPress={() => router.push('/driver/deliver')}
                accessibilityLabel="Confirmer la livraison (code du destinataire)"
                testID="go-deliver"
              />
            )}
            {target ? (
              <RoundButton
                label="Itinéraire"
                icon="navigation"
                diameter={secondaryDiameter}
                tone="neutral"
                slot={primarySize}
                onPress={() => openDirections(target, targetLabel)}
                accessibilityLabel={`Itinéraire vers ${targetLabel}`}
                testID="directions-button"
              />
            ) : null}
            <WhatsAppRoundButton
              phone={contactPhone}
              text={whatsappText}
              contactName={contactName}
              size={contactSize}
              slot={primarySize}
              testID="whatsapp-contact"
            />
            <CallRoundButton phone={contactPhone} contactName={contactName} size={contactSize} slot={primarySize} testID="call-contact" />
          </View>
        </>
      }
    >
      {error ? <Banner message={error} /> : null}
      <View style={styles.step} testID="next-step">
        <Text style={styles.stepKicker} testID="step-metrics">
          {pickupStage ? 'Étape 1 sur 2' : 'Étape 2 sur 2'}
          {metrics ? <Text style={styles.stepMetrics}>{` · ${metrics}`}</Text> : null}
        </Text>
        {/* Petit téléphone : l'étape et la cible sur une ligne (« Livrer · Colis pour Awa »), le repère avant l'adresse. */}
        {short ? (
          <Text style={[styles.stepVerb, styles.stepVerbShort]} accessibilityRole="header" numberOfLines={SHORT_LINES}>
            {pickupStage ? 'Récupérer' : 'Livrer'}
            <Text style={styles.targetInline}>{` · ${title}`}</Text>
          </Text>
        ) : (
          <>
            <Text style={styles.stepVerb} accessibilityRole="header">
              {pickupStage ? 'Récupérer' : 'Livrer'}
            </Text>
            <Text style={styles.target}>{title}</Text>
          </>
        )}
        {target ? (
          <View style={[styles.place, short && styles.placeShort]}>
            {/* Petit téléphone : le repère d'abord (jamais sous le fondu), puis l'adresse sur 2 lignes au plus. */}
            {short ? landmark : null}
            <View style={styles.placeRow}>
              <Icon name="pin" size={18} color={palette.ink} strokeWidth={2.3} />
              <Text style={styles.address} numberOfLines={short ? SHORT_LINES : undefined}>
                {target.address}
              </Text>
            </View>
            {short ? null : landmark}
          </View>
        ) : null}
      </View>

      {/* Détail du montant de l'étape (fixé en bas, en soleil), puis, en neutre, ce qui sera à encaisser ensuite. */}
      {stageCash?.detail ? (
        <View style={styles.detailRow} testID="collect-detail">
          <Icon name="cash" size={18} color={palette.amberText} strokeWidth={2.2} />
          <Text style={styles.collectDetail}>
            <Text style={styles.collectDetailAmount}>{formatFcfa(stageCash.amount)}</Text>
            {` : ${stageCash.detail.charAt(0).toLowerCase()}${stageCash.detail.slice(1)}`}
          </Text>
        </View>
      ) : null}
      {pickupStage && amounts.atDropoff > 0 ? (
        <AmountRow
          label="Ensuite, à encaisser auprès du destinataire"
          amount={amounts.atDropoff}
          detail={collectDetail(amounts)}
          tone="text"
          testID="collect-at-dropoff"
        />
      ) : null}
      {amounts.atDropoff > 0 ? null : (
        <View style={styles.detailRow}>
          <Icon name="check" size={18} color={palette.mintText} strokeWidth={2.6} />
          <Text style={styles.muted}>Rien à encaisser auprès du destinataire.</Text>
        </View>
      )}

      {o.parcelDescription || o.items.length > 0 || o.notes ? (
        <View style={styles.block}>
          {o.parcelDescription ? (
            <View style={styles.line}>
              <Icon name="package" size={18} color={palette.inkMuted} />
              <Text style={styles.lineText}>{o.parcelDescription}</Text>
            </View>
          ) : null}
          {o.items.length > 0 ? (
            <View style={styles.line}>
              <Icon name="list" size={18} color={palette.inkMuted} />
              <Text style={styles.lineText}>{summarizeItems(o.items)}</Text>
            </View>
          ) : null}
          {o.notes ? (
            <View style={styles.line}>
              <Icon name="chat" size={18} color={palette.inkMuted} />
              <Text style={styles.notes}>« {o.notes} »</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {pickupStage && o.dropoff ? (
        <View style={styles.detailRow}>
          <Icon name="route" size={18} color={palette.inkMuted} />
          <Text style={styles.muted}>
            Ensuite : livrer à {recipient ?? 'le destinataire'} · {o.dropoff.address}
          </Text>
        </View>
      ) : null}
      {o.driverEarning !== null ? (
        <AmountLine
          label="Votre gain sur cette course"
          amount={o.driverEarning}
          size={20}
          color={palette.cobalt}
          labelStyle={styles.earningLabel}
          testID="order-earning"
        />
      ) : null}
      <DisputeBox orderId={o.id} placeholder="Décrivez le problème (destinataire absent, retrait impossible…)" />
    </LiveTrackingLayout>
  );
}

const styles = StyleSheet.create({
  step: { gap: 6 },
  stepKicker: { fontSize: 14, lineHeight: 19, fontWeight: '700', color: palette.cobaltText, fontVariant: ['tabular-nums'] },
  stepMetrics: { color: palette.ink },
  stepVerb: { fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -0.9, color: palette.ink },
  stepVerbShort: { fontSize: 24, lineHeight: 29, letterSpacing: -0.6 },
  targetInline: { fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
  target: { fontSize: 18, lineHeight: 24, fontWeight: '700', letterSpacing: -0.2, color: palette.ink },
  place: { gap: 8, marginTop: 4 },
  placeShort: { gap: 6, marginTop: 2 },
  placeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  address: { flex: 1, fontSize: 15, lineHeight: 21, fontWeight: '600', color: palette.ink },
  landmark: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.banner,
    backgroundColor: palette.cobaltTint,
  },
  landmarkText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600', color: palette.cobaltText },
  landmarkLabel: { fontWeight: '800' },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  collectDetail: { flex: 1, color: palette.inkMuted, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  collectDetailAmount: { color: palette.amberText, fontWeight: '800', fontVariant: ['tabular-nums'] },
  block: { gap: 12, padding: spacing.lg, borderRadius: 20, backgroundColor: palette.raised },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  lineText: { flex: 1, color: palette.ink, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  // Instructions de l'expéditeur : guillemets français, pas d'italique (la police n'en a pas).
  notes: { flex: 1, color: palette.ink, fontSize: 15, lineHeight: 21, fontWeight: '500' },
  muted: { flex: 1, color: palette.inkMuted, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  earningLabel: { color: palette.inkMuted, fontSize: 14, lineHeight: 19, fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 20, paddingTop: spacing.xs },
  actionsShort: { gap: 14, paddingTop: 0 },
  empty: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xl * 2 },
  emptyDisc: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.cobaltTint },
  emptyTitle: { color: palette.ink, fontSize: 20, lineHeight: 26, fontWeight: '800' },
});
