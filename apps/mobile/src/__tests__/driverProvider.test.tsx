import { act, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import * as Location from 'expo-location';
import type { ServerToClientEvents } from '@yaar/shared';
import { DriverProvider, useDriver } from '../state/driver';
import { driverProfile, offer, order } from './fixtures';

jest.mock('expo-location', () => ({
  Accuracy: { High: 4, Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 12.37, longitude: -1.52 } })),
  watchPositionAsync: jest.fn(async () => ({ remove: jest.fn() })),
}));

type Handlers = { [E in keyof ServerToClientEvents]?: ServerToClientEvents[E] };
const mockHandlers: Handlers = {};
jest.mock('../state/socket', () => ({
  useSocketEvent: (event: keyof ServerToClientEvents, handler: never) => {
    (mockHandlers as Record<string, unknown>)[event] = handler;
  },
}));

const mockApi = {
  driverProfile: jest.fn(),
  currentOrder: jest.fn(),
  driverOffers: jest.fn(),
  setAvailability: jest.fn(),
  sendLocation: jest.fn(async () => undefined),
};
jest.mock('../state/auth', () => ({ useApi: () => mockApi }));

let ctx: ReturnType<typeof useDriver> | null = null;
function Probe() {
  ctx = useDriver();
  return <Text>{ctx.orderNotice ?? ''}</Text>;
}

async function mount() {
  const r = await render(
    <DriverProvider>
      <Probe />
    </DriverProvider>,
  );
  await waitFor(() => expect(ctx?.profile).toBeTruthy());
  return r;
}

describe('DriverProvider', () => {
  beforeEach(() => {
    ctx = null;
    for (const k of Object.keys(mockHandlers)) delete (mockHandlers as Record<string, unknown>)[k];
    jest.clearAllMocks();
    mockApi.driverProfile.mockResolvedValue(driverProfile({ isOnline: false }));
    mockApi.currentOrder.mockResolvedValue({ order: null });
    mockApi.driverOffers.mockResolvedValue([]);
  });

  it('hors ligne : aucun suivi GPS, aucune position envoyée', async () => {
    await mount();
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();
    expect(mockApi.sendLocation).not.toHaveBeenCalled();
    expect(ctx?.gpsActive).toBe(false);
  });

  it('offer.new ajoute une offre, offer.closed la retire', async () => {
    await mount();
    await act(async () => mockHandlers['offer.new']?.(offer({ id: 'o1' })));
    await act(async () => mockHandlers['offer.new']?.(offer({ id: 'o2' })));
    expect(ctx?.offers.map((o) => o.id)).toEqual(['o2', 'o1']);
    await act(async () => mockHandlers['offer.closed']?.({ offerId: 'o2', orderId: 'order-1', status: 'EXPIRED' }));
    expect(ctx?.offers.map((o) => o.id)).toEqual(['o1']);
  });

  it('passer hors ligne vide les offres', async () => {
    mockApi.driverProfile.mockResolvedValue(driverProfile({ isOnline: true }));
    mockApi.driverOffers.mockResolvedValue([offer()]);
    await mount();
    await waitFor(() => expect(ctx?.offers).toHaveLength(1));
    mockApi.setAvailability.mockResolvedValue(driverProfile({ isOnline: false }));
    let err: string | null = 'x';
    await act(async () => {
      err = (await ctx?.setOnline(false)) ?? null;
    });
    expect(err).toBeNull();
    expect(mockApi.setAvailability).toHaveBeenCalledWith({ online: false });
    expect(ctx?.offers).toEqual([]);
    expect(ctx?.profile?.isOnline).toBe(false);
  });

  it('course annulée par Yaar : message au livreur', async () => {
    mockApi.currentOrder.mockResolvedValue({ order: order() });
    const r = await mount();
    await waitFor(() => expect(ctx?.currentOrder?.id).toBe('order-1'));
    mockApi.currentOrder.mockResolvedValue({ order: null });
    await act(async () =>
      mockHandlers['order.updated']?.({
        orderId: 'order-1',
        number: 1048,
        status: 'CANCELLED',
        driverId: null,
        updatedAt: '2026-11-06T10:00:00.000Z',
      }),
    );
    await waitFor(() => expect(ctx?.currentOrder).toBeNull());
    expect(r.getByText(/course #1048 a été annulée par Yaar/)).toBeTruthy();
    await act(async () => ctx?.clearOrderNotice());
    expect(ctx?.orderNotice).toBeNull();
  });

  it('course réaffectée : message au livreur', async () => {
    mockApi.currentOrder.mockResolvedValue({ order: order() });
    await mount();
    await waitFor(() => expect(ctx?.currentOrder?.id).toBe('order-1'));
    mockApi.currentOrder.mockResolvedValue({ order: null });
    await act(async () =>
      mockHandlers['order.updated']?.({
        orderId: 'order-1',
        number: 1048,
        status: 'ASSIGNED',
        driverId: 'other-driver',
        updatedAt: '2026-11-06T10:00:00.000Z',
      }),
    );
    await waitFor(() => expect(ctx?.orderNotice).toMatch(/annulée ou réaffectée/));
  });

  it('livraison confirmée localement : pas de message', async () => {
    mockApi.currentOrder.mockResolvedValue({ order: order() });
    await mount();
    await waitFor(() => expect(ctx?.currentOrder?.id).toBe('order-1'));
    await act(async () => ctx?.setCurrentOrder(null));
    mockApi.currentOrder.mockResolvedValue({ order: null });
    await act(async () => ctx?.refreshCurrentOrder());
    expect(ctx?.orderNotice).toBeNull();
  });
});
