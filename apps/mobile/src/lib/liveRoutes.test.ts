import { ROUTE_MAX_PARALLEL, ROUTE_REFRESH_MS, ROUTE_RETRY_MS, routesToFetch, withCachedRoute, type CachedRoute } from './liveRoutes';
import { delivery, route } from '../__tests__/fixtures';

const T = Date.parse('2026-11-08T14:20:00.000Z');
const picked = (id = 'a') => delivery({ id, route: null });
const assigned = (id = 'b') => delivery({ id, status: 'ASSIGNED', route: null });

describe('itinéraires de la carte d’ensemble (lus sur GET /orders/:id)', () => {
  it('demande l’itinéraire des livraisons en route seulement, une fois par étape', () => {
    const list = [picked('a'), assigned('b'), delivery({ id: 'c', status: 'SEARCHING_DRIVER', driver: null, route: null })];
    expect(routesToFetch(list, new Map(), T)).toEqual(['a', 'b']);
    const cache = new Map<string, CachedRoute>([
      ['a', { status: 'PICKED_UP', route: route(), fetchedAt: T - 5_000 }],
      ['b', { status: 'ASSIGNED', route: route({ target: 'PICKUP' }), fetchedAt: T - 5_000 }],
    ]);
    expect(routesToFetch(list, cache, T)).toEqual([]);
    // Nouvelle étape (colis récupéré) : l'itinéraire vers le retrait ne vaut plus.
    expect(routesToFetch([picked('b')], cache, T)).toEqual(['b']);
    // La liste porte déjà un tracé valable (future API) : rien à demander.
    expect(routesToFetch([delivery({ id: 'z' })], new Map(), T)).toEqual([]);
  });

  it('rafraîchi après ROUTE_REFRESH_MS ; sans tracé ou après un échec, nouvel essai après ROUTE_RETRY_MS', () => {
    const ok = new Map<string, CachedRoute>([['a', { status: 'PICKED_UP', route: route(), fetchedAt: T }]]);
    expect(routesToFetch([picked()], ok, T + ROUTE_REFRESH_MS - 1)).toEqual([]);
    expect(routesToFetch([picked()], ok, T + ROUTE_REFRESH_MS)).toEqual(['a']);
    const none = new Map<string, CachedRoute>([['a', { status: 'PICKED_UP', route: null, fetchedAt: T }]]);
    expect(routesToFetch([picked()], none, T + ROUTE_RETRY_MS - 1)).toEqual([]);
    expect(routesToFetch([picked()], none, T + ROUTE_RETRY_MS)).toEqual(['a']);
    const failed = new Map<string, CachedRoute>([['a', { status: 'PICKED_UP', route: route(), fetchedAt: T, failed: true }]]);
    expect(routesToFetch([picked()], failed, T + ROUTE_RETRY_MS)).toEqual(['a']);
  });

  it(`au plus ${ROUTE_MAX_PARALLEL} appels à la fois, jamais deux fois le même`, () => {
    const list = ['a', 'b', 'c', 'd', 'e'].map((id) => picked(id));
    expect(routesToFetch(list, new Map(), T)).toEqual(['a', 'b', 'c']);
    expect(routesToFetch(list, new Map(), T, new Set(['a', 'b']))).toEqual(['c']);
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
