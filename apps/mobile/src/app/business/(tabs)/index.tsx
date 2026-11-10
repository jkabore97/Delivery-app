import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '../../../components/Text';
import { router, useIsFocused } from 'expo-router';
import type { OrderDto, StoreDto } from '@yaar/shared';
import { DarkBanner } from '../../../components/business/DarkForm';
import { focusedDelivery, isSearching, neighbourhood } from '../../../components/business/dashboardData';
import { BusinessDashboard } from '../../../components/business/desktop/Dashboard';
import { useIsDesktop } from '../../../components/business/desktop/layout';
import { BusinessMark, NewDeliveryButton } from '../../../components/business/parts';
import { CompactDeliveryCard, HeroDeliveryCard, KpiChips, MapSummaryPill } from '../../../components/business/phone/HomeParts';
import { useBusinessSummary, useSummaryRefresh } from '../../../components/business/summary';
import { useActiveDeliveries } from '../../../components/business/useDeliveries';
import { CourierIllustration } from '../../../components/design/CourierIllustration';
import { MapIconButton } from '../../../components/design/Pill';
import { StoreApprovalBanner } from '../../../components/StoreApprovalBanner';
import { LiveTrackingLayout } from '../../../components/tracking/LiveTrackingLayout';
import { Loading } from '../../../components/ui';
import { overviewScene } from '../../../lib/liveScene';
import { POLL_MS } from '../../../lib/publicConfig';
import { isBusinessApproved, useBusiness } from '../../../state/business';
import { useSocket } from '../../../state/socket';
import { palette, spacing, typography } from '../../../theme';

/** Place des boutons latéraux de la barre du haut de LiveTrackingLayout (la pastille de la carte s'aligne à gauche). */
const TOP_SIDE_WIDTH = 52;

/**
 * Explication sous « Aucune livraison en cours » : l'invitation à demander un livreur seulement si c'est possible ;
 * sinon (en attente de validation, suspendue), le bandeau juste au-dessus dit pourquoi, le texte ne le répète pas.
 */
function emptyText(store: StoreDto): string {
  return isBusinessApproved(store)
    ? 'Demandez un livreur : il récupère le colis chez vous et votre client le suit en direct sur la carte.'
    : 'Vos livraisons s’afficheront ici, avec leur livreur en direct sur la carte.';
}

/** Accueil de l'entreprise : tableau de bord sur ordinateur, carte et feuille sur téléphone. */
export default function BusinessDeliveriesScreen() {
  const desktop = useIsDesktop();
  return desktop ? <BusinessDashboard /> : <PhoneHome />;
}

/**
 * Accueil de l'entreprise sur téléphone (planche Cobalt) : carte claire sur le haut de l'écran (son point de retrait,
 * les livreurs en direct, les destinataires à leurs initiales, itinéraires par les rues), pastille « 3 en cours » et
 * bouton « Recentrer » posés dessus ; feuille blanche : nom de l'entreprise en titre, « Nouvelle livraison » en pilule
 * cobalt pleine largeur, chiffres du jour (en cours, livrées, à reverser en soleil), puis la livraison dont le colis
 * arrive le premier en tuile cobalt (toucher → suivi) et les autres en cartes compactes (deux côte à côte s'il y en a
 * exactement deux, sinon en liste), chacune avec WhatsApp / Appeler à côté de la partie qui ouvre le suivi.
 */
function PhoneHome() {
  const { store, stores, error: storeError, refreshStores } = useBusiness();
  const { pollIntervalMs } = useSocket();
  const { summary } = useBusinessSummary();
  const { width, height } = useWindowDimensions();
  const focused = useIsFocused();
  const enabled = focused && !!store;
  const { items, deliveries, error, load } = useActiveDeliveries(enabled);
  useSummaryRefresh(enabled);
  const [retrying, setRetrying] = useState(false);
  // « Recentrer » : un nouveau `stageKey` recadre la carte et reprend le suivi (LiveTrackingLayout).
  const [recenter, setRecenter] = useState(0);

  // « Réessayer » : en mode socket, rien ne relance le chargement tout seul après une erreur.
  const retry = async () => {
    setRetrying(true);
    try {
      await Promise.all([load(), storeError ? refreshStores() : Promise.resolve()]);
    } finally {
      setRetrying(false);
    }
  };

  const business = store ? { lat: store.lat, lng: store.lng } : null;
  const overview = useMemo(
    () => overviewScene(business, deliveries ?? [], store?.name, { recipientInitials: true }),
    [deliveries, store?.lat, store?.lng, store?.name], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (stores === undefined) return <Loading />;

  const list = deliveries ?? [];
  const now = Date.now();
  const searching = list.filter(isSearching).length;
  const hero = focusedDelivery(list);
  const others = hero ? list.filter((o) => o.id !== hero.id) : [];
  const small = width < 380;
  // Petit téléphone (360 × 640) : le titre et « Nouvelle livraison » défilent avec la liste (la feuille est courte).
  const short = height < 700;
  // Rien en cours : la carte montre le quartier de l'entreprise (~2 km), pas son seul marqueur au zoom maximal.
  const fitPoints = list.length === 0 && business ? neighbourhood(business) : overview.fitPoints;
  // Nouvelle livraison ou nouvelle étape : la carte recadre (même si elle avait été déplacée).
  const stageKey = `${list.map((o) => `${o.id}:${o.status}`).sort().join('|') || 'empty'}#${recenter}`;
  const openDelivery = (o: OrderDto) => router.push(`/business/livraison/${o.id}`);

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, small && styles.titleSmall]} numberOfLines={1} accessibilityRole="header">
          {store ? store.name : 'Yaar Livraison'}
        </Text>
        {store ? <BusinessMark name={store.name} size={small ? 36 : 40} /> : null}
      </View>
      <NewDeliveryButton stores={stores} store={store} />
    </View>
  );

  return (
    <LiveTrackingLayout
      markers={overview.markers}
      lines={overview.lines}
      fitPoints={fitPoints}
      stageKey={stageKey}
      animationMs={Math.max(pollIntervalMs, POLL_MS.businessDeliveries)}
      // La carte garde le haut de l'écran (~40 %) ; sans livraison, la feuille reste courte.
      sheetMaxRatio={list.length > 0 ? (short ? 0.66 : 0.62) : 0.56}
      // Cadrage : les épingles tiennent au-dessus de la mention des données (la carte est courte ici).
      fitBottomMargin={44}
      insetBottom={false}
      // Une seule carte (contexte WebGL) à la fois : démontée quand une livraison est ouverte par-dessus.
      mapVisible={focused}
      topCenter={
        list.length > 0 ? (
          <View style={styles.pillSlot} pointerEvents="box-none">
            <MapSummaryPill total={list.length} searching={searching} />
          </View>
        ) : null
      }
      topRight={
        <MapIconButton icon="recenter" color={palette.cobalt} onPress={() => setRecenter((n) => n + 1)} accessibilityLabel="Recentrer la carte" testID="home-recenter" />
      }
      sheetHeader={short ? undefined : header}
      testID="business-home"
    >
      {short ? header : null}
      {storeError ? (
        <DarkBanner message={storeError} action={{ label: 'Réessayer', onPress: () => void retry(), loading: retrying, testID: 'retry-store' }} />
      ) : null}
      {store ? <StoreApprovalBanner store={store} /> : <Text style={styles.muted}>Créez le profil de votre entreprise pour demander des livraisons.</Text>}
      {store ? <KpiChips active={items ? list.length : (summary?.active ?? 0)} summary={summary} dense={short} /> : null}
      {/* Petit téléphone : pas de titre de liste (la pastille « 3 en cours » le dit), la tuile héros remonte. */}
      {store && !short ? (
        <View style={styles.sectionRow}>
          <Text style={styles.section} accessibilityRole="header">
            Livraisons en cours
          </Text>
          {list.length > 0 ? <Text style={styles.sectionCount}>{list.length}</Text> : null}
        </View>
      ) : null}
      {error ? (
        <DarkBanner message={error} action={{ label: 'Réessayer', onPress: () => void retry(), loading: retrying, testID: 'retry-deliveries' }} />
      ) : null}
      {store && items === null && !error ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.cobalt} />
          <Text style={styles.muted}>Chargement des livraisons…</Text>
        </View>
      ) : null}
      {store && items !== null && list.length === 0 ? (
        <View style={styles.empty} testID="no-active-delivery">
          <CourierIllustration width={short ? 104 : 120} />
          <View style={styles.emptyText}>
            <Text style={styles.emptyTitle}>Aucune livraison en cours</Text>
            <Text style={styles.muted}>{emptyText(store)}</Text>
          </View>
        </View>
      ) : null}
      {hero ? <HeroDeliveryCard order={hero} now={now} onPress={() => openDelivery(hero)} compact={small} /> : null}
      {others.length === 2 ? (
        <View style={styles.duo}>
          {others.map((o) => (
            <CompactDeliveryCard key={o.id} order={o} now={now} businessName={store?.name ?? null} onPress={() => openDelivery(o)} layout="duo" />
          ))}
        </View>
      ) : (
        others.map((o) => (
          <CompactDeliveryCard key={o.id} order={o} now={now} businessName={store?.name ?? null} onPress={() => openDelivery(o)} layout="row" />
        ))
      )}
    </LiveTrackingLayout>
  );
}

const styles = StyleSheet.create({
  header: { gap: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 40 },
  title: { ...typography.display, flex: 1, color: palette.ink },
  titleSmall: { fontSize: 28, lineHeight: 32, letterSpacing: -0.8 },
  // La pastille s'aligne sur le bord gauche de la carte (par-dessus la place vide du bouton de gauche).
  pillSlot: { alignSelf: 'stretch', alignItems: 'flex-start', marginLeft: -TOP_SIDE_WIDTH },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  section: { fontSize: 16, lineHeight: 21, fontWeight: '800', letterSpacing: -0.2, color: palette.ink },
  sectionCount: {
    minWidth: 24,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    overflow: 'hidden',
    backgroundColor: palette.cobaltTint,
    color: palette.cobaltText,
    fontSize: 12,
    lineHeight: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  duo: { flexDirection: 'row', gap: 8 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  muted: { color: palette.inkMuted, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  empty: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: 22, backgroundColor: palette.canvas, paddingVertical: 12, paddingLeft: 8, paddingRight: 16 },
  emptyText: { flex: 1, gap: 4 },
  emptyTitle: { fontSize: 16, lineHeight: 21, fontWeight: '800', letterSpacing: -0.2, color: palette.ink },
});
