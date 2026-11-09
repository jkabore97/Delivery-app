import { act, renderHook } from '@testing-library/react-native';
import type { OrderDto } from '@yaar/shared';
import { useLiveRoutes } from './useLiveRoutes';
import { ROUTE_RETRY_MS, ROUTE_SAFETY_REFRESH_MS } from '../lib/liveRoutes';
import { delivery, route } from '../__tests__/fixtures';

const T = Date.parse('2026-11-08T14:20:00.000Z');
const C1 = '2026-11-08T14:00:00.000Z';
const C2 = '2026-11-08T14:12:00.000Z';
const C3 = '2026-11-08T14:15:30.000Z';
const TO_PICKUP = route({ target: 'PICKUP', points: [[12.3627, -1.521], [12.3686, -1.5275]], computedAt: C1 });
const TO_DROPOFF = route({ computedAt: C2 });

/** Élément de liste (GET /business/deliveries) : jamais de tracé, mais sa date de calcul. */
const listed = (status: 'ASSIGNED' | 'PICKED_UP', routeComputedAt: string | null) =>
  delivery({ id: 'b', status, route: null, routeComputedAt });
/** Même élément, livreur parti sur un autre chemin (à plus d'un kilomètre du tracé). */
const detoured = (routeComputedAt: string) =>
  delivery({
    id: 'b',
    route: null,
    routeComputedAt,
    driver: { ...delivery().driver!, lastLocation: { lat: 12.356, lng: -1.53, at: '2026-11-08T14:19:50.000Z', heading: 270 } },
  });
/** Détail (GET /orders/:id) : le tracé de l'étape. */
const detail = (status: 'ASSIGNED' | 'PICKED_UP', r = status === 'ASSIGNED' ? TO_PICKUP : TO_DROPOFF) =>
  delivery({ id: 'b', status, route: r, routeComputedAt: r.computedAt });

type Props = { orders: OrderDto[] | null; enabled: boolean };

/** Appels GET /orders/:id en attente, résolus à la main. */
function fakeApi() {
  const calls: { id: string; resolve: (o: OrderDto) => void; reject: (e: Error) => void }[] = [];
  const fetchOrder = jest.fn(
    (id: string) =>
      new Promise<OrderDto>((resolve, reject) => {
        calls.push({ id, resolve, reject });
      }),
  );
  return { fetchOrder, calls };
}

describe('useLiveRoutes (carte d’ensemble de l’entreprise)', () => {
  let t = T;
  const clock = jest.fn(() => t);
  beforeEach(() => {
    t = T;
    clock.mockClear();
  });

  async function mount(api: ReturnType<typeof fakeApi>, initialProps: Props) {
    return renderHook((p: Props) => useLiveRoutes(p.orders, api.fetchOrder, p.enabled, clock), { initialProps });
  }

  it('relu au changement d’étape et au nouvel itinéraire seulement ; liste relue toutes les 10 s sans appel de plus', async () => {
    const api = fakeApi();
    const h = await mount(api, { orders: [listed('ASSIGNED', C1)], enabled: true });
    expect(api.fetchOrder).toHaveBeenCalledTimes(1);
    await act(async () => api.calls[0]!.resolve(detail('ASSIGNED')));
    expect(h.result.current?.[0]?.route?.target).toBe('PICKUP');

    // Rafraîchissement de la liste toutes les 10 s pendant 4 min (même date de calcul) : aucun appel.
    for (let i = 1; i <= 24; i++) {
      t = T + i * 10_000;
      await h.rerender({ orders: [listed('ASSIGNED', C1)], enabled: true });
    }
    expect(api.fetchOrder).toHaveBeenCalledTimes(1);
    expect(h.result.current?.[0]?.route?.target).toBe('PICKUP');

    // Colis récupéré : l'itinéraire vers le retrait ne vaut plus (ligne droite en attendant), le nouveau est lu.
    t += 10_000;
    await h.rerender({ orders: [listed('PICKED_UP', C2)], enabled: true });
    expect(api.fetchOrder).toHaveBeenCalledTimes(2);
    expect(h.result.current?.[0]?.route).toBeNull();
    await act(async () => api.calls[1]!.resolve(detail('PICKED_UP')));
    expect(h.result.current?.[0]?.route?.target).toBe('DROPOFF');

    // Recalcul périodique de l'API (3 min) alors que le livreur suit le tracé : même chemin, aucun appel.
    t += 10_000;
    await h.rerender({ orders: [listed('PICKED_UP', C3)], enabled: true });
    expect(api.fetchOrder).toHaveBeenCalledTimes(2);
    // Le livreur prend un autre chemin, l'API recalcule : relu à la liste suivante (10 s).
    t += 10_000;
    const C4 = '2026-11-08T14:21:40.000Z';
    await h.rerender({ orders: [detoured(C4)], enabled: true });
    expect(api.fetchOrder).toHaveBeenCalledTimes(3);
    await act(async () => api.calls[2]!.resolve(delivery({ id: 'b', route: route({ computedAt: C4 }), routeComputedAt: C4 })));
    expect(h.result.current?.[0]?.route?.computedAt).toBe(C4);
  });

  it('rafraîchissement de sécurité toutes les 5 min ; nouvel essai 15 s après un échec, tracé déjà reçu conservé', async () => {
    const api = fakeApi();
    const h = await mount(api, { orders: [listed('PICKED_UP', C2)], enabled: true });
    await act(async () => api.calls[0]!.resolve(detail('PICKED_UP')));
    t = T + ROUTE_SAFETY_REFRESH_MS - 1;
    await h.rerender({ orders: [listed('PICKED_UP', C2)], enabled: true });
    expect(api.fetchOrder).toHaveBeenCalledTimes(1);
    t = T + ROUTE_SAFETY_REFRESH_MS;
    await h.rerender({ orders: [listed('PICKED_UP', C2)], enabled: true });
    expect(api.fetchOrder).toHaveBeenCalledTimes(2);
    await act(async () => api.calls[1]!.reject(new Error('réseau')));
    expect(h.result.current?.[0]?.route?.target).toBe('DROPOFF');
    // Échec : pas d'appel à chaque liste, nouvel essai après 15 s.
    t += ROUTE_RETRY_MS - 1;
    await h.rerender({ orders: [listed('PICKED_UP', C2)], enabled: true });
    expect(api.fetchOrder).toHaveBeenCalledTimes(2);
    t += 1;
    await h.rerender({ orders: [listed('PICKED_UP', C2)], enabled: true });
    expect(api.fetchOrder).toHaveBeenCalledTimes(3);
  });

  it('pas encore d’itinéraire côté API (routeComputedAt null) : aucun appel, lu dès que la liste l’annonce', async () => {
    const api = fakeApi();
    const h = await mount(api, { orders: [listed('ASSIGNED', null)], enabled: true });
    for (let i = 1; i <= 6; i++) {
      t = T + i * 10_000;
      await h.rerender({ orders: [listed('ASSIGNED', null)], enabled: true });
    }
    expect(api.fetchOrder).not.toHaveBeenCalled();
    await h.rerender({ orders: [listed('ASSIGNED', C1)], enabled: true });
    expect(api.fetchOrder).toHaveBeenCalledTimes(1);
  });

  it('écran masqué (enabled = false) : aucun appel ; repris au retour au premier plan', async () => {
    const api = fakeApi();
    const h = await mount(api, { orders: [listed('PICKED_UP', C2)], enabled: false });
    t += 10_000;
    await h.rerender({ orders: [listed('PICKED_UP', C2)], enabled: false });
    expect(api.fetchOrder).not.toHaveBeenCalled();
    expect(h.result.current?.[0]?.route).toBeNull();
    await h.rerender({ orders: [listed('PICKED_UP', C2)], enabled: true });
    expect(api.fetchOrder).toHaveBeenCalledTimes(1);
  });

  it('démonté pendant un appel : la réponse (ou l’échec) est ignorée, aucun état mis à jour', async () => {
    const api = fakeApi();
    const h = await mount(api, { orders: [listed('PICKED_UP', C2), delivery({ id: 'c', route: null, routeComputedAt: C2 })], enabled: true });
    expect(api.fetchOrder).toHaveBeenCalledTimes(2);
    const before = clock.mock.calls.length;
    await h.unmount();
    // Le traitement de la réponse lit l'horloge avant toute mise à jour : il s'arrête avant.
    await act(async () => {
      api.calls[0]!.resolve(detail('PICKED_UP'));
      api.calls[1]!.reject(new Error('réseau'));
    });
    expect(clock.mock.calls.length).toBe(before);
  });
});
