import { useState } from 'react';
import { Pressable } from 'react-native';
import { router } from 'expo-router';
import type { StoreDto } from '@yaar/shared';
import { Badge, Banner, Card, Empty, Field, Loading, Muted, Row, Screen, Subtitle, Title } from '../../../components/ui';
import { useAsync } from '../../../hooks/useAsync';
import { formatKm } from '../../../lib/format';
import { useApi } from '../../../state/auth';
import { useClientOrder } from '../../../state/cart';

export default function StoresScreen() {
  const api = useApi();
  const { dropoff } = useClientOrder();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const stores = useAsync(
    () =>
      api.listStores({
        q: query || undefined,
        lat: dropoff?.lat,
        lng: dropoff?.lng,
        pageSize: 50,
      }),
    [api, query, dropoff?.lat, dropoff?.lng],
  );

  return (
    <Screen refreshing={stores.loading} onRefresh={stores.reload}>
      <Title>Boutiques et restaurants</Title>
      <Field
        label="Rechercher"
        placeholder="Nom du restaurant ou de la boutique"
        value={q}
        onChangeText={setQ}
        onSubmitEditing={() => setQuery(q.trim())}
        returnKeyType="search"
      />
      {stores.error ? <Banner message={stores.error} /> : null}
      {!stores.data && stores.loading ? <Loading /> : null}
      {stores.data?.items.length === 0 ? <Empty title="Aucune boutique trouvée." /> : null}
      {stores.data?.items.map((s) => <StoreCard key={s.id} store={s} />)}
    </Screen>
  );
}

function StoreCard({ store }: { store: StoreDto }) {
  return (
    <Pressable onPress={() => router.push(`/client/store/${store.id}`)} accessibilityRole="button">
      <Card style={!store.isOpen ? { opacity: 0.6 } : undefined}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Subtitle style={{ flex: 1 }}>{store.name}</Subtitle>
          <Badge label={store.isOpen ? 'OUVERT' : 'FERMÉ'} tone={store.isOpen ? 'green' : 'grey'} />
        </Row>
        {store.description ? <Muted numberOfLines={2}>{store.description}</Muted> : null}
        <Muted>
          {store.address}
          {store.distanceKm !== null ? ` · ${formatKm(store.distanceKm)}` : ''} · Préparation ~{store.prepTimeMinutes} min
        </Muted>
      </Card>
    </Pressable>
  );
}
