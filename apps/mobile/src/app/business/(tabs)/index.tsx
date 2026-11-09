import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { OrderDto } from '@yaar/shared';
import { LiveMap } from '../../../components/map/LiveMap';
import { StoreApprovalBanner } from '../../../components/StoreApprovalBanner';
import { Badge, Banner, Button, Card, Empty, Loading, Muted, Row, Subtitle, Title } from '../../../components/ui';
import { VEHICLE_EMOJI } from '../../../components/VehicleOptions';
import { useFollowCamera } from '../../../hooks/useFollowCamera';
import { errorMessage } from '../../../lib/api';
import { BUSINESS_ACTIVE_STATUSES, businessStatusLabel, sortActiveDeliveries } from '../../../lib/delivery';
import { formatOrderNumber, timeAgo } from '../../../lib/format';
import { arrivalSummary, overviewScene } from '../../../lib/liveScene';
import { POLL_MS } from '../../../lib/publicConfig';
import { useApi } from '../../../state/auth';
import { isBusinessApproved, useBusiness } from '../../../state/business';
import { useOrderRooms, usePolling, useSocket, useSocketEvent } from '../../../state/socket';
import { colors, radius, spacing } from '../../../theme';

/** Onglet « Livraisons » : carte d'ensemble (livreurs en direct) et livraisons en cours. */
export default function BusinessDeliveriesScreen() {
  const api = useApi();
  const { store, stores, error: storeError } = useBusiness();
  const { pollIntervalMs } = useSocket();
  const [items, setItems] = useState<OrderDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
    setItems((prev) =>
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

  const business = store ? { lat: store.lat, lng: store.lng } : null;
  const overview = useMemo(() => overviewScene(business, items ?? [], store?.name), [items, store?.lat, store?.lng, store?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const camera = useFollowCamera('overview', overview.fitPoints.length);
  const now = Date.now();

  if (stores === undefined) return <Loading />;

  const searching = (items ?? []).filter((o) => o.status === 'SEARCHING_DRIVER' || o.status === 'PENDING').length;
  const onTheWay = (items ?? []).length - searching;
  const canRequest = isBusinessApproved(store);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Muted numberOfLines={1}>{store ? store.name : 'Yaar Livraison · Entreprise'}</Muted>
          <Title style={{ fontSize: 22 }}>Livraisons en cours</Title>
        </View>
        {store && canRequest ? (
          <Button title="＋ Nouvelle" small color={colors.orange} onPress={() => router.push('/business/nouvelle')} testID="new-delivery" />
        ) : null}
      </View>

      <View style={styles.mapBox}>
        {/* Carte démontée quand une livraison est ouverte par-dessus : une seule carte (contexte WebGL) à la fois. */}
        {focused ? (
          <LiveMap
            style={StyleSheet.absoluteFill}
            markers={overview.markers}
            lines={overview.lines}
            fitPoints={overview.fitPoints}
            follow={camera.follow}
            recenterKey={camera.recenterKey}
            onUserGesture={camera.onUserGesture}
            padding={{ top: 64, bottom: 44, left: 60, right: 60 }}
            bottomInset={0}
            animationMs={Math.max(pollIntervalMs, POLL_MS.businessDeliveries)}
            testID="overview-map"
          />
        ) : null}
        <View style={styles.mapChips} pointerEvents="none">
          <View style={styles.mapChip}>
            <Text style={styles.mapChipText}>🛵 {onTheWay} en route</Text>
          </View>
          {searching > 0 ? (
            <View style={[styles.mapChip, { backgroundColor: colors.orangeLight }]}>
              <Text style={[styles.mapChipText, { color: '#9A4F00' }]}>📡 {searching} en recherche</Text>
            </View>
          ) : null}
        </View>
        {camera.showRecenter ? (
          <Pressable style={styles.recenter} onPress={camera.recenter} accessibilityRole="button" testID="recenter-button">
            <Text style={styles.recenterText}>◎ Recentrer</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        {storeError ? <Banner message={storeError} /> : null}
        {!store ? (
          <Empty title="Créez le profil de votre entreprise pour demander des livraisons.">
            <Button title="Créer mon profil d’entreprise" color={colors.orange} onPress={() => router.navigate('/business/profile')} />
          </Empty>
        ) : (
          <StoreApprovalBanner store={store} />
        )}
        {error ? <Banner message={error} /> : null}
        {store && items === null && !error ? <Loading label="Chargement des livraisons…" /> : null}
        {store && items?.length === 0 ? (
          <Card>
            <Subtitle style={{ fontSize: 16 }}>Aucune livraison en cours</Subtitle>
            <Muted>Demandez un livreur : il récupère le colis chez vous et votre client le suit en direct.</Muted>
            {canRequest ? (
              <Button title="＋ Nouvelle livraison" color={colors.orange} onPress={() => router.push('/business/nouvelle')} />
            ) : null}
          </Card>
        ) : null}
        {items?.map((o) => {
          const badge = businessStatusLabel(o.status);
          const arrival = arrivalSummary(o, now);
          return (
            <Pressable
              key={o.id}
              onPress={() => router.push(`/business/livraison/${o.id}`)}
              accessibilityRole="button"
              testID={`delivery-${o.id}`}
            >
              <Card highlight={o.status === 'SEARCHING_DRIVER' ? colors.orange : undefined}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Subtitle style={{ fontSize: 16, flex: 1 }}>
                    {formatOrderNumber(o.number)} · {o.recipientName ?? 'Destinataire'}
                  </Subtitle>
                  <Badge label={badge.label} tone={badge.tone} />
                </Row>
                {o.dropoff ? (
                  <Muted numberOfLines={1}>
                    📍 {o.dropoff.address}
                    {o.dropoff.landmark ? ` · ${o.dropoff.landmark}` : ''}
                  </Muted>
                ) : null}
                {o.driver ? (
                  <Text style={styles.driverLine} numberOfLines={1}>
                    {VEHICLE_EMOJI[o.driver.vehicleType]} {o.driver.name ?? 'Livreur'}
                    {arrival ? ` · ${arrival}` : ''}
                  </Text>
                ) : (
                  <Muted>Recherche d’un livreur · demandée {timeAgo(o.createdAt, now)}</Muted>
                )}
              </Card>
            </Pressable>
          );
        })}
        <View style={{ height: spacing.lg }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  mapBox: { height: 290, marginHorizontal: spacing.md, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#E8ECEF' },
  mapChips: { position: 'absolute', top: spacing.sm, left: spacing.sm, flexDirection: 'row', gap: 6 },
  mapChip: { backgroundColor: colors.white, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  mapChipText: { fontSize: 12, fontWeight: '800', color: colors.text },
  recenter: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.lg + 4,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  recenterText: { fontWeight: '800', color: colors.text },
  list: { padding: spacing.lg, gap: spacing.md },
  driverLine: { fontSize: 13, color: colors.green, fontWeight: '700' },
});
