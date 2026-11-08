import { useState } from 'react';
import { Linking, View } from 'react-native';
import { router } from 'expo-router';
import { LABELS, type AddressDto } from '@yaar/shared';
import { DisputeBox } from '../../components/DisputeBox';
import { SosButton } from '../../components/DriverWidgets';
import { OrderMap } from '../../components/OrderMap';
import { Banner, Button, Card, Dot, Empty, KeyValue, Muted, Row, Screen, SectionTitle, Subtitle } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { formatFcfa, formatOrderNumber, summarizeItems } from '../../lib/format';
import { externalDirectionsUrl, webDirectionsUrl } from '../../lib/navigation';
import { formatPhone, telUrl } from '../../lib/phone';
import { useApi } from '../../state/auth';
import { useDriver } from '../../state/driver';
import { useOrderRoom } from '../../state/socket';
import { colors } from '../../theme';
import { confirmAsync } from '../../lib/dialog';

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
      'Tant que Yaar n’est pas à l’écran, votre position n’est plus transmise : le client et Yaar verront votre dernière position connue. Revenez dans Yaar dès que possible.',
    cancelText: 'Rester dans Yaar',
    confirmText: 'Ouvrir le GPS',
  }).then((ok) => {
    if (ok) void launchDirections(dest, label);
  });
}

/** Course en cours : retrait puis livraison (adresses visibles uniquement pour le livreur affecté). */
export default function DriverOrderScreen() {
  const api = useApi();
  const { currentOrder: o, setCurrentOrder, position, refreshCurrentOrder, orderNotice, clearOrderNotice } = useDriver();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  useOrderRoom(o?.id);

  if (!o) {
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
  const contactName = pickupStage
    ? (o.store ? o.store.name : (o.client?.name ?? 'Expéditeur'))
    : (o.recipientName ?? o.client?.name ?? 'Client');

  const pickup = async () => {
    setBusy(true);
    setError(null);
    try {
      setCurrentOrder(await api.pickupOrder(o.id));
    } catch (e) {
      setError(errorMessage(e));
      void refreshCurrentOrder();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen
        edges={['bottom']}
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          await refreshCurrentOrder();
          setRefreshing(false);
        }}
        footer={
          pickupStage ? (
            <Button
              title={o.type === 'FOOD' ? 'J’ai récupéré la commande' : 'J’ai récupéré le colis'}
              color={colors.blue}
              onPress={pickup}
              loading={busy}
            />
          ) : (
            <Button title="Confirmer la livraison" color={colors.blue} onPress={() => router.push('/driver/deliver')} />
          )
        }
      >
        <Row style={{ justifyContent: 'space-between' }}>
          <Subtitle>
            Course {formatOrderNumber(o.number)} · {LABELS.orderStatus[o.status]}
          </Subtitle>
          <SosButton />
        </Row>
        <OrderMap pickup={o.pickup} dropoff={o.dropoff} me={position} height={220} />

        <Card highlight={colors.blue}>
          <SectionTitle>{pickupStage ? '1. Récupérer' : '2. Livrer'}</SectionTitle>
          <Row style={{ alignItems: 'flex-start' }}>
            <Dot color={pickupStage ? colors.orange : colors.green} />
            <View style={{ flex: 1, gap: 2 }}>
              <Subtitle style={{ fontSize: 16 }}>{targetLabel}</Subtitle>
              {target ? <Muted>{target.address}</Muted> : null}
              {target?.landmark ? <Muted>Repère : {target.landmark}</Muted> : null}
            </View>
          </Row>
          <Row>
            {target ? (
              <Button
                title="🧭 Itinéraire"
                small
                color={colors.blue}
                style={{ flex: 1 }}
                onPress={() => openDirections(target, targetLabel)}
              />
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
        </Card>

        {!pickupStage && o.pickup ? (
          <Muted>Retrait effectué : {o.store?.name ?? o.pickup.address}</Muted>
        ) : o.dropoff ? (
          <Muted>Ensuite : livrer à {o.dropoff.address}</Muted>
        ) : null}

        <Card>
          {o.items.length > 0 ? <Muted>{summarizeItems(o.items)}</Muted> : null}
          {o.parcelDescription ? <Muted>Colis : {o.parcelDescription}</Muted> : null}
          {o.notes ? <Muted>Instructions : {o.notes}</Muted> : null}
          {o.paymentMethod === 'CASH' ? (
            <KeyValue label="💵 Espèces à encaisser" value={formatFcfa(o.total)} strong valueColor={colors.orange} />
          ) : null}
          {o.driverEarning !== null ? (
            <KeyValue label="Votre gain" value={formatFcfa(o.driverEarning)} valueColor={colors.green} />
          ) : null}
        </Card>
        {error ? <Banner message={error} /> : null}
        <DisputeBox orderId={o.id} color={colors.blue} placeholder="Décrivez le problème (client absent, retrait impossible…)" />
      </Screen>
    </View>
  );
}
