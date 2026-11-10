import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import type { OrderDto } from '@yaar/shared';
import { Text } from '../../Text';
import { StoreApprovalBanner } from '../../StoreApprovalBanner';
import { useNow } from '../../../hooks/useNow';
import { buildScene, orderSceneInput, overviewScene } from '../../../lib/liveScene';
import { POLL_MS } from '../../../lib/publicConfig';
import { useBusiness } from '../../../state/business';
import { useSocket } from '../../../state/socket';
import { palette } from '../../../theme';
import { DarkBanner } from '../DarkForm';
import { focusedDelivery, isSearching, matchesSearch, neighbourhood } from '../dashboardData';
import { NewDeliveryButton } from '../parts';
import { MapSummaryPill } from '../phone/HomeParts';
import { useBusinessSummary, useSummaryRefresh } from '../summary';
import { useActiveDeliveries, useDeliveredToday } from '../useDeliveries';
import { PAGE_PADDING, SIDEBAR_WIDTH, TILE_GAP } from './layout';
import { MapTile } from './MapTile';
import { LiveDateLine, PageHeader, SearchPill } from './PageHeader';
import { CashTile, EmptyHeroTile, HeroTile, KpiTile, LiveListTile, RecentTile } from './Tiles';

/** Largeur des tuiles de droite (chiffres, héros, listes) : celle de la planche (656 px), la carte prend le reste. */
const RIGHT_WIDTH = 656;
/** En dessous, la carte serait trop étroite à côté des tuiles : mise en page empilée (fenêtre de 1 024 à ~1 250 px). */
const MIN_MAP_WIDTH = 280;

/**
 * Tableau de bord de l'entreprise sur ordinateur (planche Cobalt) : « Vue d'ensemble » et la date en direct, recherche
 * (numéro ou destinataire) et « Nouvelle livraison » en haut à droite ; puis une mosaïque de tuiles espacées de 16 px :
 * carte en direct sur toute la hauteur à gauche, chiffres du jour (livrées, délai moyen, à reverser en soleil), la
 * livraison suivie en tuile cobalt (choisie dans la liste, par défaut la première en route), la liste « En cours » et
 * les « Dernières livraisons » du jour. Données : la liste des livraisons en cours et son rafraîchissement, le résumé du
 * jour (GET /business/summary), l'historique du jour.
 */
export function BusinessDashboard() {
  const { store, stores, error: storeError, refreshStores } = useBusiness();
  const { pollIntervalMs } = useSocket();
  const { summary } = useBusinessSummary();
  const { width, height } = useWindowDimensions();
  const focused = useIsFocused();
  const enabled = focused && !!store;
  const now = useNow(30_000);
  const { items, deliveries, error, load } = useActiveDeliveries(enabled);
  const activeKey = (items ?? []).map((o) => o.id).join(',');
  const recent = useDeliveredToday(enabled, activeKey);
  useSummaryRefresh(enabled);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Caméra : 'all' (toutes les livraisons) ou la livraison choisie dans la liste ; `recenter` force un recadrage.
  const [cameraOn, setCameraOn] = useState<string>('all');
  const [recenter, setRecenter] = useState(0);
  const [query, setQuery] = useState('');
  const [retrying, setRetrying] = useState(false);

  const list = useMemo(() => deliveries ?? [], [deliveries]);
  const hero = focusedDelivery(list, selectedId);
  const overview = useMemo(
    () => overviewScene(store ? { lat: store.lat, lng: store.lng } : null, list, store?.name, { recipientInitials: true }),
    [list, store?.lat, store?.lng, store?.name], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const focusOrder = cameraOn === 'all' ? null : (list.find((o) => o.id === cameraOn) ?? null);
  const fitPoints = useMemo(() => {
    // Vue d'ensemble : la grande carte du tableau de bord montre toutes les épingles (jusqu'à 8 livraisons ; au-delà,
    // le cadrage des livraisons en route, sans dézoomer sur toute la ville).
    if (!focusOrder) {
      if (list.length === 0 && store) return neighbourhood(store);
      return list.length <= 8 ? overview.markers.map((m) => ({ lat: m.lat, lng: m.lng })) : overview.fitPoints;
    }
    const s = buildScene(orderSceneInput(focusOrder));
    return s.fitPoints.length > 0 ? s.fitPoints : overview.fitPoints;
  }, [focusOrder, overview.fitPoints, overview.markers, list.length, store?.lat, store?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const stageKey = list.map((o) => `${o.id}:${o.status}`).sort().join('|') || 'empty';

  const retry = async () => {
    setRetrying(true);
    try {
      await Promise.all([load(), storeError ? refreshStores() : Promise.resolve()]);
    } finally {
      setRetrying(false);
    }
  };
  const openDelivery = (o: OrderDto) => router.push(`/business/livraison/${o.id}`);

  const content = width - SIDEBAR_WIDTH - PAGE_PADDING * 2;
  const mapWidth = content - TILE_GAP - RIGHT_WIDTH;
  const stacked = mapWidth < MIN_MAP_WIDTH;
  // Hauteurs de la planche (900 px : 132 / 320 / 280) ; plus bas (800 px) tuiles un peu plus basses, listes de 220 px
  // au moins ; la mosaïque remplit la fenêtre sous l'en-tête (page qui défile seulement si la fenêtre est trop basse).
  const tall = height >= 860;
  const kpiHeight = tall ? 132 : 124;
  const heroHeight = tall ? 320 : 288;
  const listMin = 220;
  const bentoHeight = Math.max(kpiHeight + heroHeight + listMin + TILE_GAP * 2, height - PAGE_PADDING * 2 - 56 - 16);
  const searching = list.filter(isSearching).length;
  const live = list.filter((o) => matchesSearch(o, query));
  const doneToday = recent.items ? recent.items.filter((o) => matchesSearch(o, query)) : null;

  const kpis = (
    <View style={[styles.kpis, { height: kpiHeight }]}>
      <KpiTile
        icon="check"
        tint="mint"
        value={summary ? String(summary.today.delivered) : '…'}
        label="Livrées aujourd’hui"
        accessibilityLabel={summary ? `${summary.today.delivered} livraisons livrées aujourd’hui` : 'Livrées aujourd’hui : chargement'}
        style={styles.kpiSmall}
        testID="kpi-delivered"
      />
      <KpiTile
        icon="clock"
        tint="cobalt"
        value={summary ? (summary.today.avgDeliveryMinutes === null ? '—' : String(summary.today.avgDeliveryMinutes)) : '…'}
        unit={summary?.today.avgDeliveryMinutes !== null && summary ? 'min' : null}
        label="Délai moyen"
        accessibilityLabel={
          summary
            ? summary.today.avgDeliveryMinutes === null
              ? 'Délai moyen : pas encore de livraison aujourd’hui'
              : `Délai moyen de livraison : ${summary.today.avgDeliveryMinutes} minutes`
            : 'Délai moyen : chargement'
        }
        style={styles.kpiSmall}
        testID="kpi-delay"
      />
      <CashTile summary={summary} style={styles.kpiWide} />
    </View>
  );
  const heroNode = hero ? (
    <HeroTile order={hero} now={now} businessName={store?.name ?? null} onOpen={() => openDelivery(hero)} short={!tall} style={{ height: heroHeight }} />
  ) : (
    <EmptyHeroTile stores={stores} store={store} style={{ height: heroHeight }} />
  );
  const lists = (
    <View style={[styles.lists, { minHeight: listMin }]}>
      <LiveListTile
        list={live}
        total={list.length}
        selectedId={hero?.id ?? null}
        onSelect={(o) => {
          setSelectedId(o.id);
          setCameraOn(o.id);
        }}
        now={now}
        query={query}
        style={styles.liveTile}
      />
      <RecentTile
        list={doneToday}
        loading={recent.items === null}
        error={recent.error}
        query={query}
        onOpen={openDelivery}
        onSeeAll={() => router.navigate('/business/history')}
        style={styles.doneTile}
      />
    </View>
  );
  const map = (
    <MapTile
      markers={overview.markers}
      lines={overview.lines}
      fitPoints={fitPoints}
      cameraKey={`${stageKey}#${cameraOn}#${recenter}`}
      overlay={list.length > 0 ? <MapSummaryPill total={list.length} searching={!stacked && mapWidth < 400 ? 0 : searching} /> : null}
      recenterLabel="Recentrer la carte sur toutes les livraisons"
      animationMs={Math.max(pollIntervalMs, POLL_MS.businessDeliveries)}
      onRecenter={() => {
        setCameraOn('all');
        setRecenter((n) => n + 1);
      }}
      visible={focused}
      style={stacked ? styles.mapStacked : styles.mapSide}
    />
  );

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent} testID="business-dashboard">
      <PageHeader
        title="Vue d’ensemble"
        subtitle={<LiveDateLine now={now} />}
        search={<SearchPill value={query} onChangeText={setQuery} placeholder="Rechercher une livraison, un destinataire…" testID="dashboard-search" />}
        actions={<NewDeliveryButton stores={stores} store={store} variant="desktop" />}
      />
      {storeError || error || (store && store.approvalStatus && store.approvalStatus !== 'APPROVED') ? (
        <View style={styles.banners}>
          {storeError ? <DarkBanner message={storeError} action={{ label: 'Réessayer', onPress: () => void retry(), loading: retrying, testID: 'retry-store' }} /> : null}
          {error ? <DarkBanner message={error} action={{ label: 'Réessayer', onPress: () => void retry(), loading: retrying, testID: 'retry-deliveries' }} /> : null}
          {store ? <StoreApprovalBanner store={store} /> : null}
        </View>
      ) : null}
      {!store ? <Text style={styles.noStore}>Créez le profil de votre entreprise (adresse de retrait) pour demander des livraisons.</Text> : null}
      {stacked ? (
        <View style={styles.stack}>
          {kpis}
          {heroNode}
          {map}
          {lists}
        </View>
      ) : (
        <View style={[styles.bento, { height: bentoHeight }]}>
          {map}
          <View style={styles.right}>
            {kpis}
            {heroNode}
            {lists}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.canvas },
  pageContent: { flexGrow: 1, padding: PAGE_PADDING },
  banners: { marginTop: 16, gap: 12 },
  noStore: { marginTop: 12, fontSize: 14, lineHeight: 20, fontWeight: '600', color: palette.inkMuted },
  bento: { flexDirection: 'row', gap: TILE_GAP, marginTop: 16 },
  right: { width: RIGHT_WIDTH, gap: TILE_GAP },
  kpis: { flexDirection: 'row', gap: TILE_GAP },
  kpiSmall: { flex: 176 },
  kpiWide: { flex: 272 },
  lists: { flex: 1, flexDirection: 'row', gap: TILE_GAP },
  liveTile: { flex: 368 },
  doneTile: { flex: 272 },
  stack: { marginTop: 16, gap: TILE_GAP },
  mapStacked: { height: 420 },
  mapSide: { flex: 1, minWidth: 0 },
});
