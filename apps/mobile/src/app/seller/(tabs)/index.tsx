import { useCallback, useState } from 'react';
import { Linking, Modal, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import type { OrderDto, SellerStatsDto } from '@yaar/shared';
import { DisputeBox } from '../../../components/DisputeBox';
import { StoreApprovalBanner } from '../../../components/StoreApprovalBanner';
import {
  Badge,
  Banner,
  Button,
  Card,
  Chip,
  Empty,
  Field,
  Loading,
  Muted,
  Row,
  Screen,
  Stat,
  Subtitle,
  Title,
} from '../../../components/ui';
import { useNow } from '../../../hooks/useNow';
import { errorMessage } from '../../../lib/api';
import { formatFcfaShort, formatOrderNumber, summarizeItems, timeAgo } from '../../../lib/format';
import { sellerBadge } from '../../../lib/orderProgress';
import { telUrl } from '../../../lib/phone';
import { clampPrepTime, ordersOfStore, SELLER_ACTIVE_STATUSES, sortSellerOrders } from '../../../lib/sellerOrders';
import { useApi } from '../../../state/auth';
import { useSeller } from '../../../state/seller';
import { POLL_MS } from '../../../lib/publicConfig';
import { usePolling, useSocketEvent } from '../../../state/socket';
import { colors, radius, spacing, MAX_APP_WIDTH } from '../../../theme';

const REJECT_REASONS = ['Rupture de stock', 'Trop de commandes', 'Fermeture imminente'];

export default function SellerOrdersScreen() {
  const api = useApi();
  const { store, stores, error: storeError } = useSeller();
  const [orders, setOrders] = useState<OrderDto[] | null>(null);
  const [stats, setStats] = useState<SellerStatsDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rejecting, setRejecting] = useState<OrderDto | null>(null);
  const now = useNow(30_000);

  const storeId = store?.id;
  const load = useCallback(async (silent = false): Promise<boolean> => {
    if (!storeId) return true;
    if (!silent) setLoading(true);
    try {
      const [list, st] = await Promise.all([
        api.listOrders({ status: SELLER_ACTIVE_STATUSES, pageSize: 100 }),
        api.sellerStats(storeId),
      ]);
      setOrders(sortSellerOrders(ordersOfStore(list.items, storeId)));
      setStats(st);
      setError(null);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setLoading(false);
    }
  }, [api, storeId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  // Nouvelle commande ou changement de statut : le vendeur est dans la salle user:<id>.
  useSocketEvent('order.updated', () => void load());
  // Mode poll (Vercel) : nouvelles commandes et changements de statut relus toutes les 7 s à l'écran.
  usePolling(() => load(true), POLL_MS.sellerOrders, useIsFocused() && !!storeId);

  const replace = (o: OrderDto) => {
    setOrders((prev) => (prev ? sortSellerOrders(prev.map((x) => (x.id === o.id ? o : x))) : prev));
    void load();
  };

  if (stores === undefined) return <Loading />;
  if (!store) {
    return (
      <Screen>
        <Title>Commandes du jour</Title>
        {storeError ? <Banner message={storeError} /> : null}
        <Empty title="Vous n’avez pas encore de boutique.">
          <Button title="Créer ma boutique" color={colors.orange} onPress={() => router.push('/seller/store')} />
        </Empty>
      </Screen>
    );
  }

  return (
    <Screen refreshing={loading} onRefresh={() => void load()}>
      <Row gap={6}>
        <Muted>{store.name} ·</Muted>
        <Text style={{ color: store.isOpen ? colors.green : colors.red, fontWeight: '700' }}>
          ● {store.isOpen ? 'Ouvert' : 'Fermé'}
        </Text>
      </Row>
      <Title>Commandes du jour</Title>
      <StoreApprovalBanner store={store} />
      {!store.isOpen && (store.approvalStatus ?? 'APPROVED') === 'APPROVED' ? (
        <Banner message="Votre boutique est fermée : les clients ne peuvent pas commander (onglet Boutique)." tone="orange" />
      ) : null}
      {stats ? (
        <Row>
          <Stat value={String(stats.today.orders)} label="Commandes" />
          <Stat value={formatFcfaShort(stats.today.sales)} label="Ventes" />
          <Stat value={stats.today.avgPrepMinutes !== null ? `${stats.today.avgPrepMinutes} min` : '—'} label="Préparation" />
        </Row>
      ) : null}
      {error ? <Banner message={error} /> : null}
      {orders === null ? <Loading /> : null}
      {orders?.length === 0 ? <Empty title="Aucune commande en cours. Les nouvelles commandes s’affichent ici." /> : null}
      {orders?.map((o) => (
        <SellerOrderCard
          key={o.id}
          order={o}
          now={now}
          defaultPrep={store.prepTimeMinutes}
          onChanged={replace}
          onReject={() => setRejecting(o)}
        />
      ))}
      <RejectModal
        order={rejecting}
        onClose={() => setRejecting(null)}
        onDone={(o) => {
          setRejecting(null);
          replace(o);
        }}
      />
    </Screen>
  );
}

function SellerOrderCard({
  order: o,
  now,
  defaultPrep,
  onChanged,
  onReject,
}: {
  order: OrderDto;
  now: number;
  defaultPrep: number;
  onChanged: (o: OrderDto) => void;
  onReject: () => void;
}) {
  const api = useApi();
  const [prep, setPrep] = useState(defaultPrep);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const badge = sellerBadge(o.status);

  const run = async (fn: () => Promise<OrderDto>) => {
    setBusy(true);
    setError(null);
    try {
      onChanged(await fn());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card highlight={o.status === 'PENDING' ? colors.orange : undefined}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Subtitle style={{ fontSize: 16, flex: 1 }}>
          {formatOrderNumber(o.number)} · {o.client?.name ?? 'Client'}
        </Subtitle>
        <Badge label={badge.label} tone={badge.tone} />
      </Row>
      <Muted>
        {summarizeItems(o.items)}
        {o.dropoff ? ` · ${o.dropoff.address}` : ''}
      </Muted>
      {o.notes ? <Muted>Note : {o.notes}</Muted> : null}
      <Row style={{ justifyContent: 'space-between' }}>
        <Subtitle style={{ fontSize: 15 }}>{formatFcfaShort(o.itemsTotal)}</Subtitle>
        <Muted>{timeAgo(o.createdAt, now)}</Muted>
      </Row>
      {o.sellerPayout !== null ? <Muted>Vous recevrez : {formatFcfaShort(o.sellerPayout)}</Muted> : null}

      {o.status === 'PENDING' ? (
        <>
          <Row style={{ justifyContent: 'center' }}>
            <Muted>Temps de préparation :</Muted>
            <Chip label="−5" onPress={() => setPrep((p) => clampPrepTime(p - 5))} />
            <Text style={styles.prep}>{prep} min</Text>
            <Chip label="+5" onPress={() => setPrep((p) => clampPrepTime(p + 5))} />
          </Row>
          <Row>
            <Button title="Refuser" variant="outline" style={{ flex: 1 }} onPress={onReject} disabled={busy} />
            <Button
              title={`Accepter · ${prep} min`}
              color={colors.orange}
              style={{ flex: 2 }}
              loading={busy}
              onPress={() => void run(() => api.acceptOrder(o.id, prep))}
            />
          </Row>
        </>
      ) : null}
      {o.status === 'ACCEPTED' ? (
        <Button
          title="Prête → appeler un livreur"
          color={colors.green}
          loading={busy}
          onPress={() => void run(() => api.markReady(o.id))}
        />
      ) : null}
      {o.status === 'SEARCHING_DRIVER' || o.status === 'READY' ? <Muted>Recherche d’un livreur en cours…</Muted> : null}
      {o.driver && (o.status === 'ASSIGNED' || o.status === 'PICKED_UP') ? (
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted>
            🏍️ {o.driver.name ?? 'Livreur'}
            {o.driver.plate ? ` · ${o.driver.plate}` : ''}
          </Muted>
          {o.driver.phone ? (
            <Button title="📞 Appeler" small variant="outline" onPress={() => void Linking.openURL(telUrl(o.driver!.phone!))} />
          ) : null}
        </Row>
      ) : null}
      {error ? <Banner message={error} /> : null}
      {o.status !== 'PENDING' ? (
        <DisputeBox orderId={o.id} color={colors.orange} placeholder="Décrivez le problème (livreur en retard, commande abîmée…)" />
      ) : null}
    </Card>
  );
}

function RejectModal({
  order,
  onClose,
  onDone,
}: {
  order: OrderDto | null;
  onClose: () => void;
  onDone: (o: OrderDto) => void;
}) {
  const api = useApi();
  const [reason, setReason] = useState(REJECT_REASONS[0] ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal visible={!!order} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Subtitle>Refuser la commande {order ? formatOrderNumber(order.number) : ''}</Subtitle>
          <Muted>Le client est prévenu immédiatement.</Muted>
          <Row style={{ flexWrap: 'wrap' }}>
            {REJECT_REASONS.map((r) => (
              <Chip key={r} label={r} selected={reason === r} color={colors.orange} onPress={() => setReason(r)} />
            ))}
          </Row>
          <Field label="Motif" value={reason} onChangeText={setReason} maxLength={300} />
          {error ? <Banner message={error} /> : null}
          <Row>
            <Button title="Retour" variant="outline" style={{ flex: 1 }} onPress={onClose} />
            <Button
              title="Refuser"
              color={colors.red}
              style={{ flex: 1 }}
              loading={busy}
              disabled={!reason.trim()}
              onPress={async () => {
                if (!order) return;
                setBusy(true);
                setError(null);
                try {
                  onDone(await api.rejectOrder(order.id, reason.trim()));
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            />
          </Row>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  prep: { fontSize: 16, fontWeight: '800', minWidth: 60, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    // Sur le web, la fenêtre modale couvre tout l'écran : la feuille garde la largeur de l'application.
    width: '100%',
    maxWidth: MAX_APP_WIDTH,
    alignSelf: 'center',
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xl * 1.5,
  },
});
