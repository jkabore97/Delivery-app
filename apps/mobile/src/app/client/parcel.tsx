import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import type { AddressDto, QuoteInput, VehicleType } from '@yaar/shared';
import { AddressPicker } from '../../components/AddressPicker';
import { VehicleOptions } from '../../components/VehicleOptions';
import { Banner, Button, Card, Field, KeyValue, Loading, Muted, Screen, SectionTitle } from '../../components/ui';
import { pickVehicle, useQuote } from '../../hooks/useQuote';
import { isAddressComplete, toAddressInput } from '../../lib/address';
import { errorMessage } from '../../lib/api';
import { formatFcfa, formatKm } from '../../lib/format';
import { normalizePhone } from '../../lib/phone';
import { useApi } from '../../state/auth';
import { useClientOrder } from '../../state/cart';
import { colors } from '../../theme';

export default function ParcelScreen() {
  const api = useApi();
  const { dropoff: homeDropoff } = useClientOrder();
  const [pickup, setPickup] = useState<AddressDto | null>(null);
  const [dropoff, setDropoff] = useState<AddressDto | null>(homeDropoff);
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [vehicle, setVehicle] = useState<VehicleType | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = useMemo<QuoteInput | null>(() => {
    if (!isAddressComplete(pickup) || !isAddressComplete(dropoff)) return null;
    return { type: 'PARCEL', pickup: toAddressInput(pickup), dropoff: toAddressInput(dropoff) };
  }, [pickup, dropoff]);
  const { quote, error: quoteError, loading } = useQuote(input, 900);
  const chosen = quote ? pickVehicle(quote, vehicle) : null;
  const option = quote?.options.find((o) => o.vehicleType === chosen);

  const phoneError = recipientPhone.trim() && !normalizePhone(recipientPhone) ? 'Numéro invalide (8 chiffres).' : null;

  const order = async () => {
    if (!input || !chosen || phoneError) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createOrder({
        ...input,
        vehicleType: chosen,
        paymentMethod: 'CASH',
        ...(recipientName.trim() ? { recipientName: recipientName.trim() } : {}),
        ...(recipientPhone.trim() ? { recipientPhone: recipientPhone.trim() } : {}),
        ...(description.trim() ? { parcelDescription: description.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
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
          color={colors.green}
          onPress={order}
          loading={busy}
          disabled={!option || loading || !!phoneError}
        />
      }
    >
      <SectionTitle>A · Point de retrait</SectionTitle>
      <AddressPicker value={pickup} onChange={setPickup} pinColor={colors.orange} mapHeight={180} addressLabel="Adresse de retrait" />
      <SectionTitle>B · Point de livraison</SectionTitle>
      <AddressPicker value={dropoff} onChange={setDropoff} mapHeight={180} addressLabel="Adresse de livraison" />

      <SectionTitle>Destinataire</SectionTitle>
      <Field label="Nom du destinataire (facultatif)" value={recipientName} onChangeText={setRecipientName} maxLength={80} />
      <Field
        label="Téléphone du destinataire (facultatif)"
        keyboardType="phone-pad"
        value={recipientPhone}
        onChangeText={setRecipientPhone}
        error={phoneError}
        maxLength={20}
      />
      <Field
        label="Contenu du colis"
        placeholder="Ex. enveloppe de documents"
        value={description}
        onChangeText={setDescription}
        maxLength={300}
      />
      <Field label="Instructions pour le livreur (facultatif)" value={notes} onChangeText={setNotes} maxLength={300} />

      <SectionTitle>Véhicule</SectionTitle>
      {!input ? <Muted>Renseignez les deux adresses pour voir les prix.</Muted> : null}
      {loading && !quote ? <Loading label="Calcul du prix…" /> : null}
      {quote ? <VehicleOptions options={quote.options} selected={chosen} onSelect={setVehicle} /> : null}
      {quoteError ? <Banner message={quoteError} /> : null}
      {quote && option ? (
        <Card>
          <KeyValue label="Distance" value={formatKm(quote.distanceKm)} />
          <KeyValue label="Durée estimée" value={`~${option.estimatedMinutes} min`} />
          <KeyValue label="Total (espèces)" value={formatFcfa(option.total)} strong />
        </Card>
      ) : null}
      {error ? <Banner message={error} /> : null}
    </Screen>
  );
}
