import type { OrderDto, OrderStatus, RouteDto } from '@yaar/shared';

/**
 * Itinéraires des livraisons en cours sur la carte d'ensemble de l'entreprise. La liste (GET /business/deliveries)
 * ne transporte pas les tracés (charge utile réduite, voir apps/api orders.list `includeRoute: false`) : sans eux, la
 * carte reliait le livreur au destinataire par une ligne droite en pointillés alors que la page du destinataire
 * (GET /track/:token) dessinait le trajet par les rues. GET /orders/:id donne l'itinéraire de l'étape en cours :
 * il est demandé une fois par étape, puis rafraîchi de temps en temps (l'API le recalcule au plus toutes les 30 s,
 * quand le livreur s'écarte du tracé ou au bout de 3 min). Entre deux, le tracé est rogné à la position du livreur.
 */

/** Rafraîchissement d'un itinéraire déjà reçu. */
export const ROUTE_REFRESH_MS = 60_000;
/** Pas encore d'itinéraire (calcul en cours côté API, juste après l'affectation ou le retrait) : nouvel essai. */
export const ROUTE_RETRY_MS = 15_000;
/** Appels simultanés au plus (une entreprise peut avoir beaucoup de livraisons en cours). */
export const ROUTE_MAX_PARALLEL = 3;

export interface CachedRoute {
  /** Statut de la livraison quand l'itinéraire a été lu : il ne vaut que pour cette étape. */
  status: OrderStatus;
  route: RouteDto | null;
  fetchedAt: number;
  /** Dernier appel en échec (réseau) : nouvel essai après ROUTE_RETRY_MS, le tracé déjà reçu reste affiché. */
  failed?: boolean;
}

const ROUTE_TARGET: Partial<Record<OrderStatus, RouteDto['target']>> = { ASSIGNED: 'PICKUP', PICKED_UP: 'DROPOFF' };

function usableRoute(route: RouteDto | null | undefined, status: OrderStatus): route is RouteDto {
  return !!route && route.target === ROUTE_TARGET[status] && route.points.length >= 2;
}

/**
 * Livraisons dont il faut (re)demander l'itinéraire : livreur en route (ASSIGNED / PICKED_UP), sans tracé dans la
 * liste, et jamais lu pour cette étape, ou lu sans tracé il y a plus de ROUTE_RETRY_MS, ou lu il y a plus de
 * ROUTE_REFRESH_MS. Les appels en cours (`inFlight`) ne sont pas relancés ; au plus `max` à la fois.
 */
export function routesToFetch(
  orders: readonly OrderDto[],
  cache: ReadonlyMap<string, CachedRoute>,
  now: number,
  inFlight: ReadonlySet<string> = new Set(),
  max: number = ROUTE_MAX_PARALLEL,
): string[] {
  const out: string[] = [];
  const room = Math.max(0, max - inFlight.size);
  for (const o of orders) {
    if (out.length >= room) break;
    if (!ROUTE_TARGET[o.status] || inFlight.has(o.id)) continue;
    if (usableRoute(o.route, o.status)) continue;
    const c = cache.get(o.id);
    const stale =
      !c ||
      c.status !== o.status ||
      now - c.fetchedAt >= (usableRoute(c.route, o.status) && !c.failed ? ROUTE_REFRESH_MS : ROUTE_RETRY_MS);
    if (stale) out.push(o.id);
  }
  return out;
}

/** La livraison avec l'itinéraire lu par GET /orders/:id, s'il vaut pour son étape actuelle (sinon inchangée). */
export function withCachedRoute(o: OrderDto, cached: CachedRoute | undefined): OrderDto {
  if (usableRoute(o.route, o.status)) return o;
  if (!cached || cached.status !== o.status || !usableRoute(cached.route, o.status)) return o;
  return { ...o, route: cached.route };
}
