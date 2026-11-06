import { useCallback, useState } from 'react';
import { Pressable } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { LABELS, type OrderDto } from '@yaar/shared';
import { Badge, Banner, Button, Card, Empty, Loading, Muted, Row, Screen, Subtitle, Title } from '../../../components/ui';
import { errorMessage } from '../../../lib/api';
import { formatDateTime, formatFcfa, formatOrderNumber, summarizeItems } from '../../../lib/format';
import { useApi } from '../../../state/auth';
import { useSocketEvent } from '../../../state/socket';

const PAGE_SIZE = 20;

/** Historique des commandes du client (pagination « Voir plus »). */
export default function ClientOrdersScreen() {
  const api = useApi();
  const [items, setItems] = useState<OrderDto[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const res = await api.listOrders({ page: p, pageSize: PAGE_SIZE });
        setItems((prev) => (p === 1 ? res.items : [...(prev ?? []), ...res.items]));
        setTotal(res.total);
        setPage(p);
        setError(null);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  useFocusEffect(
    useCallback(() => {
      void load(1);
    }, [load]),
  );
  useSocketEvent('order.updated', () => void load(1));

  return (
    <Screen refreshing={loading} onRefresh={() => void load(1)}>
      <Title>Mes commandes</Title>
      {error ? <Banner message={error} /> : null}
      {items === null && loading ? <Loading /> : null}
      {items?.length === 0 ? <Empty title="Aucune commande pour le moment." /> : null}
      {items?.map((o) => (
        <Pressable key={o.id} onPress={() => router.push(`/client/order/${o.id}`)} accessibilityRole="button">
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <Subtitle style={{ fontSize: 16 }}>
                {formatOrderNumber(o.number)} · {o.store?.name ?? 'Colis'}
              </Subtitle>
              <Badge
                label={LABELS.orderStatus[o.status]}
                tone={o.status === 'DELIVERED' ? 'green' : o.status === 'CANCELLED' ? 'red' : 'orange'}
              />
            </Row>
            <Muted numberOfLines={1}>{o.items.length ? summarizeItems(o.items) : (o.parcelDescription ?? 'Livraison de colis')}</Muted>
            <Row style={{ justifyContent: 'space-between' }}>
              <Muted>{formatDateTime(o.createdAt)}</Muted>
              <Subtitle style={{ fontSize: 15 }}>{formatFcfa(o.total)}</Subtitle>
            </Row>
            {o.canRate ? <Badge label="À NOTER ⭐" tone="orange" /> : null}
          </Card>
        </Pressable>
      ))}
      {items && items.length < total ? (
        <Button title="Voir plus" variant="outline" onPress={() => void load(page + 1)} loading={loading} />
      ) : null}
    </Screen>
  );
}
