import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { ApiError } from '../lib/api';
import { useDriverLocationTracking, type DriverTrackingOptions } from './useDriverLocationTracking';

jest.mock('expo-location', () => ({
  Accuracy: { High: 4, Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));

const mocked = Location as jest.Mocked<typeof Location>;
type Callback = (loc: Location.LocationObject) => void;

function fix(lat: number, lng: number): Location.LocationObject {
  return {
    coords: { latitude: lat, longitude: lng, altitude: null, accuracy: 10, altitudeAccuracy: null, heading: 90, speed: 5 },
    timestamp: 0,
  };
}

describe('useDriverLocationTracking', () => {
  let callback: Callback | null;
  let remove: jest.Mock;
  let now: number;

  beforeEach(() => {
    callback = null;
    remove = jest.fn();
    now = 1_000_000;
    mocked.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true } as Location.LocationPermissionResponse);
    mocked.watchPositionAsync.mockImplementation(async (_opts, cb) => {
      callback = cb as Callback;
      return { remove } as Location.LocationSubscription;
    });
  });
  afterEach(() => jest.clearAllMocks());

  const render = async (initial: Partial<DriverTrackingOptions>) => {
    const send = jest.fn(async () => undefined);
    const props: DriverTrackingOptions = { online: false, onDelivery: false, send, clock: () => now, ...initial };
    const hook = await renderHook((p: DriverTrackingOptions) => useDriverLocationTracking(p), { initialProps: props });
    return { send, props, ...hook };
  };

  it('hors ligne : aucune permission demandée, aucun suivi', async () => {
    const { result, send } = await render({ online: false });
    expect(mocked.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(mocked.watchPositionAsync).not.toHaveBeenCalled();
    expect(result.current.active).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('en ligne : suit la position et envoie selon la cadence', async () => {
    const { result, send } = await render({ online: true, onDelivery: true });
    await waitFor(() => expect(callback).not.toBeNull());
    await act(async () => callback!(fix(12.36, -1.52)));
    expect(result.current.active).toBe(true);
    expect(result.current.position).toMatchObject({ lat: 12.36, lng: -1.52 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ lat: 12.36, lng: -1.52, accuracy: 10, heading: 90, speed: 5 });

    now += 3_000; // trop tôt
    await act(async () => callback!(fix(12.361, -1.52)));
    expect(send).toHaveBeenCalledTimes(1);

    now += 6_000; // > 8 s en course
    await act(async () => callback!(fix(12.362, -1.52)));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('passage hors ligne : le watcher est arrêté', async () => {
    const r = await render({ online: true });
    await waitFor(() => expect(callback).not.toBeNull());
    await r.rerender({ ...r.props, online: false });
    expect(remove).toHaveBeenCalled();
    expect(r.result.current.active).toBe(false);
    expect(r.result.current.position).toBeNull();
  });

  it('permission refusée : pas de suivi et notification', async () => {
    mocked.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false } as Location.LocationPermissionResponse);
    const onStopped = jest.fn();
    const { result } = await render({ online: true, onStopped });
    await waitFor(() => expect(onStopped).toHaveBeenCalledWith('permission'));
    expect(mocked.watchPositionAsync).not.toHaveBeenCalled();
    expect(result.current.active).toBe(false);
    expect(result.current.error).toMatch(/localisation/i);
  });

  it('refus DRIVER_OFFLINE de l’API : arrêt du suivi', async () => {
    const onStopped = jest.fn();
    const send = jest.fn(async () => {
      throw new ApiError(403, 'DRIVER_OFFLINE', 'Hors ligne');
    });
    const { result } = await render({
      online: true,
      send,
      onStopped,
      isOfflineError: (e) => e instanceof ApiError && e.code === 'DRIVER_OFFLINE',
    });
    await waitFor(() => expect(callback).not.toBeNull());
    await act(async () => callback!(fix(12.36, -1.52)));
    await waitFor(() => expect(onStopped).toHaveBeenCalledWith('rejected'));
    expect(remove).toHaveBeenCalled();
    expect(result.current.active).toBe(false);
  });

  it('application en arrière-plan : suivi signalé en pause, envoi immédiat au retour', async () => {
    let appListener: ((s: AppStateStatus) => void) | null = null;
    const original = AppState.addEventListener;
    AppState.addEventListener = ((_type: string, l: (s: AppStateStatus) => void) => {
      appListener = l as (s: AppStateStatus) => void;
      return { remove: jest.fn() };
    }) as unknown as typeof AppState.addEventListener;
    const { result, send } = await render({ online: true, onDelivery: true });
    await waitFor(() => expect(callback).not.toBeNull());
    await act(async () => callback!(fix(12.36, -1.52)));
    expect(send).toHaveBeenCalledTimes(1);

    await act(async () => appListener?.('background'));
    expect(result.current.paused).toBe(true);
    expect(result.current.active).toBe(false);
    // Onglet masqué (web) : le navigateur peut encore fournir des positions, aucune n'est envoyée.
    now += 60_000;
    await act(async () => callback!(fix(12.365, -1.52)));
    expect(send).toHaveBeenCalledTimes(1);

    await act(async () => appListener?.('active'));
    expect(result.current.paused).toBe(false);
    now += 1_000; // bien avant la cadence normale, mais retour au premier plan : envoi forcé
    await act(async () => callback!(fix(12.37, -1.52)));
    expect(send).toHaveBeenCalledTimes(2);
    AppState.addEventListener = original;
  });

  it('hors ligne : jamais en pause', async () => {
    const { result } = await render({ online: false });
    expect(result.current.paused).toBe(false);
  });
});
