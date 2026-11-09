import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import type { OrderDto, StoreDto } from '@yaar/shared';
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
import { BUSINESS_ACTIVE_STATUSES, searchingCountText, sortActiveDeliveries } from '../../../lib/delivery';
import { overviewScene } from '../../../lib/liveScene';
import { POLL_MS } from '../../../lib/publicConfig';
import { useApi } from '../../../state/auth';
import { isBusinessApproved, useBusiness } from '../../../state/business';
import { useOrderRooms, usePolling, useSocket, useSocketEvent } from '../../../state/socket';
import { dark, spacing, typeScale } from '../../../theme';

const isSearching = (o: OrderDto) => o.status === 'SEARCHING_DRIVER' || o.status === 'PENDING';

/** Pastille posée sur la carte : « ● 2 en route · ● 1 recherche d’un livreur », toujours sur une seule ligne. */
function SummaryChip({ onTheWay, searching }: { onTheWay: number; searching: number }) {
  return (
    <View style={styles.summary} accessibilityRole="summary">
      <View style={[styles.dot, { backgroundColor: dark.green }]} />
      <Text style={[styles.summaryText, styles.noShrink]} numberOfLines={1} testID="summary-on-the-way">{`${onTheWay} en route`}</Text>
      {searching > 0 ? (
        <>
          <Text style={styles.summarySep}>·</Text>
          <View style={[styles.dot, { backgroundColor: dark.amber }]} />
          <Text style={[styles.summaryText, styles.shrink]} numberOfLines={1} testID="summary-searching">
            {searchingCountText(searching)}
          </Text>
        </>
      ) : null}
    </View>
  );
}

/**
 * Explication sous « Aucune livraison en cours » : l'invitation à demander un livreur seulement si c'est possible ;
 * sinon (en attente de validation, suspendue), le bandeau juste au-dessus dit pourquoi, le texte ne le répète pas.
 */
function emptyText(store: StoreDto): string {
  return isBusinessApproved(store)
    ? 'Demandez un livreur : il récupère le colis chez vous et votre client le suit en direct sur la carte.'
    : 'Vos livraisons s’afficheront ici, avec leur livreur en direct sur la carte.';
}

/**
 * Onglet « Livraisons » de l'entreprise (comme Uber Direct / DoorDash Drive) : carte claire plein écran avec toutes
 * les livraisons en cours (son point de retrait, les livreurs en direct, les destinataires en épingles à leurs
 * initiales, les itinéraires par les rues lus sur GET /orders/:id ; cadrée sur les livraisons en route), pastille
 * « 2 en route · 1 recherche d’un livreur » sur la carte, feuille sombre : nom de l'entreprise, « Livraisons en cours »
 * et la pastille « + Nouvelle » sur la même ligne, puis une carte dense par livraison (colis en route d'abord, par
 * heure d'arrivée ; heure d'arrivée sous le nom, repère, livreur, WhatsApp / Appeler le destinataire ; toucher →
 * suivi). Sans livraison : illustration et explication, la feuille reste courte et la carte occupe le reste.
 */
export default function BusinessDeliveriesScreen() {
  const api = useApi();
  const { store, stores, error: storeError, refreshStores } = useBusiness();
  const { pollIntervalMs } = useSocket();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<OrderDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

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

  // « Réessayer » : en mode socket, rien ne relance le chargement tout seul après une erreur.
  const retry = async () => {
    setRetrying(true);
    try {
      await Promise.all([load(), storeError ? refreshStores() : Promise.resolve()]);
    } finally {
      setRetrying(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  // Mode socket : statuts (et nouvel itinéraire) par order.updated, positions par driver.location.
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
  // Itinéraires par les rues : la liste n'en transporte pas (seulement leur date de calcul), le détail si.
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
      <View style={styles.headerText}>
        <Text style={styles.kicker} numberOfLines={1}>
          {store ? store.name : 'Yaar Livraison · Entreprise'}
        </Text>
        <Text style={[styles.title, canRequest && width < 400 && styles.titleNarrow]} accessibilityRole="header">
          Livraisons en cours
        </Text>
      </View>
      {canRequest ? (
        // Pastille compacte sur la ligne du titre (le disque orange « Nouvelle » de la barre d'onglets fait de même).
        <Pill
          label="Nouvelle"
          icon={<Icon name="plus" size={18} color={ORANGE_INK} strokeWidth={2.8} />}
          onPress={() => router.push('/business/nouvelle')}
          style={styles.newPill}
          textStyle={{ color: ORANGE_INK }}
          accessibilityLabel="Nouvelle livraison"
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
      // Une livraison : feuille courte (la carte garde la place). Plusieurs : un peu plus haute, pour lire les heures
      // d'arrivée de deux livraisons au moins sans faire défiler.
      sheetMaxRatio={list.length >= 2 ? 0.62 : 0.5}
      // Cadrage : les épingles tiennent au-dessus de la mention des données (pas 90 px : la carte est courte ici).
      fitBottomMargin={44}
      insetBottom={false}
      // Une seule carte (contexte WebGL) à la fois : démontée quand une livraison est ouverte par-dessus.
      mapVisible={focused}
      topCenter={list.length > 0 ? <SummaryChip onTheWay={onTheWay} searching={searching} /> : null}
      sheetHeader={header}
      testID="business-home"
    >
      {storeError ? (
        <DarkBanner message={storeError} action={{ label: 'Réessayer', onPress: () => void retry(), loading: retrying, testID: 'retry-store' }} />
      ) : null}
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
      {error ? (
        <DarkBanner message={error} action={{ label: 'Réessayer', onPress: () => void retry(), loading: retrying, testID: 'retry-deliveries' }} />
      ) : null}
      {store && items === null && !error ? (
        <View style={styles.loading}>
          <ActivityIndicator color={dark.green} />
          <Text style={styles.muted}>Chargement des livraisons…</Text>
        </View>
      ) : null}
      {store && items !== null && list.length === 0 ? (
        <View style={styles.empty} testID="no-active-delivery">
          <CourierIllustration width={canRequest ? 210 : 150} />
          <Text style={styles.emptyTitle}>Aucune livraison en cours</Text>
          <Text style={[styles.muted, styles.center]}>{emptyText(store)}</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerText: { flex: 1, gap: 2 },
  kicker: { ...typeScale.kicker, color: BUSINESS_ACCENT },
  title: { ...typeScale.title, color: dark.text },
  // Téléphone de moins de 400 px : le titre et « + Nouvelle » tiennent sur une ligne.
  titleNarrow: { fontSize: 21, letterSpacing: -0.3 },
  newPill: { backgroundColor: BUSINESS_ACCENT, borderColor: BUSINESS_ACCENT, paddingHorizontal: 14, gap: 6 },
  stretch: { alignSelf: 'stretch', justifyContent: 'center' },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    maxWidth: '100%',
    paddingHorizontal: 12,
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
  summaryText: { color: dark.text, fontSize: 13.5, fontWeight: '800', fontVariant: ['tabular-nums'] },
  noShrink: { flexShrink: 0 },
  shrink: { flexShrink: 1 },
  // Séparateur en textMuted : sur la pastille posée sur la carte, textFaint n'atteindrait pas 4,5:1.
  summarySep: { color: dark.textMuted, fontSize: 14, fontWeight: '800' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  noStore: { gap: spacing.md },
  loading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  muted: { color: dark.textMuted, fontSize: 14, lineHeight: 20 },
  center: { textAlign: 'center' },
  empty: { alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.sm },
  emptyTitle: { color: dark.text, fontSize: 19, fontWeight: '900', letterSpacing: -0.2 },
});
