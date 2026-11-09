import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../../components/design/Icon';
import { PackageCard } from '../../components/design/PackageCard';
import { useAsync } from '../../hooks/useAsync';
import { formatDateTime, formatFcfa, formatKm, formatOrderNumber } from '../../lib/format';
import { useApi } from '../../state/auth';
import { dark, spacing } from '../../theme';

/** Courses terminées : montants conservés, adresses et téléphones masqués après livraison (confidentialité). */
export default function DriverHistory() {
  const api = useApi();
  const list = useAsync(() => api.listOrders({ status: ['DELIVERED'], pageSize: 50 }), [api]);
  const items = list.data?.items ?? [];
  const count = list.data?.total ?? items.length;
  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={list.loading && !!list.data} onRefresh={() => void list.reload()} tintColor={dark.text} />}
      >
        {list.error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {list.error}
          </Text>
        ) : null}
        {!list.data && list.loading ? <ActivityIndicator color={dark.green} style={{ marginTop: spacing.xl }} /> : null}
        {list.data && items.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="package" size={40} color={dark.textFaint} />
            <Text style={styles.emptyText}>Aucune course livrée pour le moment.</Text>
          </View>
        ) : null}
        {items.length > 0 ? (
          <Text style={styles.summary}>{`${count} course${count > 1 ? 's' : ''} livrée${count > 1 ? 's' : ''}`}</Text>
        ) : null}
        {items.map((o) => (
          <PackageCard
            key={o.id}
            kicker={`Course ${formatOrderNumber(o.number)}`}
            status={{ label: 'LIVRÉE', tone: 'green' }}
            name={o.store?.name ?? 'Colis'}
            meta={[o.deliveredAt ? formatDateTime(o.deliveredAt) : null, formatKm(o.distanceKm)].filter(Boolean).join(' · ')}
            description={o.cashCollected !== null && o.cashCollected > 0 ? `Encaissé ${formatFcfa(o.cashCollected)}` : null}
            amount={o.driverEarning !== null ? { label: 'Votre gain', value: o.driverEarning, tone: 'green' } : null}
            testID={`history-${o.id}`}
          />
        ))}
        <Text style={styles.note}>Les adresses des courses terminées ne sont plus affichées (protection des données des clients).</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: dark.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md },
  error: { color: dark.red, backgroundColor: dark.redSoft, borderRadius: 12, padding: spacing.md, fontWeight: '700', overflow: 'hidden' },
  empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl * 2 },
  emptyText: { color: dark.textMuted, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  summary: { color: dark.textMuted, fontSize: 13, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 4 },
  note: { color: dark.textFaint, fontSize: 12.5, lineHeight: 17, textAlign: 'center', marginTop: spacing.sm },
});
