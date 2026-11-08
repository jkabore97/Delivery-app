import { useCallback, useState } from 'react';
import { Pressable } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { OrderDto } from '@yaar/shared';
import { Badge, Banner, Button, Card, Empty, KeyValue, Loading, Muted, Row, Screen, Subtitle, Title } from '../../../components/ui';
import { errorMessage } from '../../../lib/api';
import { BUSINESS_HISTORY_STATUSES, businessStatusLabel, FEE_PAYER_LABELS } from '../../../lib/delivery';
import { formatDateTime, formatFcfa, formatOrderNumber } from '../../../lib/format';
import { useApi } from '../../../state/auth';

const PAGE_SIZE = 20;

/** Onglet « Historique » : livraisons terminées (livrées ou annulées), « Voir plus » pour la suite. */
export default function BusinessHistoryScreen() {
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
        const res = await api.listDeliveries({ status: BUSINESS_HISTORY_STATUSES, page: p, pageSize: PAGE_SIZE });
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

  return (
    <Screen refreshing={loading} onRefresh={() => void load(1)}>
      <Title>Historique</Title>
      {error ? <Banner message={error} /> : null}
      {items === null && loading ? <Loading /> : null}
      {items?.length === 0 ? <Empty title="Aucune livraison terminée pour le moment." /> : null}
      {items?.map((o) => {
        const badge = businessStatusLabel(o.status);
        const when = o.deliveredAt ?? o.cancelledAt ?? o.createdAt;
        return (
          <Pressable key={o.id} onPress={() => router.push(`/business/livraison/${o.id}`)} accessibilityRole="button">
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <Subtitle style={{ fontSize: 16, flex: 1 }}>
                  {formatOrderNumber(o.number)} · {o.recipientName ?? 'Destinataire'}
                </Subtitle>
                <Badge label={badge.label} tone={badge.tone} />
              </Row>
              {o.parcelDescription ? <Muted numberOfLines={1}>📦 {o.parcelDescription}</Muted> : null}
              <KeyValue
                label={formatDateTime(when)}
                value={`${formatFcfa(o.deliveryFee)}${o.feePaidBy ? ` · ${FEE_PAYER_LABELS[o.feePaidBy].title.toLowerCase()}` : ''}`}
              />
              {o.status === 'DELIVERED' && (o.cashToCollect ?? 0) > 0 ? (
                <Muted>Encaissé auprès du destinataire : {formatFcfa(o.cashToCollect ?? 0)}</Muted>
              ) : null}
              {o.status === 'CANCELLED' && o.cancelReason ? <Muted>Motif : {o.cancelReason}</Muted> : null}
            </Card>
          </Pressable>
        );
      })}
      {items && items.length < total ? (
        <Button title="Voir plus" variant="outline" onPress={() => void load(page + 1)} loading={loading} />
      ) : null}
      <Muted>Les adresses des livraisons terminées ne sont plus affichées (protection des données des destinataires).</Muted>
    </Screen>
  );
}
