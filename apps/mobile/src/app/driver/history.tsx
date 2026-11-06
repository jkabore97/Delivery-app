import { Banner, Card, Empty, KeyValue, Loading, Muted, Screen } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { formatDateTime, formatFcfa, formatOrderNumber } from '../../lib/format';
import { useApi } from '../../state/auth';
import { colors } from '../../theme';

/** Courses terminées : montants conservés, adresses et téléphones masqués après livraison (confidentialité). */
export default function DriverHistory() {
  const api = useApi();
  const list = useAsync(() => api.listOrders({ status: ['DELIVERED'], pageSize: 50 }), [api]);
  return (
    <Screen edges={['bottom']} refreshing={list.loading} onRefresh={list.reload}>
      {list.error ? <Banner message={list.error} /> : null}
      {!list.data && list.loading ? <Loading /> : null}
      {list.data?.items.length === 0 ? <Empty title="Aucune course livrée pour le moment." /> : null}
      {list.data?.items.map((o) => (
        <Card key={o.id} style={{ paddingVertical: 10, gap: 2 }}>
          <KeyValue
            label={`${formatOrderNumber(o.number)} · ${o.store?.name ?? 'Colis'}`}
            value={o.driverEarning !== null ? formatFcfa(o.driverEarning) : '—'}
            valueColor={colors.green}
          />
          <Muted>
            {o.deliveredAt ? formatDateTime(o.deliveredAt) : ''} · {o.distanceKm.toString().replace('.', ',')} km
            {o.cashCollected !== null ? ` · encaissé ${formatFcfa(o.cashCollected)}` : ''}
          </Muted>
        </Card>
      ))}
      <Muted>Les adresses des courses terminées ne sont plus affichées (protection des données des clients).</Muted>
    </Screen>
  );
}
