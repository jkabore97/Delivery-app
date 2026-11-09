import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/Text';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LOCATION_RETENTION_MONTHS, type OrderDto } from '@yaar/shared';
import { DarkBanner } from '../../../components/business/DarkForm';
import { deliveryChip, HistoryDeliveryCard } from '../../../components/business/DeliveryCards';
import { deliveryMinutes, dropoffArea } from '../../../components/business/dashboardData';
import { PAGE_PADDING, useIsDesktop } from '../../../components/business/desktop/layout';
import { PageHeader } from '../../../components/business/desktop/PageHeader';
import { InitialsAvatar, NewDeliveryButton, POINTER, type WebPressState } from '../../../components/business/parts';
import { Icon } from '../../../components/design/Icon';
import { Pill, StatusChip } from '../../../components/design/Pill';
import { useTabBarInset } from '../../../components/design/tabBarInset';
import { errorMessage } from '../../../lib/api';
import { amountsToCollect, BUSINESS_HISTORY_STATUSES, FEE_PAYER_LABELS } from '../../../lib/delivery';
import { formatDateTime, formatFcfa, formatOrderNumber } from '../../../lib/format';
import { useApi } from '../../../state/auth';
import { useBusiness } from '../../../state/business';
import { palette, shadows, spacing, tabular, typography } from '../../../theme';

const PAGE_SIZE = 20;

/**
 * Historique de l'entreprise : livraisons terminées (livrées ou annulées), montant encaissé auprès du destinataire,
 * « Voir plus » pour la suite ; une livraison ouvre son détail. Téléphone : cartes de colis sur canvas. Ordinateur :
 * tableau (numéro, destinataire et quartier, état, date, encaissé, frais), lignes séparées par un filet.
 */
export default function BusinessHistoryScreen() {
  const api = useApi();
  const desktop = useIsDesktop();
  const [items, setItems] = useState<OrderDto[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Barre d'état sombre seulement quand l'onglet est affiché (les onglets restent montés).
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

  const tabInset = useTabBarInset();

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void load(1);
      return () => setFocused(false);
    }, [load]),
  );

  const summary = items && items.length > 0 ? `${total} livraison${total > 1 ? 's' : ''} terminée${total > 1 ? 's' : ''}` : null;
  const banner = error ? <DarkBanner message={error} action={{ label: 'Réessayer', onPress: () => void load(1), loading, testID: 'retry-history' }} /> : null;
  const more =
    items && items.length < total ? (
      <Pill label="Voir plus" icon="chevronDown" tone="outline" onPress={() => void load(page + 1)} loading={loading} style={styles.more} testID="history-more" />
    ) : null;
  const note = (
    <Text style={styles.note}>
      {desktop ? 'Cliquez sur une livraison' : 'Touchez une livraison'} pour revoir son détail. Les adresses et numéros des destinataires sont effacés{' '}
      {LOCATION_RETENTION_MONTHS} mois après la livraison (protection des données) ; les montants restent dans l’historique.
    </Text>
  );
  const empty =
    items?.length === 0 ? (
      <View style={styles.empty}>
        <View style={styles.emptyDisc}>
          <Icon name="history" size={26} color={palette.cobalt} strokeWidth={2.2} />
        </View>
        <Text style={styles.emptyText}>Aucune livraison terminée pour le moment.</Text>
      </View>
    ) : null;

  if (desktop) return <DesktopHistory items={items} loading={loading} summary={summary} banner={banner} empty={empty} more={more} note={note} />;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {focused ? <StatusBar style="dark" /> : null}
      <ScrollView
        // Sous la barre d'onglets flottante : la fin de la liste reste au-dessus d'elle.
        contentContainerStyle={[styles.content, { paddingBottom: tabInset + spacing.lg }]}
        refreshControl={<RefreshControl refreshing={loading && items !== null} onRefresh={() => void load(1)} tintColor={palette.cobalt} colors={[palette.cobalt]} />}
      >
        <View style={styles.titleBlock}>
          <Text style={styles.title} accessibilityRole="header">
            Historique
          </Text>
          {summary ? <Text style={styles.summary}>{summary}</Text> : null}
        </View>
        {banner}
        {items === null && loading ? <ActivityIndicator color={palette.cobalt} style={{ marginTop: spacing.xl }} /> : null}
        {empty}
        {items?.map((o) => (
          <HistoryDeliveryCard key={o.id} order={o} onPress={() => router.push(`/business/livraison/${o.id}`)} />
        ))}
        {more}
        {note}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Frais d'une ligne du tableau : « 1 500 FCFA » et qui les a payés (annulée : aucuns frais). */
function feeCell(o: OrderDto): { amount: string; who: string } {
  if (o.status === 'CANCELLED') return { amount: '—', who: 'aucuns frais' };
  return { amount: formatFcfa(o.deliveryFee), who: o.feePaidBy ? `payés par ${FEE_PAYER_LABELS[o.feePaidBy].title.toLowerCase()}` : '' };
}

function DesktopHistory({
  items,
  loading,
  summary,
  banner,
  empty,
  more,
  note,
}: {
  items: OrderDto[] | null;
  loading: boolean;
  summary: string | null;
  banner: ReactNode;
  empty: ReactNode;
  more: ReactNode;
  note: ReactNode;
}) {
  const { stores, store } = useBusiness();
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent} testID="history-desktop">
      <PageHeader title="Historique" subtitle={summary ?? 'Livraisons terminées : livrées et annulées'} actions={<NewDeliveryButton stores={stores} store={store} variant="desktop" />} />
      <View style={styles.deskBody}>
        {banner}
        <View style={[styles.table, shadows.tile]}>
          <View style={styles.thead} accessibilityRole="header">
            <Text style={[styles.th, styles.cNum]}>N°</Text>
            <Text style={[styles.th, styles.cWho]}>Destinataire</Text>
            <Text style={[styles.th, styles.cState]}>État</Text>
            <Text style={[styles.th, styles.cDate]}>Date</Text>
            <Text style={[styles.th, styles.cAmount, styles.right]}>Encaissé</Text>
            <Text style={[styles.th, styles.cFee, styles.right]}>Frais</Text>
            <View style={styles.cGo} />
          </View>
          {items === null && loading ? <ActivityIndicator color={palette.cobalt} style={{ marginVertical: spacing.xl }} /> : null}
          {empty}
          {items?.map((o, i) => {
            const chip = deliveryChip(o.status);
            const when = o.deliveredAt ?? o.cancelledAt ?? o.createdAt;
            const collected = o.status === 'DELIVERED' ? amountsToCollect(o).atDropoff : 0;
            const minutes = deliveryMinutes(o);
            const area = dropoffArea(o);
            const fee = feeCell(o);
            const name = o.recipientName ?? 'Destinataire';
            return (
              <Pressable
                key={o.id}
                accessibilityRole="button"
                accessibilityLabel={`${formatOrderNumber(o.number)}, ${name}, ${chip.label.toLowerCase()}, ${formatDateTime(when)}${collected > 0 ? `, encaissé ${formatFcfa(collected)}` : ''}. Ouvrir le détail`}
                onPress={() => router.push(`/business/livraison/${o.id}`)}
                style={(s: WebPressState) => [styles.tr, i > 0 && styles.trLine, POINTER, (s.hovered || s.pressed) && styles.trHover]}
                testID={`history-row-${o.id}`}
              >
                <Text style={[styles.td, styles.cNum, styles.muted]}>{formatOrderNumber(o.number)}</Text>
                <View style={[styles.cWho, styles.who]}>
                  <InitialsAvatar name={name} size={36} tone={o.status === 'DELIVERED' ? 'mint' : 'grey'} />
                  <View style={styles.whoText}>
                    <Text style={styles.name} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={styles.sub} numberOfLines={1}>
                      {[area, o.status === 'DELIVERED' && minutes !== null ? `${minutes} min` : null, o.status === 'CANCELLED' ? o.cancelReason : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                </View>
                <View style={styles.cState}>
                  <StatusChip label={chip.label} tone={chip.tone} />
                </View>
                <Text style={[styles.td, styles.cDate]}>{formatDateTime(when)}</Text>
                <Text style={[styles.td, styles.cAmount, styles.right, styles.strong]} testID={collected > 0 ? `history-row-collected-${o.id}` : undefined}>
                  {collected > 0 ? formatFcfa(collected) : '—'}
                </Text>
                <View style={[styles.cFee, styles.feeCell]}>
                  <Text style={[styles.td, styles.right]}>{fee.amount}</Text>
                  {fee.who ? <Text style={[styles.sub, styles.right]}>{fee.who}</Text> : null}
                </View>
                <View style={styles.cGo}>
                  <Icon name="chevronRight" size={18} color={palette.inkMuted} strokeWidth={2.4} />
                </View>
              </Pressable>
            );
          })}
        </View>
        {more}
        {note}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.canvas },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md },
  titleBlock: { gap: 2, marginTop: spacing.xs },
  title: { ...typography.display, color: palette.ink },
  summary: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: palette.inkMuted },
  empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl * 2 },
  emptyDisc: { width: 64, height: 64, borderRadius: 32, backgroundColor: palette.cobaltTint, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: palette.inkMuted, fontSize: 16, lineHeight: 22, fontWeight: '600', textAlign: 'center' },
  more: { alignSelf: 'center' },
  note: { color: palette.inkMuted, fontSize: 12.5, lineHeight: 17, fontWeight: '500', textAlign: 'center', marginTop: spacing.sm },
  page: { flex: 1, backgroundColor: palette.canvas },
  pageContent: { padding: PAGE_PADDING },
  deskBody: { marginTop: 16, gap: 16 },
  table: { backgroundColor: palette.card, borderRadius: 24, overflow: 'hidden', paddingHorizontal: 12, paddingBottom: 8 },
  thead: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: palette.line },
  th: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: palette.inkMuted },
  tr: { flexDirection: 'row', alignItems: 'center', minHeight: 68, paddingHorizontal: 12, borderRadius: 16 },
  trLine: { borderTopWidth: 1, borderTopColor: palette.line },
  trHover: { backgroundColor: palette.raised },
  td: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: palette.ink, ...tabular },
  muted: { color: palette.inkMuted },
  strong: { fontWeight: '800' },
  right: { textAlign: 'right' },
  cNum: { width: 72 },
  cWho: { flex: 1, minWidth: 0 },
  cState: { width: 150 },
  cDate: { width: 150 },
  cAmount: { width: 130 },
  cFee: { width: 190 },
  cGo: { width: 36, alignItems: 'flex-end' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 12 },
  whoText: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, lineHeight: 19, fontWeight: '700', color: palette.ink },
  sub: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: palette.inkMuted },
  feeCell: { alignItems: 'flex-end' },
});
