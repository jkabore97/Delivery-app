import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Text } from '../../components/Text';
import { Icon } from '../../components/design/Icon';
import { ScreenHeader, SurfaceScreen } from '../../components/design/Surfaces';
import { IconDisc, ListRow, shortDateTime, WhiteCard } from '../../components/driver/DriverKit';
import { avatarInitials } from '../../components/map/markerArt';
import { Banner } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { formatFcfa, formatKm, formatOrderNumber } from '../../lib/format';
import { useApi } from '../../state/auth';
import { palette, spacing } from '../../theme';

/** Pastille de l'entreprise (initiales, cobalt doux) ; sans entreprise : pictogramme du colis. */
function Avatar({ name, testID }: { name: string | null; testID: string }) {
  const letters = avatarInitials(name);
  if (!letters) return <IconDisc icon="package" tone="cobalt" size={44} style={styles.avatarIcon} />;
  return (
    <View style={styles.avatar} testID={`${testID}-avatar`}>
      <Text style={styles.avatarText}>{letters}</Text>
    </View>
  );
}

/**
 * Courses terminées (Cobalt) : une carte blanche en liste à filets (pastille, entreprise, numéro et distance, gain en
 * grands chiffres, date, espèces encaissées). Montants conservés, adresses et téléphones masqués après livraison
 * (confidentialité).
 */
export default function DriverHistory() {
  const api = useApi();
  const list = useAsync(() => api.listOrders({ status: ['DELIVERED'], pageSize: 50 }), [api]);
  const items = list.data?.items ?? [];
  const count = list.data?.total ?? items.length;
  return (
    <SurfaceScreen
      edges={['top', 'bottom']}
      header={
        <ScreenHeader
          title="Mes courses"
          subtitle={list.data ? `${count} course${count > 1 ? 's' : ''} livrée${count > 1 ? 's' : ''}` : null}
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/driver/profile'))}
        />
      }
    >
      {list.error ? <Banner message={list.error} /> : null}
      {!list.data && list.loading ? <ActivityIndicator color={palette.cobalt} size="large" style={styles.loading} /> : null}
      {list.data && items.length === 0 ? (
        <WhiteCard style={styles.empty}>
          <IconDisc icon="package" tone="cobalt" size={56} />
          <Text style={styles.emptyText}>Aucune course livrée pour le moment.</Text>
        </WhiteCard>
      ) : null}
      {items.length > 0 ? (
        <WhiteCard style={styles.list}>
          {items.map((o, i) => {
            const testID = `history-${o.id}`;
            const meta = [formatOrderNumber(o.number), formatKm(o.distanceKm)].join(' · ');
            const cash = o.cashCollected !== null && o.cashCollected > 0 ? `Encaissé ${formatFcfa(o.cashCollected)}` : null;
            return (
              <ListRow
                key={o.id}
                first={i === 0}
                leading={o.store ? <Avatar name={o.store.name} testID={testID} /> : <IconDisc icon="package" tone="cobalt" size={44} style={styles.avatarIcon} />}
                title={o.store?.name ?? 'Colis'}
                subtitle={cash ? `${meta}\n${cash}` : meta}
                amount={o.driverEarning !== null ? { value: o.driverEarning, sign: '+' } : null}
                rightSub={o.deliveredAt ? shortDateTime(o.deliveredAt) : null}
                testID={testID}
              />
            );
          })}
        </WhiteCard>
      ) : null}
      <View style={styles.note}>
        <Icon name="shield" size={16} color={palette.inkMuted} strokeWidth={2.3} />
        <Text style={styles.noteText}>Les adresses des courses terminées ne sont plus affichées (protection des données des clients).</Text>
      </View>
    </SurfaceScreen>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: spacing.xl },
  list: { paddingVertical: 4, gap: 0 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.cobaltTint },
  avatarText: { fontSize: 15, fontWeight: '800', letterSpacing: 0.2, color: palette.cobaltText },
  avatarIcon: { flexShrink: 0 },
  empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  emptyText: { color: palette.ink, fontSize: 16, lineHeight: 22, fontWeight: '700', textAlign: 'center' },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: spacing.xs, marginTop: spacing.xs },
  noteText: { flex: 1, color: palette.inkMuted, fontSize: 13, lineHeight: 18, fontWeight: '500' },
});
