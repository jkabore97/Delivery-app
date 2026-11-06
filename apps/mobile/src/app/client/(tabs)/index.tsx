import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ACTIVE_ORDER_STATUSES, LABELS, type OrderDto, type SavedAddressDto } from '@yaar/shared';
import { AddressPicker } from '../../../components/AddressPicker';
import { Badge, Banner, Button, Card, Chip, Muted, Row, Screen, SectionTitle, Subtitle, Title } from '../../../components/ui';
import { isAddressComplete } from '../../../lib/address';
import { formatFcfa, formatOrderNumber } from '../../../lib/format';
import { useApi, useAuth } from '../../../state/auth';
import { useClientOrder } from '../../../state/cart';
import { useSocketEvent } from '../../../state/socket';
import { colors } from '../../../theme';

export default function ClientHome() {
  const api = useApi();
  const { user } = useAuth();
  const { dropoff, setDropoff } = useClientOrder();
  const [addresses, setAddresses] = useState<SavedAddressDto[]>([]);
  const [active, setActive] = useState<OrderDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.listAddresses().then(setAddresses, () => undefined);
    api
      .listOrders({ status: [...ACTIVE_ORDER_STATUSES], pageSize: 5 })
      .then((p) => setActive(p.items), () => undefined);
  }, [api]);

  useFocusEffect(refresh);
  useSocketEvent('order.updated', refresh);

  const go = (target: '/client/stores' | '/client/parcel') => {
    if (target === '/client/stores' && !isAddressComplete(dropoff)) {
      setError('Indiquez d’abord l’adresse de livraison (quartier, rue).');
      return;
    }
    setError(null);
    router.push(target);
  };

  const firstName = user?.name?.split(' ')[0];
  return (
    <Screen>
      <Muted>Bonjour {firstName ?? ''} 👋</Muted>
      <Title>Où livrer ?</Title>

      {active.map((o) => (
        <Pressable key={o.id} onPress={() => router.push(`/client/order/${o.id}`)} accessibilityRole="button">
          <Card highlight={colors.green}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Subtitle>Commande {formatOrderNumber(o.number)}</Subtitle>
              <Badge label={LABELS.orderStatus[o.status]} tone="green" />
            </Row>
            <Muted>
              {o.store?.name ?? LABELS.orderType[o.type]} · {formatFcfa(o.total)} · Toucher pour suivre
            </Muted>
          </Card>
        </Pressable>
      ))}

      {addresses.length > 0 ? (
        <>
          <SectionTitle>Mes adresses</SectionTitle>
          <Row style={{ flexWrap: 'wrap' }}>
            {addresses.map((a) => (
              <Chip
                key={a.id}
                label={a.label}
                selected={dropoff?.lat === a.lat && dropoff?.lng === a.lng && dropoff?.address === a.address}
                onPress={() => setDropoff({ lat: a.lat, lng: a.lng, address: a.address, landmark: a.landmark })}
              />
            ))}
          </Row>
        </>
      ) : null}

      <AddressPicker value={dropoff} onChange={setDropoff} addressLabel="Adresse de livraison" />
      {isAddressComplete(dropoff) ? (
        <Button
          title="＋ Enregistrer cette adresse"
          variant="ghost"
          small
          onPress={() => router.push('/client/addresses')}
        />
      ) : null}
      {error ? <Banner message={error} /> : null}

      <View style={{ gap: 10 }}>
        <Button title="🍲 Commander un repas ou des courses" onPress={() => go('/client/stores')} />
        <Button title="📦 Envoyer un colis (A → B)" color={colors.orange} onPress={() => go('/client/parcel')} />
      </View>
    </Screen>
  );
}
