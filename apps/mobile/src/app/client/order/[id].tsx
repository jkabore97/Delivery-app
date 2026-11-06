import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { CLIENT_CANCELLABLE_STATUSES, LABELS, type OrderDto } from '@yaar/shared';
import { DisputeBox } from '../../../components/DisputeBox';
import { OrderMap } from '../../../components/OrderMap';
import { RatingCard, Stars } from '../../../components/Rating';
import {
  Badge,
  Banner,
  Button,
  Card,
  KeyValue,
  Loading,
  Muted,
  Row,
  Screen,
  Subtitle,
} from '../../../components/ui';
import { useAsync } from '../../../hooks/useAsync';
import { errorMessage } from '../../../lib/api';
import { formatDateTime, formatFcfa, formatOrderNumber, initials, summarizeItems } from '../../../lib/format';
import { estimateEtaMinutes, isDriverTracked, progressSteps, trackingTitle } from '../../../lib/orderProgress';
import { telUrl } from '../../../lib/phone';
import { useApi } from '../../../state/auth';
import { useOrderRoom, useSocketEvent } from '../../../state/socket';
import { colors, radius, spacing } from '../../../theme';

export default function ClientOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const order = useAsync(() => api.getOrder(id), [api, id]);
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useOrderRoom(id);
  useSocketEvent('order.updated', (e) => {
    if (e.orderId === id) void order.reload();
  });
  useSocketEvent('driver.location', (e) => {
    if (e.orderId === id) setDriverPos({ lat: e.lat, lng: e.lng });
  });

  const o = order.data;
  if (!o) {
    return <Screen edges={['bottom']}>{order.error ? <Banner message={order.error} /> : <Loading />}</Screen>;
  }

  const tracked = isDriverTracked(o.status);
  const driverPoint = tracked ? (driverPos ?? o.driver?.lastLocation ?? null) : null;
  const eta = estimateEtaMinutes(o, driverPoint);

  const cancel = () => {
    Alert.alert('Annuler la commande', 'Voulez-vous vraiment annuler cette commande ?', [
      { text: 'Non', style: 'cancel' },
      {
        text: 'Oui, annuler',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          setActionError(null);
          try {
            order.setData(await api.cancelOrder(o.id, 'Annulée par le client'));
          } catch (e) {
            setActionError(errorMessage(e));
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  return (
    <Screen edges={['bottom']} refreshing={order.loading} onRefresh={order.reload}>
      <Stack.Screen options={{ title: `Commande ${formatOrderNumber(o.number)}` }} />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Subtitle style={{ flex: 1 }}>{trackingTitle(o.status)}</Subtitle>
          {eta !== null ? <Badge label={`${eta} min`} tone="green" /> : null}
        </Row>
        {o.status !== 'CANCELLED' ? <ProgressSteps order={o} /> : null}
        {o.status === 'CANCELLED' && o.cancelReason ? <Muted>Motif : {o.cancelReason}</Muted> : null}
      </Card>

      {o.pickup || o.dropoff ? (
        <OrderMap pickup={o.pickup} dropoff={o.dropoff} driver={driverPoint} height={240} />
      ) : null}

      {o.driver && tracked ? <DriverCard order={o} /> : null}

      {o.deliveryCode ? (
        <View style={styles.codeBox} accessibilityLabel={`Code de livraison ${o.deliveryCode.split('').join(' ')}`}>
          <Muted>Code à donner au livreur à la réception</Muted>
          <Text style={styles.code}>{o.deliveryCode.split('').join('  ')}</Text>
          <Muted>Ne le communiquez qu’une fois la commande reçue.</Muted>
        </View>
      ) : null}

      <Card>
        {o.store ? <KeyValue label="Boutique" value={o.store.name} /> : <KeyValue label="Type" value={LABELS.orderType[o.type]} />}
        {o.items.length > 0 ? <Muted>{summarizeItems(o.items)}</Muted> : null}
        {o.parcelDescription ? <Muted>Colis : {o.parcelDescription}</Muted> : null}
        {o.dropoff ? (
          <Muted>
            Livraison : {o.dropoff.address}
            {o.dropoff.landmark ? ` · ${o.dropoff.landmark}` : ''}
          </Muted>
        ) : null}
        <KeyValue label="Articles" value={formatFcfa(o.itemsTotal)} />
        <KeyValue label={`Livraison (${LABELS.vehicleType[o.vehicleType]})`} value={formatFcfa(o.deliveryFee)} />
        <KeyValue
          label={o.status === 'DELIVERED' ? 'Payé' : 'À payer à la livraison'}
          value={`💵 ${formatFcfa(o.total)}`}
          strong
        />
        <Muted>Commandée le {formatDateTime(o.createdAt)}</Muted>
      </Card>

      {o.canRate ? (
        <RatingCard
          title="Notez votre livreur"
          onSubmit={async (score, comment) => {
            await api.rateOrder(o.id, { score, ...(comment ? { comment } : {}) });
            await order.reload();
          }}
        />
      ) : null}
      {o.myRating ? (
        <Card>
          <Muted>Votre note</Muted>
          <Stars value={o.myRating} size={22} />
        </Card>
      ) : null}

      {actionError ? <Banner message={actionError} /> : null}
      {CLIENT_CANCELLABLE_STATUSES.includes(o.status) ? (
        <Button title="Annuler la commande" variant="outline" onPress={cancel} loading={cancelling} />
      ) : null}
      <DisputeBox orderId={o.id} />
    </Screen>
  );
}

function ProgressSteps({ order }: { order: OrderDto }) {
  const steps = progressSteps(order.type, order.status);
  return (
    <View style={{ gap: 6 }}>
      <Row gap={6}>
        {steps.map((s) => (
          <View key={s.key} style={[styles.bar, { backgroundColor: s.done ? colors.green : colors.border }]} />
        ))}
      </Row>
      <Muted>
        {steps.map((s, i) => (
          <Text key={s.key} style={s.current ? { color: colors.green, fontWeight: '700' } : undefined}>
            {i > 0 ? ' · ' : ''}
            {s.label}
          </Text>
        ))}
      </Muted>
    </View>
  );
}

function DriverCard({ order }: { order: OrderDto }) {
  const d = order.driver;
  if (!d) return null;
  return (
    <Card>
      <Row>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(d.name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Subtitle style={{ fontSize: 16 }}>
            {d.name ?? 'Votre livreur'} {d.ratingAvg !== null ? `⭐ ${d.ratingAvg.toFixed(1).replace('.', ',')}` : ''}
          </Subtitle>
          <Muted>
            {LABELS.vehicleType[d.vehicleType]}
            {d.plate ? ` · ${d.plate}` : ''} · identité vérifiée ✓
          </Muted>
        </View>
        {d.phone ? (
          <Button title="📞 Appeler" small color={colors.green} onPress={() => void Linking.openURL(telUrl(d.phone!))} />
        ) : null}
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  bar: { flex: 1, height: 5, borderRadius: 3 },
  codeBox: {
    backgroundColor: colors.greenLight,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: 4,
  },
  code: { fontSize: 44, fontWeight: '900', color: colors.green, letterSpacing: 4 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.blueLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontWeight: '800', color: colors.blue },
});
