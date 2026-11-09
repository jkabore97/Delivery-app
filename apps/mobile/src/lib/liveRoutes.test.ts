import {
  cachedFromDetail,
  ROUTE_LEGACY_REFRESH_MS,
  ROUTE_MAX_PARALLEL,
  ROUTE_OFF_TRACK_M,
  ROUTE_RETRY_MS,
  ROUTE_SAFETY_REFRESH_MS,
  routesToFetch,
  withCachedRoute,
  type CachedRoute,
} from './liveRoutes';
import { delivery, route } from '../__tests__/fixtures';

const T = Date.parse('2026-11-08T14:20:00.000Z');
const C1 = '2026-11-08T14:00:00.000Z';
const C2 = '2026-11-08T14:03:10.000Z';
/** Élément de liste de l'API actuelle : pas de tracé, mais la date de calcul de l'itinéraire de l'étape. */
const picked = (id = 'a', routeComputedAt: string | null = C1) => delivery({ id, route: null, routeComputedAt });
const assigned = (id = 'b', routeComputedAt: string | null = C1) => delivery({ id, status: 'ASSIGNED', route: null, routeComputedAt });
/** Livreur à plus d'un kilomètre du tracé en cache (il a pris un autre chemin : l'API a recalculé l'itinéraire). */
const offTrack = (id = 'a', routeComputedAt: string | null = C2) =>
  delivery({
    id,
    route: null,
    routeComputedAt,
    driver: { ...delivery().driver!, lastLocation: { lat: 12.356, lng: -1.53, at: '2026-11-08T14:19:50.000Z', heading: 270 } },
  });
/** Élément de liste d'une API plus ancienne (sans `routeComputedAt`). */
const legacy = (id = 'a') => delivery({ id, route: null });
const read = (over: Partial<CachedRoute> = {}): CachedRoute => ({ status: 'PICKED_UP', route: route(), fetchedAt: T, computedAt: C1, ...over });

describe('itinéraires de la carte d’ensemble (lus sur GET /orders/:id)', () => {
  it('lus pour les livraisons en route seulement, une fois par étape ; rien tant que l’API n’a pas d’itinéraire', () => {
    const list = [picked('a'), assigned('b'), delivery({ id: 'c', status: 'SEARCHING_DRIVER', driver: null, route: null, routeComputedAt: null })];
    expect(routesToFetch(list, new Map(), T)).toEqual(['a', 'b']);
    const cache = new Map<string, CachedRoute>([
      ['a', read()],
      ['b', read({ status: 'ASSIGNED', route: route({ target: 'PICKUP' }) })],
    ]);
    expect(routesToFetch(list, cache, T + 60_000)).toEqual([]);
    // Nouvelle étape (colis récupéré) : l'itinéraire vers le retrait ne vaut plus.
    expect(routesToFetch([picked('b', C2)], cache, T)).toEqual(['b']);
    // Nouvelle étape, mais l'API n'a pas encore d'itinéraire (`routeComputedAt: null`) : rien à lire pour l'instant…
    expect(routesToFetch([picked('b', null)], cache, T)).toEqual([]);
    expect(routesToFetch([picked('z', null)], new Map(), T)).toEqual([]);
    // … puis lu dès que la liste annonce son calcul.
    expect(routesToFetch([picked('b', C2)], cache, T + 10_000)).toEqual(['b']);
    // La liste porte déjà un tracé valable : rien à demander.
    expect(routesToFetch([delivery({ id: 'z' })], new Map(), T)).toEqual([]);
  });

  it('nouvel itinéraire sur un autre chemin : relu à la liste suivante ; sinon seulement au rafraîchissement de sécurité', () => {
    const cache = new Map([['a', read()]]);
    // Même date de calcul : rien pendant 5 min (la liste est relue toutes les 10 s).
    for (let t = T; t < T + ROUTE_SAFETY_REFRESH_MS; t += 10_000) expect(routesToFetch([picked('a', C1)], cache, t)).toEqual([]);
    expect(routesToFetch([picked('a', C1)], cache, T + ROUTE_SAFETY_REFRESH_MS)).toEqual(['a']);
    // L'API a recalculé l'itinéraire parce que le livreur a quitté le tracé : relu tout de suite (10 s après la lecture).
    expect(routesToFetch([offTrack('a', C2)], cache, T + 10_000)).toEqual(['a']);
    // Recalcul périodique de l'API (tracé de plus de 3 min) alors que le livreur suit toujours le tracé en cache : même
    // chemin, la relecture attend le rafraîchissement de sécurité.
    expect(routesToFetch([picked('a', C2)], cache, T + 10_000)).toEqual([]);
    expect(routesToFetch([picked('a', C2)], cache, T + ROUTE_SAFETY_REFRESH_MS)).toEqual(['a']);
    // Position du livreur inconnue : relu (on ne peut pas savoir s'il a changé de chemin).
    expect(routesToFetch([delivery({ id: 'a', route: null, routeComputedAt: C2, driver: { ...delivery().driver!, lastLocation: null } })], cache, T + 10_000)).toEqual(['a']);
    // Même instant écrit autrement : pas un nouvel itinéraire.
    expect(routesToFetch([offTrack('a', '2026-11-08T14:00:00Z')], cache, T + 10_000)).toEqual([]);
    expect(ROUTE_OFF_TRACK_M).toBeLessThan(120); // l'API recalcule à 120 m : on le voit avant.
  });

  it('itinéraire manquant ou appel en échec : nouvel essai après ROUTE_RETRY_MS', () => {
    // La liste annonce un itinéraire que le détail n'a pas donné : nouvel essai après 15 s.
    const none = new Map([['a', read({ route: null })]]);
    expect(routesToFetch([picked('a', C1)], none, T + ROUTE_RETRY_MS - 1)).toEqual([]);
    expect(routesToFetch([picked('a', C1)], none, T + ROUTE_RETRY_MS)).toEqual(['a']);
    // Réseau en échec : le tracé déjà reçu reste affiché, nouvel essai après 15 s (pas à chaque liste).
    const failed = new Map([['a', read({ failed: true })]]);
    expect(routesToFetch([picked('a', C2)], failed, T + ROUTE_RETRY_MS - 1)).toEqual([]);
    expect(routesToFetch([picked('a', C2)], failed, T + ROUTE_RETRY_MS)).toEqual(['a']);
  });

  it('API sans routeComputedAt : rafraîchi toutes les 60 s, 15 s sans tracé', () => {
    const ok = new Map([['a', read({ computedAt: undefined })]]);
    expect(routesToFetch([legacy()], new Map(), T)).toEqual(['a']);
    expect(routesToFetch([legacy()], ok, T + ROUTE_LEGACY_REFRESH_MS - 1)).toEqual([]);
    expect(routesToFetch([legacy()], ok, T + ROUTE_LEGACY_REFRESH_MS)).toEqual(['a']);
    const none = new Map([['a', read({ route: null, computedAt: undefined })]]);
    expect(routesToFetch([legacy()], none, T + ROUTE_RETRY_MS - 1)).toEqual([]);
    expect(routesToFetch([legacy()], none, T + ROUTE_RETRY_MS)).toEqual(['a']);
  });

  it(`au plus ${ROUTE_MAX_PARALLEL} appels à la fois, jamais deux fois le même`, () => {
    const list = ['a', 'b', 'c', 'd', 'e'].map((id) => picked(id));
    expect(routesToFetch(list, new Map(), T)).toEqual(['a', 'b', 'c']);
    expect(routesToFetch(list, new Map(), T, new Set(['a', 'b']))).toEqual(['c']);
  });

  it('cache : date annoncée par la liste au moment de l’appel (à défaut, date du tracé lu)', () => {
    expect(cachedFromDetail(delivery({ routeComputedAt: C2 }), C1, T)).toMatchObject({ status: 'PICKED_UP', computedAt: C1, fetchedAt: T });
    // Liste sans `routeComputedAt` (API plus ancienne) : date du tracé du détail.
    expect(cachedFromDetail(delivery({ route: route({ computedAt: C2 }) }), undefined, T).computedAt).toBe(C2);
    expect(cachedFromDetail(delivery({ route: null }), C1, T)).toMatchObject({ route: null, computedAt: C1 });
  });

  it('liste et détail en désaccord sur la date : pas de relecture à chaque rafraîchissement de la liste', () => {
    // Lu avec la liste à C1 ; le détail a répondu un tracé daté C2 (recalculé entre-temps, ou dates incohérentes).
    const cache = new Map([['a', cachedFromDetail(delivery({ route: route({ computedAt: C2 }), routeComputedAt: C2 }), C1, T)]]);
    for (let t = T + 10_000; t < T + ROUTE_SAFETY_REFRESH_MS; t += 10_000) expect(routesToFetch([picked('a', C1)], cache, t)).toEqual([]);
    // La liste annonce ensuite C2 (livreur sur un autre chemin) : une relecture.
    expect(routesToFetch([offTrack('a', C2)], cache, T + 20_000)).toEqual(['a']);
  });

  it('tracé ajouté à la livraison seulement s’il vaut pour son étape actuelle', () => {
    const r = route();
    expect(withCachedRoute(picked(), { status: 'PICKED_UP', route: r, fetchedAt: T }).route).toBe(r);
    expect(withCachedRoute(picked(), { status: 'ASSIGNED', route: route({ target: 'PICKUP' }), fetchedAt: T }).route).toBeNull();
    expect(withCachedRoute(picked(), { status: 'PICKED_UP', route: route({ target: 'PICKUP' }), fetchedAt: T }).route).toBeNull();
    expect(withCachedRoute(picked(), undefined).route).toBeNull();
    const own = delivery();
    expect(withCachedRoute(own, { status: 'PICKED_UP', route: route({ points: [[1, 1], [2, 2]] }), fetchedAt: T })).toBe(own);
  });
});
