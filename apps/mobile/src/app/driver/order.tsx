import { useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LABELS, type AddressDto } from '@yaar/shared';
import { DisputeBox } from '../../components/DisputeBox';
import { SosButton } from '../../components/DriverWidgets';
import { FloatingButton, FloatingChip, LiveTrackingLayout } from '../../components/tracking/LiveTrackingLayout';
import { AmountBox } from '../../components/tracking/TrackingParts';
import { Banner, Button, Empty, KeyValue, Muted, Row, Screen } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { amountsToCollect, collectDetail, nextStep } from '../../lib/delivery';
import { confirmAsync } from '../../lib/dialog';
import { formatFcfa, formatOrderNumber, summarizeItems } from '../../lib/format';
import { buildScene, orderSceneInput } from '../../lib/liveScene';
import { externalDirectionsUrl, webDirectionsUrl } from '../../lib/navigation';
import { formatPhone, telUrl } from '../../lib/phone';
import { useApi } from '../../state/auth';
import { useDriver } from '../../state/driver';
import { useOrderRoom } from '../../state/socket';
import { colors, radius, spacing } from '../../theme';

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

/**
 * Course en cours (comme l'application livreur d'Uber) : carte avec l'itinéraire vers la cible de l'étape
 * (entreprise, puis destinataire), position du livreur animée et suivie, carte « prochaine étape », montants à
 * encaisser et boutons d'action. Les adresses ne sont visibles que pour le livreur affecté.
 */
export default function DriverOrderScreen() {
  const api = useApi();
  const { currentOrder: o, setCurrentOrder, position, refreshCurrentOrder, refreshProfile, orderNotice, clearOrderNotice } = useDriver();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useOrderRoom(o?.id);

  const me = position ? { lat: position.lat, lng: position.lng, heading: position.heading ?? null } : null;
  const scene = useMemo(() => (o ? buildScene(orderSceneInput(o, me)) : null), [o, me?.lat, me?.lng, me?.heading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!o || !scene) {
    return (
      <Screen edges={['bottom']}>
        {orderNotice ? <Banner message={orderNotice} tone="orange" /> : null}
        <Empty title="Aucune course en cours.">
          <Button
            title="Retour"
            color={colors.blue}
            onPress={() => {
              clearOrderNotice();
              router.back();
            }}
          />
        </Empty>
      </Screen>
    );
  }

  const pickupStage = o.status === 'ASSIGNED';
  const target = pickupStage ? o.pickup : o.dropoff;
  const targetLabel = pickupStage ? (o.store?.name ?? 'Retrait') : (o.recipientName ?? o.client?.name ?? 'Livraison');
  const contactPhone = pickupStage ? (o.store?.phone ?? o.client?.phone) : (o.recipientPhone ?? o.client?.phone);
  const contactName = pickupStage ? (o.store?.name ?? o.client?.name ?? 'Expéditeur') : (o.recipientName ?? o.client?.name ?? 'Destinataire');
  const step = nextStep(o, me);
  const amounts = amountsToCollect(o);

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
      topLeft={<FloatingButton label="←" onPress={() => router.back()} accessibilityLabel="Retour" />}
      topCenter={<FloatingChip>{`Course ${formatOrderNumber(o.number)} · ${LABELS.orderStatus[o.status]}`}</FloatingChip>}
      topRight={<SosButton size={46} />}
      testID="driver-order"
      footer={
        pickupStage ? (
          <Button
            title={o.type === 'FOOD' ? 'J’ai récupéré la commande' : 'J’ai récupéré le colis'}
            color={colors.blue}
            onPress={pickup}
            loading={busy}
            testID="pickup-button"
          />
        ) : (
          <Button title="Confirmer la livraison" color={colors.blue} onPress={() => router.push('/driver/deliver')} testID="go-deliver" />
        )
      }
    >
      <View style={styles.next} testID="next-step">
        <Text style={styles.nextKicker}>{pickupStage ? '1 · RÉCUPÉRER' : '2 · LIVRER'}</Text>
        <Text style={styles.nextTitle}>{step?.line ?? targetLabel}</Text>
        {target ? (
          <Muted>
            {target.address}
            {target.landmark ? ` · Repère : ${target.landmark}` : ''}
          </Muted>
        ) : null}
        <Row>
          {target ? (
            <Button title="🧭 Itinéraire" small color={colors.blue} style={{ flex: 1 }} onPress={() => openDirections(target, targetLabel)} />
          ) : null}
          {contactPhone ? (
            <Button
              title={`📞 ${contactName}`}
              small
              variant="outline"
              style={{ flex: 1 }}
              onPress={() => void Linking.openURL(telUrl(contactPhone))}
            />
          ) : null}
        </Row>
        {contactPhone ? <Muted>{formatPhone(contactPhone)}</Muted> : null}
      </View>

      {pickupStage && amounts.atPickup > 0 ? (
        <AmountBox
          label="À encaisser auprès de l’entreprise"
          amount={amounts.atPickup}
          detail="Frais de livraison payés au retrait."
          testID="collect-at-pickup"
        />
      ) : null}
      {amounts.atDropoff > 0 ? (
        <AmountBox
          label={pickupStage ? 'Ensuite, à encaisser auprès du destinataire' : 'À encaisser auprès du destinataire'}
          amount={amounts.atDropoff}
          detail={collectDetail(amounts)}
          testID="collect-at-dropoff"
        />
      ) : (
        <Muted>Rien à encaisser auprès du destinataire.</Muted>
      )}

      {pickupStage && o.dropoff ? (
        <Muted>
          Ensuite : livrer à {o.recipientName ?? 'le destinataire'} · {o.dropoff.address}
        </Muted>
      ) : null}

      <View style={styles.block}>
        {o.items.length > 0 ? <Muted>{summarizeItems(o.items)}</Muted> : null}
        {o.parcelDescription ? <KeyValue label="Colis" value={o.parcelDescription} /> : null}
        {o.notes ? <Muted>Instructions : {o.notes}</Muted> : null}
        {o.driverEarning !== null ? <KeyValue label="Votre gain" value={formatFcfa(o.driverEarning)} valueColor={colors.green} /> : null}
      </View>
      {error ? <Banner message={error} /> : null}
      <DisputeBox orderId={o.id} color={colors.blue} placeholder="Décrivez le problème (destinataire absent, retrait impossible…)" />
    </LiveTrackingLayout>
  );
}

const styles = StyleSheet.create({
  next: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.blue,
    backgroundColor: colors.blueLight,
  },
  nextKicker: { fontSize: 12, fontWeight: '900', color: colors.blue, letterSpacing: 0.5 },
  nextTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  block: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
});
