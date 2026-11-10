import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import DriverProfile from '../app/driver/(tabs)/profile';
import { TrackingConsentModal } from '../components/TrackingConsentModal';
import { hasTrackingConsent, trackingConsentStatus } from '../lib/consent';
import { driverProfile, order } from './fixtures';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
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
    signOut: jest.fn(),
  }),
}));

const mockDriver = {
  profile: driverProfile(),
  currentOrder: null as ReturnType<typeof order> | null,
  setOnline: jest.fn(async (): Promise<string | null> => null),
  consentPromptOpen: true,
  consentBusy: false,
  openConsentPrompt: jest.fn(),
  dismissConsentPrompt: jest.fn(),
  acceptTrackingConsent: jest.fn(async (): Promise<string | null> => null),
  withdrawTrackingConsent: jest.fn(async (): Promise<string | null> => null),
};
jest.mock('../state/driver', () => ({ useDriver: () => mockDriver }));

describe('lib/consent', () => {
  it('détecte le consentement et formate son état', () => {
    expect(hasTrackingConsent(driverProfile())).toBe(true);
    expect(hasTrackingConsent(driverProfile({ trackingConsentAt: null }))).toBe(false);
    expect(hasTrackingConsent(null)).toBe(false);
    expect(trackingConsentStatus(driverProfile())).toBe('Accepté le 01/11/2026 08:05');
    expect(trackingConsentStatus(driverProfile({ trackingConsentAt: null }))).toBe('Non accepté');
  });
});

describe('TrackingConsentModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDriver.consentPromptOpen = true;
    mockDriver.acceptTrackingConsent.mockResolvedValue(null);
  });

  it('explique la collecte, le partage, la durée et le retrait', async () => {
    const r = await render(<TrackingConsentModal />);
    expect(r.getByText(/uniquement lorsque vous êtes « En ligne » ou pendant une course/)).toBeTruthy();
    expect(r.getByText(/avec le client uniquement pendant sa livraison, et avec les contrôleurs Yaar/)).toBeTruthy();
    expect(r.getByText(/conservées 12 mois/)).toBeTruthy();
    expect(r.getByText(/retirer votre consentement à tout moment/)).toBeTruthy();
  });

  it('accepter appelle acceptTrackingConsent ; une erreur est affichée', async () => {
    mockDriver.acceptTrackingConsent.mockResolvedValue('Connexion impossible.');
    const r = await render(<TrackingConsentModal />);
    await act(async () => fireEvent.press(r.getByTestId('accept-tracking-consent')));
    expect(mockDriver.acceptTrackingConsent).toHaveBeenCalled();
    await waitFor(() => expect(r.getByText('Connexion impossible.')).toBeTruthy());
  });

  it('« Pas maintenant » ferme sans consentir', async () => {
    const r = await render(<TrackingConsentModal />);
    await act(async () => fireEvent.press(r.getByTestId('decline-tracking-consent')));
    expect(mockDriver.dismissConsentPrompt).toHaveBeenCalled();
    expect(mockDriver.acceptTrackingConsent).not.toHaveBeenCalled();
  });

  it('fermée : rien n’est affiché', async () => {
    mockDriver.consentPromptOpen = false;
    const r = await render(<TrackingConsentModal />);
    expect(r.queryByTestId('tracking-consent')).toBeNull();
  });
});

describe('Profil livreur : suivi GPS', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDriver.profile = driverProfile({ isOnline: true });
    mockDriver.currentOrder = null;
  });
  afterEach(() => jest.restoreAllMocks());

  it('retirer le consentement après confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const r = await render(<DriverProfile />);
    expect(r.getByText('Accepté le 01/11/2026 08:05')).toBeTruthy();
    await act(async () => fireEvent.press(r.getByTestId('withdraw-consent')));
    expect(alert.mock.calls[0]?.[0]).toBe('Retirer votre consentement\u202f?');
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    await act(async () => buttons.find((b) => b.style === 'destructive')?.onPress?.());
    expect(mockDriver.withdrawTrackingConsent).toHaveBeenCalled();
    await waitFor(() => expect(r.getByText('Consentement retiré : vous êtes hors ligne.')).toBeTruthy());
  });

  it('sans consentement : bouton pour lire et accepter (sans passer en ligne)', async () => {
    mockDriver.profile = driverProfile({ trackingConsentAt: null });
    const r = await render(<DriverProfile />);
    expect(r.getByText('Non accepté')).toBeTruthy();
    await act(async () => fireEvent.press(r.getByTestId('open-consent')));
    expect(mockDriver.openConsentPrompt).toHaveBeenCalledWith(false);
  });
});
