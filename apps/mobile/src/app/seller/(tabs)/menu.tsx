import { useCallback, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { ProductDto } from '@yaar/shared';
import { Banner, Button, Card, Empty, Loading, Muted, Row, Screen, SectionTitle, Subtitle, Title } from '../../../components/ui';
import { errorMessage } from '../../../lib/api';
import { groupByCategory } from '../../../lib/catalog';
import { formatFcfaShort } from '../../../lib/format';
import { useApi } from '../../../state/auth';
import { useSeller } from '../../../state/seller';
import { colors } from '../../../theme';

/** Catalogue : prix, disponibilité (interrupteur), ajout / modification. */
export default function SellerMenuScreen() {
  const api = useApi();
  const { store } = useSeller();
  const [products, setProducts] = useState<ProductDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const storeId = store?.id;

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      setProducts(await api.sellerProducts(storeId));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [api, storeId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const toggle = async (p: ProductDto, isAvailable: boolean) => {
    setProducts((prev) => prev?.map((x) => (x.id === p.id ? { ...x, isAvailable } : x)) ?? prev);
    try {
      const updated = await api.updateProduct(p.id, { isAvailable });
      setProducts((prev) => prev?.map((x) => (x.id === p.id ? updated : x)) ?? prev);
    } catch (e) {
      setError(errorMessage(e));
      setProducts((prev) => prev?.map((x) => (x.id === p.id ? p : x)) ?? prev);
    }
  };

  if (!store) {
    return (
      <Screen>
        <Title>Menu</Title>
        <Empty title="Créez d’abord votre boutique (onglet Boutique)." />
      </Screen>
    );
  }

  return (
    <Screen
      refreshing={loading}
      onRefresh={() => void load()}
      footer={<Button title="＋ Ajouter un produit" color={colors.orange} onPress={() => router.push('/seller/product')} />}
    >
      <Title>Menu · {store.name}</Title>
      {error ? <Banner message={error} /> : null}
      {products === null ? <Loading /> : null}
      {products?.length === 0 ? <Empty title="Aucun produit. Ajoutez votre premier plat ou article." /> : null}
      {groupByCategory(products ?? []).map((g) => (
        <View key={g.category} style={{ gap: 8 }}>
          <SectionTitle>{g.category}</SectionTitle>
          {g.items.map((p) => (
            <Card key={p.id} style={{ paddingVertical: 12 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Pressable
                  style={{ flex: 1 }}
                  onPress={() => router.push({ pathname: '/seller/product', params: { id: p.id } })}
                  accessibilityRole="button"
                  accessibilityHint="Modifier le produit"
                >
                  <Subtitle style={{ fontSize: 16, opacity: p.isAvailable ? 1 : 0.5 }}>{p.name}</Subtitle>
                  <Muted>
                    {formatFcfaShort(p.price)} · {p.isAvailable ? 'Disponible' : 'Indisponible'} · Modifier ›
                  </Muted>
                </Pressable>
                <Switch
                  value={p.isAvailable}
                  onValueChange={(v) => void toggle(p, v)}
                  trackColor={{ true: colors.orange, false: colors.border }}
                  accessibilityLabel={`Disponibilité de ${p.name}`}
                />
              </Row>
            </Card>
          ))}
        </View>
      ))}
    </Screen>
  );
}
