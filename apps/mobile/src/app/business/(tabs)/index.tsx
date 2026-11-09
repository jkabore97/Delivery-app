import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import type { OrderDto } from '@yaar/shared';
import { BUSINESS_ACCENT, ORANGE_INK } from '../../../components/business/accent';
import { ActiveDeliveryCard } from '../../../components/business/DeliveryCards';
import { DarkBanner } from '../../../components/business/DarkForm';
import { CourierIllustration } from '../../../components/design/CourierIllustration';
import { Icon } from '../../../components/design/Icon';
import { Pill } from '../../../components/design/Pill';
import { StoreApprovalBanner } from '../../../components/StoreApprovalBanner';
import { LiveTrackingLayout } from '../../../components/tracking/LiveTrackingLayout';
import { Loading } from '../../../components/ui';
import { useLiveRoutes } from '../../../hooks/useLiveRoutes';
import { errorMessage } from '../../../lib/api';
import { BUSINESS_ACTIVE_STATUSES, sortActiveDeliveries } from '../../../lib/delivery';
import { overviewScene } from '../../../lib/liveScene';
import { POLL_MS } from '../../../lib/publicConfig';
import { useApi } from '../../../state/auth';
import { isBusinessApproved, useBusiness } from '../../../state/business';
import { useOrderRooms, usePolling, useSocket, useSocketEvent } from '../../../state/socket';
import { dark, spacing, typeScale } from '../../../theme';

const isSearching = (o: OrderDto) => o.status === 'SEARCHING_DRIVER' || o.status === 'PENDING';

/** Pastille posée sur la carte : « ● 2 en route · ● 1 en recherche » (une seule ligne, même sur un petit écran). */
function SummaryChip({ onTheWay, searching }: { onTheWay: number; searching: number }) {
  return (
    <View style={styles.summary} accessibilityRole="summary">
      <View style={[styles.dot, { backgroundColor: dark.green }]} />
      <Text style={styles.summaryText} testID="summary-on-the-way">{`${onTheWay} en route`}</Text>
      {searching > 0 ? (
        <>
          <Text style={styles.summarySep}>·</Text>
          <View style={[styles.dot, { backgroundColor: dark.amber }]} />
          <Text style={styles.summaryText} testID="summary-searching">{`${searching} en recherche`}</Text>
        </>
      ) : null}
    </View>
  );
}

/**
 * Onglet « Livraisons » de l'entreprise (comme Uber Direct / DoorDash Drive) : carte claire plein écran avec toutes
 * les livraisons en cours (son point de retrait, les livreurs en direct, les destinataires en épingles à leurs
 * initiales, les itinéraires par les rues lus sur GET /orders/:id), pastilles « 2 en route · 1 en recherche » sur la
 * carte, feuille sombre : nom de l'entreprise, « Nouvelle livraison », puis une carte par livraison (heure d'arrivée,
 * livreur, WhatsApp / Appeler le destinataire ; toucher → suivi). Sans livraison : illustration et explication, la
 * feuille reste courte et la carte occupe le reste.
 */
export default function BusinessDeliveriesScreen() {
  const api = useApi();
  const { store, stores, error: storeError } = useBusiness();
  const { pollIntervalMs } = useSocket();
  const [items, setItems] = useState<OrderDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<boolean> => {
    try {
      const res = await api.listDeliveries({ status: BUSINESS_ACTIVE_STATUSES, pageSize: 50 });
      setItems(sortActiveDeliveries(res.items));
      setError(null);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  // Mode socket : statuts par order.updated, positions par driver.location (salles des livraisons en cours).
  useSocketEvent('order.updated', () => void load());
  useOrderRooms((items ?? []).map((o) => o.id));
  useSocketEvent('driver.location', (e) => {
    setItems(
      (prev) =>
        prev?.map((o) =>
          o.id === e.orderId && o.driver
            ? { ...o, driver: { ...o.driver, lastLocation: { lat: e.lat, lng: e.lng, at: e.at, heading: e.heading } } }
            : o,
        ) ?? prev,
    );
  });
  // Mode poll (Vercel) : la liste complète (URL constante) porte aussi les positions des livreurs (toutes les 10 s).
  const focused = useIsFocused();
  usePolling(load, POLL_MS.businessDeliveries, focused && !!store);
  // Itinéraires par les rues : la liste n'en transporte pas, le détail de chaque livraison en route si.
  const fetchOrder = useCallback((id: string) => api.getOrder(id), [api]);
  const deliveries = useLiveRoutes(items, fetchOrder, focused && !!store);

  const business = store ? { lat: store.lat, lng: store.lng } : null;
  const overview = useMemo(
    () => overviewScene(business, deliveries ?? [], store?.name, { recipientInitials: true }),
    [deliveries, store?.lat, store?.lng, store?.name], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (stores === undefined) return <Loading />;

  const list = deliveries ?? [];
  const now = Date.now();
  const searching = list.filter(isSearching).length;
  const onTheWay = list.length - searching;
  const canRequest = !!store && isBusinessApproved(store);
  // Nouvelle livraison ou nouvelle étape : la carte recadre (même si elle avait été déplacée).
  const stageKey = list.map((o) => `${o.id}:${o.status}`).sort().join('|') || 'empty';

  const header = (
    <View style={styles.header}>
      <View style={{ gap: 2 }}>
        <Text style={styles.kicker} numberOfLines={1}>
          {store ? store.name : 'Yaar Livraison · Entreprise'}
        </Text>
        <Text style={styles.title} accessibilityRole="header">
          Livraisons en cours
        </Text>
      </View>
      {canRequest ? (
        <Pill
          label="Nouvelle livraison"
          icon={<Icon name="plus" size={22} color={ORANGE_INK} strokeWidth={2.8} />}
          size="lg"
          onPress={() => router.push('/business/nouvelle')}
          style={styles.cta}
          textStyle={{ color: ORANGE_INK }}
          testID="new-delivery"
        />
      ) : null}
    </View>
  );

  return (
    <LiveTrackingLayout
      markers={overview.markers}
      lines={overview.lines}
      fitPoints={overview.fitPoints}
      stageKey={stageKey}
      animationMs={Math.max(pollIntervalMs, POLL_MS.businessDeliveries)}
      sheetTheme="dark"
      // Feuille un peu plus basse qu'ailleurs : la carte d'ensemble garde de la place pour plusieurs livraisons.
      sheetMaxRatio={0.5}
      insetBottom={false}
      // Une seule carte (contexte WebGL) à la fois : démontée quand une livraison est ouverte par-dessus.
      mapVisible={focused}
      topCenter={list.length > 0 ? <SummaryChip onTheWay={onTheWay} searching={searching} /> : null}
      sheetHeader={header}
      testID="business-home"
    >
      {storeError ? <DarkBanner message={storeError} /> : null}
      {!store ? (
        <View style={styles.noStore}>
          <Text style={styles.muted}>Créez le profil de votre entreprise pour demander des livraisons.</Text>
          <Pill
            label="Créer mon profil d’entreprise"
            icon="store"
            tone="green"
            size="lg"
            onPress={() => router.navigate('/business/profile')}
            style={styles.stretch}
          />
        </View>
      ) : (
        <StoreApprovalBanner store={store} tone="dark" />
      )}
      {error ? <DarkBanner message={error} /> : null}
      {store && items === null && !error ? (
        <View style={styles.loading}>
          <ActivityIndicator color={dark.green} />
          <Text style={styles.muted}>Chargement des livraisons…</Text>
        </View>
      ) : null}
      {store && items !== null && list.length === 0 ? (
        <View style={styles.empty} testID="no-active-delivery">
          <CourierIllustration width={210} />
          <Text style={styles.emptyTitle}>Aucune livraison en cours</Text>
          <Text style={[styles.muted, styles.center]}>
            Demandez un livreur : il récupère le colis chez vous et votre client le suit en direct sur la carte.
          </Text>
        </View>
      ) : null}
      {list.map((o) => (
        <ActiveDeliveryCard
          key={o.id}
          order={o}
          businessName={store?.name ?? null}
          now={now}
          onPress={() => router.push(`/business/livraison/${o.id}`)}
        />
      ))}
    </LiveTrackingLayout>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.md },
  kicker: { ...typeScale.kicker, color: BUSINESS_ACCENT },
  title: { ...typeScale.title, color: dark.text },
  cta: { alignSelf: 'stretch', justifyContent: 'center', backgroundColor: BUSINESS_ACCENT, borderColor: BUSINESS_ACCENT },
  stretch: { alignSelf: 'stretch', justifyContent: 'center' },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: dark.chip,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  summaryText: { color: dark.text, fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  summarySep: { color: dark.textFaint, fontSize: 14, fontWeight: '800', marginHorizontal: 1 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  noStore: { gap: spacing.md },
  loading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  muted: { color: dark.textMuted, fontSize: 14, lineHeight: 20 },
  center: { textAlign: 'center' },
  empty: { alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.sm },
  emptyTitle: { color: dark.text, fontSize: 19, fontWeight: '900', letterSpacing: -0.2 },
});
