import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { OrderDto, SellerStatsDto } from '@yaar/shared';
import { Banner, Card, Empty, KeyValue, Loading, Muted, Row, Screen, SectionTitle, Stat, Title } from '../../../components/ui';
import { errorMessage } from '../../../lib/api';
import { formatFcfa, formatFcfaShort, formatOrderNumber, formatTime } from '../../../lib/format';
import { ordersOfStore } from '../../../lib/sellerOrders';
import { useApi } from '../../../state/auth';
import { useSeller } from '../../../state/seller';
import { colors } from '../../../theme';

function isToday(iso: string, now = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth() && d.getUTCDate() === now.getUTCDate()
  );
}

/** Ventes du jour (heure de Ouagadougou = UTC). */
export default function SellerSalesScreen() {
  const api = useApi();
  const { store } = useSeller();
  const [stats, setStats] = useState<SellerStatsDto | null>(null);
  const [delivered, setDelivered] = useState<OrderDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const storeId = store?.id;

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const [st, list] = await Promise.all([
        api.sellerStats(storeId),
        api.listOrders({ status: ['DELIVERED'], pageSize: 50 }),
      ]);
      setStats(st);
      setDelivered(ordersOfStore(list.items, storeId).filter((o) => o.deliveredAt && isToday(o.deliveredAt)));
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

  if (!store) {
    return (
      <Screen>
        <Title>Ventes</Title>
        <Empty title="Créez d’abord votre boutique." />
      </Screen>
    );
  }

  return (
    <Screen refreshing={loading} onRefresh={() => void load()}>
      <Title>Ventes du jour</Title>
      {error ? <Banner message={error} /> : null}
      {!stats ? <Loading /> : null}
      {stats ? (
        <>
          <Row>
            <Stat value={String(stats.today.orders)} label="Commandes" />
            <Stat value={String(stats.today.delivered)} label="Livrées" color={colors.green} />
            <Stat value={String(stats.today.cancelled)} label="Annulées" color={colors.red} />
          </Row>
          <Card>
            <KeyValue label="Chiffre d’affaires (articles)" value={formatFcfa(stats.today.sales)} strong />
            <KeyValue label="Commission Yaar (livrées)" value={`− ${formatFcfa(stats.today.commission)}`} />
            <KeyValue label="À vous reverser (livrées)" value={formatFcfa(stats.today.payout)} valueColor={colors.green} />
            <KeyValue
              label="Préparation moyenne"
              value={stats.today.avgPrepMinutes !== null ? `${stats.today.avgPrepMinutes} min` : '—'}
            />
            <KeyValue label="Commandes en attente" value={String(stats.pendingOrders)} />
          </Card>
        </>
      ) : null}
      <SectionTitle>Livrées aujourd’hui</SectionTitle>
      {delivered.length === 0 ? <Muted>Aucune commande livrée aujourd’hui.</Muted> : null}
      {delivered.map((o) => (
        <Card key={o.id} style={{ paddingVertical: 10 }}>
          <KeyValue
            label={`${formatOrderNumber(o.number)} · ${o.client?.name ?? 'Client'} · ${o.deliveredAt ? formatTime(o.deliveredAt) : ''}`}
            value={formatFcfaShort(o.sellerPayout ?? o.itemsTotal)}
          />
        </Card>
      ))}
    </Screen>
  );
}
