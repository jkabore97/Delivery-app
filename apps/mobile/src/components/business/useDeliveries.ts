import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { OrderStatus, type OrderDto } from '@yaar/shared';
import { useLiveRoutes } from '../../hooks/useLiveRoutes';
import { errorMessage } from '../../lib/api';
import { BUSINESS_ACTIVE_STATUSES, sortActiveDeliveries } from '../../lib/delivery';
import { POLL_MS } from '../../lib/publicConfig';
import { useApi } from '../../state/auth';
import { useOrderRooms, usePolling, useSocketEvent } from '../../state/socket';
import { deliveredToday } from './dashboardData';
import { SUMMARY_POLL_MS } from './summary';

/**
 * Livraisons en cours de l'entreprise (accueil du téléphone, tableau de bord de l'ordinateur) : GET
 * /business/deliveries (statuts en cours) à chaque retour au premier plan, à chaque `order.updated` (mode socket) ou
 * toutes les 10 s (mode poll, la liste porte aussi les positions des livreurs) ; positions en direct par
 * `driver.location` (mode socket) ; itinéraires par les rues relus sur le détail (`useLiveRoutes`). `items` : liste
 * triée (colis en route d'abord, par heure d'arrivée) ; `deliveries` : la même avec les itinéraires.
 */
export function useActiveDeliveries(enabled: boolean) {
  const api = useApi();
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
  usePolling(load, POLL_MS.businessDeliveries, enabled);
  // Itinéraires par les rues : la liste n'en transporte pas (seulement leur date de calcul), le détail si.
  const fetchOrder = useCallback((id: string) => api.getOrder(id), [api]);
  const deliveries = useLiveRoutes(items, fetchOrder, enabled);
  return { items, deliveries, error, load };
}

/**
 * « Dernières livraisons » du tableau de bord : livraisons livrées aujourd'hui, la plus récente en premier (GET
 * /business/deliveries?status=DELIVERED, les 30 dernières demandes). Relu au premier plan, quand une livraison quitte
 * la liste des livraisons en cours (`activeKey` change : livrée ou annulée), et toutes les 30 s en mode poll.
 */
export function useDeliveredToday(enabled: boolean, activeKey: string, now: () => number = Date.now) {
  const api = useApi();
  const [items, setItems] = useState<OrderDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nowRef = useRef(now);
  nowRef.current = now;

  const load = useCallback(async (): Promise<boolean> => {
    try {
      const res = await api.listDeliveries({ status: [OrderStatus.DELIVERED], pageSize: 30 });
      setItems(deliveredToday(res.items, nowRef.current()));
      setError(null);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  }, [api]);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, activeKey, load]);
  usePolling(load, SUMMARY_POLL_MS, enabled);
  return { items, error, load };
}
