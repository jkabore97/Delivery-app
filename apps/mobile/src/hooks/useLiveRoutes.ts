import { useEffect, useMemo, useRef, useState } from 'react';
import type { OrderDto } from '@yaar/shared';
import { cachedFromDetail, routesToFetch, withCachedRoute, type CachedRoute } from '../lib/liveRoutes';

/**
 * Carte d'ensemble de l'entreprise : complète les livraisons de la liste avec l'itinéraire de leur étape en cours
 * (GET /orders/:id, voir lib/liveRoutes.ts), pour que les tracés suivent les rues comme sur la page du
 * destinataire. Décidé à chaque nouvelle liste (rafraîchissement toutes les 10 s, événements temps réel) : le
 * détail n'est relu qu'à un changement d'étape ou de `routeComputedAt` (nouvel itinéraire sur un autre chemin), plus
 * un rafraîchissement de sécurité ; erreurs ignorées (la ligne droite en pointillés reste affichée, nouvel essai
 * après 15 s). `enabled` : écran au premier plan (sinon aucun appel). Rien n'est mis à jour après le démontage.
 */
export function useLiveRoutes(
  orders: OrderDto[] | null,
  fetchOrder: (id: string) => Promise<OrderDto>,
  enabled: boolean,
  now: () => number = Date.now,
): OrderDto[] | null {
  const cache = useRef(new Map<string, CachedRoute>());
  const inFlight = useRef(new Set<string>());
  const mounted = useRef(true);
  const [version, setVersion] = useState(0);
  const fetchRef = useRef(fetchOrder);
  fetchRef.current = fetchOrder;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!orders) return;
    // Livraisons terminées ou disparues de la liste : oubliées.
    const ids = new Set(orders.map((o) => o.id));
    for (const id of [...cache.current.keys()]) if (!ids.has(id)) cache.current.delete(id);
    if (!enabled) return;
    for (const id of routesToFetch(orders, cache.current, now(), inFlight.current)) {
      const listed = orders.find((o) => o.id === id)!;
      const { status, routeComputedAt } = listed;
      inFlight.current.add(id);
      fetchRef
        .current(id)
        .then((detail) => {
          if (!mounted.current) return;
          // Statut changé entre-temps : l'itinéraire reçu vaut pour l'étape du détail, pas pour l'ancienne.
          cache.current.set(id, cachedFromDetail(detail, routeComputedAt, now()));
          if (detail.status !== status || detail.route) setVersion((v) => v + 1);
        })
        .catch(() => {
          if (!mounted.current) return;
          const prev = cache.current.get(id);
          const same = !!prev && prev.status === status;
          cache.current.set(id, {
            status,
            route: same ? prev.route : null,
            computedAt: same ? prev.computedAt : undefined,
            fetchedAt: now(),
            failed: true,
          });
        })
        .finally(() => inFlight.current.delete(id));
    }
  }, [orders, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(
    () => (orders ? orders.map((o) => withCachedRoute(o, cache.current.get(o.id))) : null),
    [orders, version], // eslint-disable-line react-hooks/exhaustive-deps
  );
}
