import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import DriverReadyScreen from '../app/driver/ready';
import { useReadyScreenGate } from '../hooks/useReadyScreen';
import { markReadyScreenShown, readyScreenShownThisSession, resetReadyScreenSession, shouldShowReadyScreen } from '../lib/readyScreen';
import { webStorageBackend } from '../lib/secureStorage';
import { driverReadyKey, loadDriverReadyDismissed, saveDriverReadyDismissed } from '../lib/storage';
import { driverProfile } from './fixtures';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('expo-router', () => ({
  // Lu à l'appel (la fabrique du mock s'exécute avant l'initialisation de mockRouter).
  get router() {
    return mockRouter;
  },
}));

/** Stockage simulé (mémoire), partagé par lib/storage via keyValueStore(). */
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

const mockDriver = {
  profile: driverProfile({ trackingConsentAt: null, isOnline: false }) as ReturnType<typeof driverProfile> | null | undefined,
  togglingOnline: false,
  availabilityError: null as string | null,
  setOnline: jest.fn(async (_online: boolean): Promise<string | null> => null),
};
jest.mock('../state/driver', () => ({ useDriver: () => mockDriver }));

describe('règle de l’écran « Vous êtes prêt ! »', () => {
  it('dossier validé, jamais passé en ligne (aucun consentement), pas écarté', () => {
    const fresh = driverProfile({ status: 'APPROVED', trackingConsentAt: null });
    expect(shouldShowReadyScreen(fresh, false)).toBe(true);
    expect(shouldShowReadyScreen(fresh, true)).toBe(false);
    expect(shouldShowReadyScreen(driverProfile({ status: 'APPROVED' }), false)).toBe(false); // consentement déjà donné
    for (const status of ['PENDING', 'REJECTED', 'SUSPENDED'] as const) {
      expect(shouldShowReadyScreen(driverProfile({ status, trackingConsentAt: null }), false)).toBe(false);
    }
    expect(shouldShowReadyScreen(null, false)).toBe(false);
    expect(shouldShowReadyScreen(undefined, false)).toBe(false);
  });

  it('« Plus tard » mémorisé par livreur (clé acceptée par expo-secure-store)', async () => {
    const store = webStorageBackend(null);
    expect(driverReadyKey('d-1')).toBe('yaar.driverReady.d-1');
    expect(driverReadyKey('a b/c')).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(await loadDriverReadyDismissed('d-1', store)).toBe(false);
    await saveDriverReadyDismissed('d-1', store);
    expect(await loadDriverReadyDismissed('d-1', store)).toBe(true);
    expect(await loadDriverReadyDismissed('d-2', store)).toBe(false);
  });

  it('stockage illisible : l’écran peut s’afficher (aucune erreur)', async () => {
    const broken = {
      getItem: async () => {
        throw new Error('KO');
      },
      setItem: async () => {
        throw new Error('KO');
      },
      deleteItem: async () => undefined,
    };
    expect(await loadDriverReadyDismissed('d-1', broken)).toBe(false);
    await expect(saveDriverReadyDismissed('d-1', broken)).resolves.toBeUndefined();
  });
});

describe('écran « Vous êtes prêt ! »', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.clear();
    mockDriver.profile = driverProfile({ userId: 'd-karim', trackingConsentAt: null, isOnline: false });
    mockDriver.availabilityError = null;
    mockDriver.togglingOnline = false;
    mockDriver.setOnline.mockResolvedValue(null);
  });

  it('texte, illustration et deux choix', async () => {
    const r = await render(<DriverReadyScreen />);
    expect(r.getByText('Vous êtes prêt !')).toBeTruthy();
    expect(r.getByText('Votre dossier est validé. Passez en ligne pour recevoir vos premières courses.')).toBeTruthy();
    expect(r.getByTestId('ready-go-online')).toBeTruthy();
    expect(r.getByTestId('ready-later')).toBeTruthy();
  });

  it('« Passer en ligne » passe par le consentement (setOnline), sans quitter l’écran tant qu’il n’est pas donné', async () => {
    const r = await render(<DriverReadyScreen />);
    await act(async () => fireEvent.press(r.getByTestId('ready-go-online')));
    expect(mockDriver.setOnline).toHaveBeenCalledWith(true);
    expect(mockRouter.back).not.toHaveBeenCalled();
    // Consentement accepté : retour à l'accueil.
    mockDriver.profile = driverProfile({ userId: 'd-karim', isOnline: false });
    await r.rerender(<DriverReadyScreen />);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('erreur de passage en ligne (localisation refusée) : affichée', async () => {
    mockDriver.setOnline.mockResolvedValue('Autorisez la localisation pour passer en ligne.');
    const r = await render(<DriverReadyScreen />);
    await act(async () => fireEvent.press(r.getByTestId('ready-go-online')));
    expect(r.getByText('Autorisez la localisation pour passer en ligne.')).toBeTruthy();
  });

  it('« Plus tard » : écarté pour ce livreur, retour à l’accueil', async () => {
    const r = await render(<DriverReadyScreen />);
    await act(async () => fireEvent.press(r.getByTestId('ready-later')));
    expect(mockStore.has(driverReadyKey('d-karim'))).toBe(true);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockDriver.setOnline).not.toHaveBeenCalled();
  });

  it('ouvert sans historique (lien direct) : remplace par l’accueil', async () => {
    mockRouter.canGoBack.mockReturnValueOnce(false);
    const r = await render(<DriverReadyScreen />);
    await act(async () => fireEvent.press(r.getByTestId('ready-later')));
    expect(mockRouter.replace).toHaveBeenCalledWith('/driver');
  });
});

function Gate({ active }: { active: boolean }) {
  useReadyScreenGate(mockDriver.profile, active);
  return <Text>accueil</Text>;
}

describe('ouverture depuis l’accueil (une fois)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.clear();
    resetReadyScreenSession();
    mockDriver.profile = driverProfile({ userId: 'd-karim', trackingConsentAt: null, isOnline: false });
  });

  it('ouvre /driver/ready une seule fois par session', async () => {
    const r = await render(<Gate active />);
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/driver/ready'));
    expect(readyScreenShownThisSession('d-karim')).toBe(true);
    await r.rerender(<Gate active={false} />);
    await r.rerender(<Gate active />);
    await act(async () => undefined);
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });

  it('écarté sur cet appareil, ou consentement déjà donné : jamais', async () => {
    mockStore.set(driverReadyKey('d-karim'), '2026-11-09');
    await render(<Gate active />);
    await act(async () => undefined);
    expect(mockRouter.push).not.toHaveBeenCalled();

    mockStore.clear();
    mockDriver.profile = driverProfile({ userId: 'd-karim' });
    await render(<Gate active />);
    await act(async () => undefined);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('accueil masqué (autre écran par-dessus) : attend son retour', async () => {
    const r = await render(<Gate active={false} />);
    await act(async () => undefined);
    expect(mockRouter.push).not.toHaveBeenCalled();
    await r.rerender(<Gate active />);
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledTimes(1));
  });

  it('déjà montré pendant la session : pas une seconde fois', async () => {
    markReadyScreenShown('d-karim');
    await render(<Gate active />);
    await act(async () => undefined);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});
