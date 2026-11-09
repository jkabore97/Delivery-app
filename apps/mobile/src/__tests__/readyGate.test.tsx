import { act, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useReadyScreenGate } from '../hooks/useReadyScreen';
import { resetReadyScreenSession } from '../lib/readyScreen';
import { driverReadyKey } from '../lib/storage';
import { DriverProvider, useDriver } from '../state/driver';
import { driverProfile } from './fixtures';

/**
 * « Vous êtes prêt ! » avec le vrai DriverProvider : un livreur déjà passé en ligne (consentement vu sur l'appareil)
 * qui retire son consentement depuis son profil ne revoit pas l'écran de bienvenue en revenant à l'accueil.
 */

const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
}));
jest.mock('expo-location', () => ({
  Accuracy: { High: 4, Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 12.37, longitude: -1.52 } })),
  watchPositionAsync: jest.fn(async () => ({ remove: jest.fn() })),
}));
jest.mock('../state/socket', () => ({
  useSocketEvent: () => undefined,
  usePolling: () => undefined,
  useRealtimeMode: () => 'socket',
}));

const mockApi = {
  driverProfile: jest.fn(),
  currentOrder: jest.fn(async () => ({ order: null })),
  driverOffers: jest.fn(async () => []),
  setAvailability: jest.fn(),
  giveTrackingConsent: jest.fn(),
  withdrawTrackingConsent: jest.fn(),
  sendLocation: jest.fn(async () => undefined),
};
jest.mock('../state/auth', () => ({ useApi: () => mockApi }));

/** Stockage de l'appareil simulé (mémoire), lu et écrit par lib/storage via keyValueStore(). */
const mockStore = new Map<string, string>();
jest.mock('../lib/secureStorage', () => {
  const actual = jest.requireActual<typeof import('../lib/secureStorage')>('../lib/secureStorage');
  return {
    ...actual,
    keyValueStore: () => ({
      getItem: async (k: string) => mockStore.get(k) ?? null,
      setItem: async (k: string, v: string) => void mockStore.set(k, v),
      deleteItem: async (k: string) => void mockStore.delete(k),
    }),
  };
});

let ctx: ReturnType<typeof useDriver> | null = null;
/** Accueil du livreur réduit à la porte de l'écran « Vous êtes prêt ! ». */
function Home() {
  ctx = useDriver();
  useReadyScreenGate(ctx.profile, true);
  return <Text>accueil</Text>;
}

async function mountHome() {
  const r = await render(
    <DriverProvider>
      <Home />
    </DriverProvider>,
  );
  await waitFor(() => expect(ctx?.profile).toBeTruthy());
  return r;
}

/** Laisse les lectures du stockage (asynchrones) se terminer. */
async function settle() {
  for (let i = 0; i < 5; i++) await act(async () => undefined);
}

const withConsent = (userId: string) => driverProfile({ userId, trackingConsentAt: '2026-11-08T19:30:00.000Z', isOnline: false });
const withoutConsent = (userId: string) => driverProfile({ userId, trackingConsentAt: null, isOnline: false });

describe('« Vous êtes prêt ! » après un retrait du consentement', () => {
  beforeEach(() => {
    ctx = null;
    jest.clearAllMocks();
    mockStore.clear();
    resetReadyScreenSession();
  });

  it('livreur expérimenté : consentement → retrait (profil) → accueil, l’écran ne s’ouvre pas', async () => {
    mockApi.driverProfile.mockResolvedValue(withConsent('d-karim'));
    mockApi.withdrawTrackingConsent.mockResolvedValue(withoutConsent('d-karim'));
    await mountHome();
    // Profil avec consentement vu sur l'appareil : mémorisé pour ce livreur.
    await waitFor(() => expect(mockStore.has(driverReadyKey('d-karim'))).toBe(true));
    let err: string | null = 'x';
    await act(async () => {
      err = (await ctx?.withdrawTrackingConsent()) ?? null;
    });
    expect(err).toBeNull();
    expect(ctx?.profile?.trackingConsentAt).toBeNull();
    await settle();
    expect(mockRouter.push).not.toHaveBeenCalledWith('/driver/ready');
  });

  it('même après un redémarrage de l’application (profil déjà sans consentement au lancement)', async () => {
    mockStore.set(driverReadyKey('d-karim'), '2026-11-08T19:30:00.000Z'); // consentement vu lors d'une session précédente
    mockApi.driverProfile.mockResolvedValue(withoutConsent('d-karim'));
    await mountHome();
    await settle();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('nouveau livreur : l’écran s’ouvre ; consentement donné puis retiré, il ne revient plus (même session suivante)', async () => {
    mockApi.driverProfile.mockResolvedValue(withoutConsent('d-new'));
    mockApi.giveTrackingConsent.mockResolvedValue(withConsent('d-new'));
    mockApi.withdrawTrackingConsent.mockResolvedValue(withoutConsent('d-new'));
    const r = await mountHome();
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/driver/ready'));
    expect(mockRouter.push).toHaveBeenCalledTimes(1);

    await act(async () => {
      await ctx?.acceptTrackingConsent();
    });
    await waitFor(() => expect(mockStore.has(driverReadyKey('d-new'))).toBe(true));
    await r.unmount();

    // Nouvelle session (écran déjà montré oublié) : retrait du consentement puis retour à l'accueil.
    resetReadyScreenSession();
    mockRouter.push.mockClear();
    mockApi.driverProfile.mockResolvedValue(withConsent('d-new'));
    await mountHome();
    await act(async () => {
      await ctx?.withdrawTrackingConsent();
    });
    await settle();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});
