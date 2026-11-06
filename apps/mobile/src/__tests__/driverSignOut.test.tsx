import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import DriverProfile from '../app/driver/(tabs)/profile';
import { driverProfile, order } from './fixtures';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockSignOut = jest.fn(async () => undefined);
jest.mock('../state/auth', () => ({
  useAuth: () => ({
    user: {
      id: 'u-driver',
      phone: '+22670000001',
      name: 'Issa',
      role: 'DRIVER',
      isSuspended: false,
      suspensionReason: null,
      createdAt: '2026-11-01T00:00:00.000Z',
    },
    api: { updateMe: jest.fn() },
    setUser: jest.fn(),
    signOut: mockSignOut,
  }),
}));

const mockDriver = {
  profile: driverProfile({ isOnline: true }),
  currentOrder: null as ReturnType<typeof order> | null,
  setOnline: jest.fn(async (_online: boolean): Promise<string | null> => null),
};
jest.mock('../state/driver', () => ({ useDriver: () => mockDriver }));

/** Appuie sur « Se déconnecter » puis confirme dans l'alerte. */
async function confirmSignOut(r: Awaited<ReturnType<typeof render>>) {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  await act(async () => fireEvent.press(r.getByTestId('signout-button')));
  const buttons = alert.mock.calls[0]?.[2] ?? [];
  alert.mockClear();
  await act(async () => buttons.find((b) => b.style === 'destructive')?.onPress?.());
  return alert;
}

describe('Déconnexion du livreur', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDriver.profile = driverProfile({ isOnline: true });
    mockDriver.currentOrder = null;
    mockDriver.setOnline.mockResolvedValue(null);
  });
  afterEach(() => jest.restoreAllMocks());

  it('en ligne : passe hors ligne avant de se déconnecter', async () => {
    const r = await render(<DriverProfile />);
    await confirmSignOut(r);
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(mockDriver.setOnline).toHaveBeenCalledWith(false);
    const offlineOrder = mockDriver.setOnline.mock.invocationCallOrder[0] ?? 0;
    const signOutOrder = mockSignOut.mock.invocationCallOrder[0] ?? 0;
    expect(offlineOrder).toBeLessThan(signOutOrder);
  });

  it('hors ligne : déconnexion directe', async () => {
    mockDriver.profile = driverProfile({ isOnline: false });
    const r = await render(<DriverProfile />);
    await confirmSignOut(r);
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(mockDriver.setOnline).not.toHaveBeenCalled();
  });

  it('course en cours : déconnexion refusée', async () => {
    mockDriver.currentOrder = order();
    const r = await render(<DriverProfile />);
    const alert = await confirmSignOut(r);
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('Déconnexion impossible', 'Terminez la course en cours avant de vous déconnecter.');
  });

  it('échec du passage hors ligne : reste connecté', async () => {
    mockDriver.setOnline.mockResolvedValue('Réseau indisponible.');
    const r = await render(<DriverProfile />);
    const alert = await confirmSignOut(r);
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('Déconnexion impossible', expect.stringContaining('Réseau indisponible.'));
  });
});
