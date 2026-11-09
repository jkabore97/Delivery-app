import { routeProgress, type OrderDto, type OrderStatus, type RouteDto } from '@yaar/shared';

/**
 * Itinéraires des livraisons en cours sur la carte d'ensemble de l'entreprise. La liste (GET /business/deliveries)
 * ne transporte pas les tracés (charge utile réduite, voir apps/api orders.list `includeRoute: false`) : sans eux, la
 * carte reliait le livreur au destinataire par une ligne droite en pointillés alors que la page du destinataire
 * (GET /track/:token) dessinait le trajet par les rues. GET /orders/:id donne l'itinéraire de l'étape en cours.
 *
 * Quand le relire : la liste porte la date de calcul de cet itinéraire (`routeComputedAt`, rafraîchie à chaque
 * rafraîchissement de la liste, 10 s en mode poll, à chaque `order.updated` en mode socket). Le détail n'est donc
 * relu qu'à un changement d'étape ou de cette date, plus un rafraîchissement de sécurité toutes les 5 min. L'API
 * recalcule l'itinéraire quand le livreur s'écarte du tracé (plus de 120 m) ou, au fil de ses positions, quand le
 * tracé a plus de 3 min : dans le premier cas le chemin change, il est relu à la liste suivante (le livreur est
 * alors loin du tracé en cache) ; dans le second, le chemin devant le livreur est le même (le tracé en cache est
 * rogné à sa position), la relecture attend le rafraîchissement de sécurité. Pas encore d'itinéraire
 * (`routeComputedAt: null`) : rien à lire, le premier calcul se verra à la liste suivante. Appel en échec, ou
 * itinéraire annoncé par la liste mais absent du détail : nouvel essai après 15 s. API plus ancienne (liste sans
 * `routeComputedAt`) : comme avant, relu toutes les 60 s (15 s sans tracé).
 */

/** Rafraîchissement de sécurité d'un itinéraire déjà reçu (la liste n'a pas signalé de nouveau calcul). */
export const ROUTE_SAFETY_REFRESH_MS = 5 * 60_000;
/** Ancienne API (liste sans `routeComputedAt`) : rafraîchissement d'un itinéraire déjà reçu. */
export const ROUTE_LEGACY_REFRESH_MS = 60_000;
/** Itinéraire manquant (appel en échec, ou annoncé par la liste mais absent du détail) : nouvel essai. */
export const ROUTE_RETRY_MS = 15_000;
/** Appels simultanés au plus (une entreprise peut avoir beaucoup de livraisons en cours). */
export const ROUTE_MAX_PARALLEL = 3;
/**
 * Écart (m) du livreur au tracé en cache au-delà duquel un nouvel itinéraire annoncé par la liste est relu tout de
 * suite (l'API recalcule à 120 m ; en deçà, les imprécisions du GPS).
 */
export const ROUTE_OFF_TRACK_M = 60;

export interface CachedRoute {
  /** Statut de la livraison quand l'itinéraire a été lu : il ne vaut que pour cette étape. */
  status: OrderStatus;
  route: RouteDto | null;
  fetchedAt: number;
  /**
   * `routeComputedAt` de la LISTE au moment de la lecture (à défaut, date du tracé lu) : la lecture suivante n'a lieu
   * que lorsque la liste annonce une autre date. Comparer à la liste elle-même (et non à la date du détail) évite de
   * relire à chaque rafraîchissement si les deux ne concordaient pas. undefined : API sans ce champ.
   */
  computedAt?: string | null;
  /** Dernier appel en échec (réseau) : nouvel essai après ROUTE_RETRY_MS, le tracé déjà reçu reste affiché. */
  failed?: boolean;
}

const ROUTE_TARGET: Partial<Record<OrderStatus, RouteDto['target']>> = { ASSIGNED: 'PICKUP', PICKED_UP: 'DROPOFF' };

function usableRoute(route: RouteDto | null | undefined, status: OrderStatus): route is RouteDto {
  return !!route && route.target === ROUTE_TARGET[status] && route.points.length >= 2;
}

/** Deux dates ISO désignent-elles le même instant (comparaison des horodatages, pas du texte) ? */
function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return Number.isFinite(ta) && Number.isFinite(tb) ? ta === tb : a === b;
}

/** Le livreur a-t-il quitté le tracé en cache (autre chemin) ? Position inconnue : on le suppose (relecture). */
function offCachedRoute(o: OrderDto, route: RouteDto): boolean {
  const loc = o.driver?.lastLocation;
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return true;
  return routeProgress(route, { lat: loc.lat, lng: loc.lng }).offRouteM > ROUTE_OFF_TRACK_M;
}

/** Faut-il (re)lire le détail de cette livraison maintenant ? */
function isDue(o: OrderDto, c: CachedRoute | undefined, now: number): boolean {
  const listed = o.routeComputedAt; // undefined : API sans ce champ
  const age = c ? now - c.fetchedAt : Infinity;
  // Nouvelle livraison ou nouvelle étape : à lire, sauf si l'API dit qu'elle n'a pas encore d'itinéraire.
  if (!c || c.status !== o.status) return listed !== null;
  // Pas (encore) d'itinéraire côté API : rien à lire, le premier calcul changera `routeComputedAt`.
  if (listed === null) return false;
  if (c.failed) return age >= ROUTE_RETRY_MS;
  const has = usableRoute(c.route, o.status);
  if (listed === undefined) return age >= (has ? ROUTE_LEGACY_REFRESH_MS : ROUTE_RETRY_MS);
  // Nouvel itinéraire calculé par l'API depuis la dernière lecture : relu tout de suite s'il suit un autre chemin
  // (livreur loin du tracé en cache) ; recalcul périodique sur le même chemin : au rafraîchissement de sécurité.
  if (!sameInstant(listed, c.computedAt) && (!has || offCachedRoute(o, c.route!))) return true;
  return age >= (has ? ROUTE_SAFETY_REFRESH_MS : ROUTE_RETRY_MS);
}

/**
 * Livraisons dont il faut (re)lire l'itinéraire (voir l'en-tête du fichier) : livreur en route (ASSIGNED /
 * PICKED_UP), sans tracé dans la liste. Les appels en cours (`inFlight`) ne sont pas relancés ; au plus `max` à la fois.
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
    if (isDue(o, cache.get(o.id), now)) out.push(o.id);
  }
  return out;
}

/**
 * Entrée du cache après une lecture réussie du détail. `listedAt` : `routeComputedAt` de la liste au moment de
 * l'appel (la référence des comparaisons suivantes) ; absent de la liste (ancienne API) : date du tracé lu.
 */
export function cachedFromDetail(detail: OrderDto, listedAt: string | null | undefined, now: number): CachedRoute {
  const computedAt = listedAt !== undefined ? listedAt : (detail.routeComputedAt ?? detail.route?.computedAt);
  return { status: detail.status, route: detail.route ?? null, fetchedAt: now, computedAt };
}

/** La livraison avec l'itinéraire lu par GET /orders/:id, s'il vaut pour son étape actuelle (sinon inchangée). */
export function withCachedRoute(o: OrderDto, cached: CachedRoute | undefined): OrderDto {
  if (usableRoute(o.route, o.status)) return o;
  if (!cached || cached.status !== o.status || !usableRoute(cached.route, o.status)) return o;
  return { ...o, route: cached.route };
}
