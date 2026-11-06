import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { QuoteInput, VehicleType } from '@yaar/shared';
import { Stepper } from '../../components/Stepper';
import { VehicleOptions } from '../../components/VehicleOptions';
import {
  Banner,
  Body,
  Button,
  Card,
  Empty,
  Field,
  KeyValue,
  Loading,
  Muted,
  Row,
  Screen,
  SectionTitle,
  Subtitle,
} from '../../components/ui';
import { pickVehicle, useQuote } from '../../hooks/useQuote';
import { addressLine, isAddressComplete, toAddressInput } from '../../lib/address';
import { errorMessage } from '../../lib/api';
import { cartItemsTotal, cartToOrderItems } from '../../lib/cart';
import { formatFcfa, formatKm } from '../../lib/format';
import { useApi } from '../../state/auth';
import { useClientOrder } from '../../state/cart';
import { colors } from '../../theme';

export default function CheckoutScreen() {
  const api = useApi();
  const { cart, dispatch, dropoff } = useClientOrder();
  const [vehicle, setVehicle] = useState<VehicleType | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = useMemo<QuoteInput | null>(() => {
    if (!cart.storeId || cart.lines.length === 0 || !isAddressComplete(dropoff)) return null;
    return { type: 'FOOD', storeId: cart.storeId, items: cartToOrderItems(cart), dropoff: toAddressInput(dropoff) };
  }, [cart, dropoff]);
  const { quote, error: quoteError, loading } = useQuote(input);
  const chosen = quote ? pickVehicle(quote, vehicle) : null;
  const option = quote?.options.find((o) => o.vehicleType === chosen);

  if (cart.lines.length === 0) {
    return (
      <Screen edges={['bottom']}>
        <Empty title="Votre panier est vide.">
          <Button title="Voir les boutiques" onPress={() => router.replace('/client/stores')} />
        </Empty>
      </Screen>
    );
  }

  const order = async () => {
    if (!input || !chosen) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createOrder({
        ...input,
        vehicleType: chosen,
        paymentMethod: 'CASH',
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      dispatch({ type: 'clear' });
      router.dismissAll();
      router.push(`/client/order/${created.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      edges={['bottom']}
      footer={
        <Button
          title={option ? `Commander · ${formatFcfa(option.total)}` : 'Commander'}
          onPress={order}
          loading={busy}
          disabled={!option || loading}
          testID="order-button"
        />
      }
    >
      <Card>
        <Row style={{ alignItems: 'flex-start' }}>
          <Body style={{ color: colors.orange }}>●</Body>
          <View style={{ flex: 1 }}>
            <Subtitle style={{ fontSize: 16 }}>{cart.storeName}</Subtitle>
            {quote ? <Muted>{quote.pickup.address}</Muted> : null}
          </View>
        </Row>
        <Row style={{ alignItems: 'flex-start' }}>
          <Body style={{ color: colors.green }}>●</Body>
          <View style={{ flex: 1 }}>
            {isAddressComplete(dropoff) ? (
              <>
                <Subtitle style={{ fontSize: 16 }}>{dropoff.address}</Subtitle>
                {dropoff.landmark ? <Muted>Repère : {dropoff.landmark}</Muted> : null}
              </>
            ) : (
              <Muted style={{ color: colors.red }}>Adresse de livraison manquante</Muted>
            )}
          </View>
          <Button title="Modifier" variant="ghost" small onPress={() => router.navigate('/client')} />
        </Row>
      </Card>

      <SectionTitle>Panier</SectionTitle>
      <Card>
        {cart.lines.map((l) => (
          <Row key={l.productId} style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Body>{l.name}</Body>
              <Muted>{formatFcfa(l.unitPrice * l.quantity)}</Muted>
            </View>
            <Stepper
              quantity={l.quantity}
              onAdd={() => dispatch({ type: 'setQuantity', productId: l.productId, quantity: l.quantity + 1 })}
              onRemove={() => dispatch({ type: 'decrement', productId: l.productId })}
            />
          </Row>
        ))}
      </Card>

      <SectionTitle>Véhicule</SectionTitle>
      {loading && !quote ? <Loading label="Calcul du prix…" /> : null}
      {quote ? <VehicleOptions options={quote.options} selected={chosen} onSelect={setVehicle} /> : null}
      {quoteError ? <Banner message={quoteError} /> : null}

      <Field
        label="Instructions pour le livreur (facultatif)"
        placeholder="Ex. appeler en arrivant"
        value={notes}
        onChangeText={setNotes}
        maxLength={300}
      />

      <Card>
        <KeyValue label="Articles" value={formatFcfa(cartItemsTotal(cart))} />
        <KeyValue label="Livraison" value={option ? formatFcfa(option.deliveryFee) : '…'} />
        {quote ? (
          <Muted>
            {formatKm(quote.distanceKm)}
            {option ? ` · ~${option.estimatedMinutes} min de trajet` : ''}
          </Muted>
        ) : null}
        <KeyValue label="Total" value={option ? formatFcfa(option.total) : '…'} strong />
        <Muted>Paiement : 💵 Espèces à la livraison (mobile money bientôt disponible).</Muted>
        {isAddressComplete(dropoff) ? <Muted>Livraison : {addressLine(dropoff)}</Muted> : null}
      </Card>
      {error ? <Banner message={error} /> : null}
    </Screen>
  );
}
