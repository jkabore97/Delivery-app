import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Banner, Button, Card, Loading, Muted, Row, Screen, SectionTitle, Subtitle, Title } from '../../../components/ui';
import { Stepper } from '../../../components/Stepper';
import { useAsync } from '../../../hooks/useAsync';
import { groupByCategory } from '../../../lib/catalog';
import { cartCount, cartItemsTotal, quantityOf } from '../../../lib/cart';
import { formatFcfa, formatFcfaShort } from '../../../lib/format';
import { useApi } from '../../../state/auth';
import type { ProductDto } from '@yaar/shared';
import { useClientOrder } from '../../../state/cart';
import { colors } from '../../../theme';
import { confirmAsync } from '../../../lib/dialog';

export default function StoreMenuScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const { cart, dispatch } = useClientOrder();
  const store = useAsync(() => api.getStore(id), [api, id]);
  const groups = useMemo(() => groupByCategory(store.data?.products ?? []), [store.data]);

  if (!store.data) {
    return (
      <Screen edges={[]}>{store.error ? <Banner message={store.error} /> : <Loading />}</Screen>
    );
  }
  const s = store.data;
  const inThisStore = cart.storeId === s.id;
  const count = inThisStore ? cartCount(cart) : 0;

  const add = (p: ProductDto) => {
    const doAdd = () => dispatch({ type: 'add', storeId: s.id, storeName: s.name, product: p });
    if (cart.storeId && !inThisStore && cart.lines.length > 0) {
      void confirmAsync({
        title: 'Nouveau panier ?',
        message: `Votre panier de ${cart.storeName ?? 'l’autre boutique'} sera vidé.`,
        confirmText: 'Vider et ajouter',
        destructive: true,
      }).then((ok) => {
        if (ok) doAdd();
      });
      return;
    }
    doAdd();
  };

  return (
    <Screen
      edges={['bottom']}
      refreshing={store.loading}
      onRefresh={store.reload}
      footer={
        count > 0 ? (
          <Button
            title={`Voir le panier · ${count} article(s) · ${formatFcfa(cartItemsTotal(cart))}`}
            onPress={() => router.push('/client/checkout')}
          />
        ) : undefined
      }
    >
      <Stack.Screen options={{ title: s.name }} />
      <Title>{s.name}</Title>
      <Muted>
        {s.address}
        {s.landmark ? ` · ${s.landmark}` : ''}
      </Muted>
      <Muted>
        {s.openingHours ? `${s.openingHours} · ` : ''}Préparation ~{s.prepTimeMinutes} min
      </Muted>
      {!s.isOpen ? <Banner message="Cette boutique est fermée pour le moment." tone="orange" /> : null}
      {cart.storeId && !inThisStore && cart.lines.length > 0 ? (
        <Banner message={`Votre panier contient des articles de ${cart.storeName}. Ajouter ici videra ce panier.`} tone="orange" />
      ) : null}
      {groups.map((g) => (
        <View key={g.category} style={{ gap: 8 }}>
          <SectionTitle>{g.category}</SectionTitle>
          {g.items.map((p) => {
            const qty = inThisStore ? quantityOf(cart, p.id) : 0;
            return (
              <Card key={p.id} style={{ paddingVertical: 12 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Subtitle style={{ fontSize: 16 }}>{p.name}</Subtitle>
                    {p.description ? <Muted numberOfLines={2}>{p.description}</Muted> : null}
                    <Text style={styles.price}>{formatFcfaShort(p.price)}</Text>
                  </View>
                  <Stepper
                    quantity={qty}
                    disabled={!s.isOpen || !p.isAvailable}
                    onAdd={() => add(p)}
                    onRemove={() => dispatch({ type: 'decrement', productId: p.id })}
                  />
                </Row>
              </Card>
            );
          })}
        </View>
      ))}
      {groups.length === 0 ? <Muted>Aucun produit disponible.</Muted> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  price: { fontSize: 15, fontWeight: '700', color: colors.green, marginTop: 4 },
});
