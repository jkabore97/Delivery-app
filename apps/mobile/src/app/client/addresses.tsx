import { useState } from 'react';
import { Alert } from 'react-native';
import { Banner, Button, Card, Empty, Field, Loading, Muted, Row, Screen, SectionTitle, Subtitle } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { addressLine, isAddressComplete, toAddressInput } from '../../lib/address';
import { errorMessage } from '../../lib/api';
import { useApi } from '../../state/auth';
import { useClientOrder } from '../../state/cart';

/** Adresses enregistrées (Maison, Bureau...) : ajout depuis l'adresse choisie sur l'accueil. */
export default function AddressesScreen() {
  const api = useApi();
  const { dropoff, setDropoff } = useClientOrder();
  const list = useAsync(() => api.listAddresses(), [api]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!isAddressComplete(dropoff)) return;
    setBusy(true);
    setError(null);
    try {
      await api.createAddress({ label: label.trim(), ...toAddressInput(dropoff) });
      setLabel('');
      await list.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string) =>
    Alert.alert('Supprimer', 'Supprimer cette adresse ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteAddress(id);
            await list.reload();
          } catch (e) {
            setError(errorMessage(e));
          }
        },
      },
    ]);

  return (
    <Screen edges={['bottom']} refreshing={list.loading} onRefresh={list.reload}>
      <SectionTitle>Enregistrer l’adresse actuelle</SectionTitle>
      {isAddressComplete(dropoff) ? (
        <Card>
          <Muted>{addressLine(dropoff)}</Muted>
          <Field label="Nom de l’adresse" placeholder="Maison, Bureau…" value={label} onChangeText={setLabel} maxLength={40} />
          <Button title="Enregistrer" onPress={save} loading={busy} disabled={!label.trim()} />
        </Card>
      ) : (
        <Muted>Choisissez d’abord une adresse sur l’accueil (épingle + adresse).</Muted>
      )}
      {error ? <Banner message={error} /> : null}

      <SectionTitle>Mes adresses</SectionTitle>
      {!list.data && list.loading ? <Loading /> : null}
      {list.data?.length === 0 ? <Empty title="Aucune adresse enregistrée." /> : null}
      {list.data?.map((a) => (
        <Card key={a.id}>
          <Subtitle style={{ fontSize: 16 }}>{a.label}</Subtitle>
          <Muted>{addressLine(a)}</Muted>
          <Row>
            <Button
              title="Livrer ici"
              small
              onPress={() => setDropoff({ lat: a.lat, lng: a.lng, address: a.address, landmark: a.landmark })}
            />
            <Button title="Supprimer" small variant="outline" onPress={() => remove(a.id)} />
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
