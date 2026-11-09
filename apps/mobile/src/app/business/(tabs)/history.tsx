import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/Text';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LOCATION_RETENTION_MONTHS, type OrderDto } from '@yaar/shared';
import { DarkBanner } from '../../../components/business/DarkForm';
import { HistoryDeliveryCard } from '../../../components/business/DeliveryCards';
import { Icon } from '../../../components/design/Icon';
import { Pill } from '../../../components/design/Pill';
import { errorMessage } from '../../../lib/api';
import { BUSINESS_HISTORY_STATUSES } from '../../../lib/delivery';
import { useApi } from '../../../state/auth';
import { dark, spacing, typeScale } from '../../../theme';

const PAGE_SIZE = 20;

/**
 * Onglet « Historique » (fond sombre, comme celui du livreur) : livraisons terminées (livrées ou annulées) en cartes
 * de colis, montant encaissé auprès du destinataire, « Voir plus » pour la suite ; toucher une carte → son détail.
 */
export default function BusinessHistoryScreen() {
  const api = useApi();
  const [items, setItems] = useState<OrderDto[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Barre d'état claire sur ce fond sombre, seulement quand l'onglet est affiché (les onglets restent montés).
  const [focused, setFocused] = useState(false);

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
      setFocused(true);
      void load(1);
      return () => setFocused(false);
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {focused ? <StatusBar style="light" /> : null}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading && items !== null} onRefresh={() => void load(1)} tintColor={dark.text} />}
      >
        <Text style={styles.title} accessibilityRole="header">
          Historique
        </Text>
        {error ? <DarkBanner message={error} action={{ label: 'Réessayer', onPress: () => void load(1), loading, testID: 'retry-history' }} /> : null}
        {items === null && loading ? <ActivityIndicator color={dark.green} style={{ marginTop: spacing.xl }} /> : null}
        {items?.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="package" size={40} color={dark.textFaint} />
            <Text style={styles.emptyText}>Aucune livraison terminée pour le moment.</Text>
          </View>
        ) : null}
        {items && items.length > 0 ? (
          <Text style={styles.summary}>{`${total} livraison${total > 1 ? 's' : ''} terminée${total > 1 ? 's' : ''}`}</Text>
        ) : null}
        {items?.map((o) => (
          <HistoryDeliveryCard key={o.id} order={o} onPress={() => router.push(`/business/livraison/${o.id}`)} />
        ))}
        {items && items.length < total ? (
          <Pill label="Voir plus" icon="chevronDown" tone="outline" onPress={() => void load(page + 1)} loading={loading} style={styles.more} testID="history-more" />
        ) : null}
        <Text style={styles.note}>
          Touchez une livraison pour revoir son détail. Les adresses et numéros des destinataires sont effacés{' '}
          {LOCATION_RETENTION_MONTHS} mois après la livraison (protection des données) ; les montants restent dans l’historique.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: dark.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md },
  title: { ...typeScale.title, color: dark.text, marginTop: spacing.xs },
  empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl * 2 },
  emptyText: { color: dark.textMuted, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  summary: { color: dark.textMuted, fontSize: 13, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 4 },
  more: { alignSelf: 'center' },
  note: { color: dark.textFaint, fontSize: 12.5, lineHeight: 17, textAlign: 'center', marginTop: spacing.sm },
});
