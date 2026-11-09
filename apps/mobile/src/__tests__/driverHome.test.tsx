import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { DriverProfileDto, OfferDto, OrderDto } from '@yaar/shared';
import DriverHome from '../app/driver/(tabs)/index';
import { delivery, driverProfile, offer } from './fixtures';

const mockRouter = { push: jest.fn(), navigate: jest.fn() };
const mockFocused = { current: true };
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
  Redirect: () => null,
  useFocusEffect: () => undefined,
  useIsFocused: () => mockFocused.current,
}));
jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: false })),
  getCurrentPositionAsync: jest.fn(),
}));
const mockGate = jest.fn();
jest.mock('../hooks/useReadyScreen', () => ({ useReadyScreenGate: (...a: unknown[]) => mockGate(...a) }));

const mockApi = {
  driverEarnings: jest.fn(async () => ({
    today: { deliveries: 6, earnings: 7400, cashCollected: 41000 },
    allTime: { deliveries: 312, earnings: 389000 },
    cashHeld: 18500,
    cashLimit: 50000,
    cashBlocked: false,
    recentLedger: [],
  })),
  sos: jest.fn(),
};
jest.mock('../state/auth', () => ({ useApi: () => mockApi }));

const mockDriver: {
  profile: DriverProfileDto | null | undefined;
  currentOrder: OrderDto | null;
  offers: OfferDto[];
  [k: string]: unknown;
} = {
  profile: driverProfile(),
  profileError: null,
  currentOrder: null,
  offers: [],
  position: null,
  gpsActive: false,
  gpsPaused: false,
  gpsError: null,
  togglingOnline: false,
  availabilityError: null,
  orderNotice: null,
  clearOrderNotice: jest.fn(),
  refreshProfile: jest.fn(async () => undefined),
  setOnline: jest.fn(async (): Promise<string | null> => null),
};
jest.mock('../state/driver', () => ({ useDriver: () => mockDriver }));
jest.mock('../components/map/LiveMap', () => {
  const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { LiveMap: (p: { markers: { kind: string }[] }) => <RNText testID="live-map">{p.markers.map((m) => m.kind).join(',')}</RNText> };
});

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (el: ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{el}</SafeAreaProvider>;

describe('Accueil du livreur', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFocused.current = true;
    Object.assign(mockDriver, {
      profile: driverProfile({ isOnline: false, cashHeld: 18500, cashLimit: 50000 }),
      currentOrder: null,
      offers: [],
      position: null,
      gpsActive: false,
      gpsPaused: false,
      gpsError: null,
      availabilityError: null,
      orderNotice: null,
    });
  });

  it('hors ligne : indicateur « position non suivie », grand bouton « Passer en ligne »', async () => {
    const r = await render(wrap(<DriverHome />));
    expect(r.getByTestId('online-status')).toHaveTextContent('Hors ligne : position non suivie');
    expect(r.getByText('Vous êtes hors ligne')).toBeTruthy();
    expect(r.getByTestId('online-switch')).toHaveTextContent('Passer en ligne');
    await act(async () => fireEvent.press(r.getByTestId('online-switch')));
    expect(mockDriver.setOnline).toHaveBeenCalledWith(true);
    expect(mockGate).toHaveBeenCalledWith(mockDriver.profile, true);
  });

  it('jamais passé en ligne : rappel du consentement au suivi GPS', async () => {
    mockDriver.profile = driverProfile({ isOnline: false, trackingConsentAt: null });
    const r = await render(wrap(<DriverHome />));
    expect(r.getByText(/Yaar vous demandera d’accepter le suivi de votre position/)).toBeTruthy();
  });

  it('en ligne sans course : « En attente de courses… », gains du jour, espèces / plafond, « Passer hors ligne »', async () => {
    mockDriver.profile = driverProfile({ isOnline: true, cashHeld: 18500, cashLimit: 50000 });
    mockDriver.gpsActive = true;
    mockDriver.position = { lat: 12.37, lng: -1.52, at: 0, heading: null };
    const r = await render(wrap(<DriverHome />));
    expect(r.getByTestId('online-status')).toHaveTextContent('En ligne : suivi GPS actif');
    expect(r.getByText('En attente de courses…')).toBeTruthy();
    await waitFor(() => expect(r.getByTestId('today-earnings')).toHaveTextContent('7 400 FCFA'));
    expect(r.getByText('6 courses')).toBeTruthy();
    expect(r.getByTestId('cash-held')).toHaveTextContent(/18 500 FCFA.*50 000 FCFA/);
    expect(r.getByTestId('live-map').props.children).toBe('driver');
    expect(r.getByTestId('online-switch')).toHaveTextContent('Passer hors ligne');
    await act(async () => fireEvent.press(r.getByTestId('online-switch')));
    expect(mockDriver.setOnline).toHaveBeenCalledWith(false);
  });

  it('course en cours : carte de colis → « Ouvrir la course » ; pas de passage hors ligne', async () => {
    mockDriver.profile = driverProfile({ isOnline: true });
    mockDriver.currentOrder = delivery();
    const r = await render(wrap(<DriverHome />));
    expect(r.getByTestId('current-order')).toHaveTextContent(/2 · Livrer · Course #1052.*Colis pour Awa Kaboré.*Patte d’Oie, rue 15\.23/);
    expect(r.getByTestId('current-order')).toHaveTextContent(/À encaisser à la livraison.*16 500 FCFA/);
    expect(r.queryByTestId('online-switch')).toBeNull();
    // Un seul bouton : la carte elle-même n'en est pas un (pas de bouton imbriqué, libellé réduit au nom).
    expect(r.getByTestId('current-order').props.accessibilityRole).toBeUndefined();
    expect(within(r.getByTestId('current-order')).getAllByRole('button').map((b) => b.props.testID)).toEqual(['open-order']);
    await act(async () => fireEvent.press(r.getByTestId('open-order')));
    expect(mockRouter.push).toHaveBeenCalledWith('/driver/order');
  });

  it('plafond d’espèces atteint, hors ligne : « Passer en ligne » inactif (le serveur refuserait) et dépôt expliqué', async () => {
    mockDriver.profile = driverProfile({ isOnline: false, cashBlocked: true, cashHeld: 52000, cashLimit: 50000 });
    const r = await render(wrap(<DriverHome />));
    const sw = r.getByTestId('online-switch');
    expect(sw.props.accessibilityState).toMatchObject({ disabled: true });
    expect(sw.props.accessibilityHint).toMatch(/plafond d’espèces atteint/);
    await act(async () => fireEvent.press(sw));
    expect(mockDriver.setOnline).not.toHaveBeenCalled();
    expect(r.getByTestId('cash-blocked')).toHaveTextContent(
      /Plafond d’espèces atteint \(52 000 FCFA\)\. Déposez l’argent auprès de Yaar : vous pourrez repasser en ligne dès que le dépôt sera enregistré\./,
    );
    expect(r.queryByText(/Passez en ligne pour recevoir des courses/)).toBeNull();
    // Montant et plafond : sur la même ligne que le libellé, ou entiers sur la ligne suivante (jamais coupés).
    expect(r.getByTestId('cash-held')).toHaveTextContent(/52 000 FCFA \/ 50 000 FCFA/);
    expect(StyleSheet.flatten(r.getByTestId('cash-held').parent?.props.style)).toMatchObject({ flexWrap: 'wrap' });
  });

  it('cibles tactiles et contrastes : SOS de 48 px étendu à 56, erreur GPS sur fond rouge opaque', async () => {
    mockDriver.profile = driverProfile({ isOnline: true });
    mockDriver.gpsError = 'GPS indisponible : vérifiez la localisation.';
    const r = await render(wrap(<DriverHome />));
    const sos = r.getByTestId('sos-button');
    expect(StyleSheet.flatten(sos.props.style)).toMatchObject({ width: 48, height: 48 });
    expect(sos.props.hitSlop).toBe(4);
    const gps = r.getByText('GPS indisponible : vérifiez la localisation.');
    expect(StyleSheet.flatten(gps.props.style)).toMatchObject({ color: '#FFFFFF', backgroundColor: '#C62F2F' });
  });

  it('offre affichée en plein écran, ou accueil masqué : carte de l’accueil démontée (une carte à la fois)', async () => {
    mockDriver.profile = driverProfile({ isOnline: true });
    mockDriver.offers = [offer()];
    const r = await render(wrap(<DriverHome />));
    expect(r.queryByTestId('live-map')).toBeNull();
    mockDriver.offers = [];
    mockFocused.current = false;
    await r.rerender(wrap(<DriverHome />));
    expect(r.queryByTestId('live-map')).toBeNull();
    mockFocused.current = true;
    await r.rerender(wrap(<DriverHome />));
    expect(r.getByTestId('live-map')).toBeTruthy();
  });

  it('plafond d’espèces atteint et erreur de localisation : messages affichés', async () => {
    mockDriver.profile = driverProfile({ isOnline: false, cashBlocked: true, cashHeld: 50000 });
    mockDriver.availabilityError = 'Autorisez la localisation pour passer en ligne (réglages du téléphone ou du navigateur).';
    const r = await render(wrap(<DriverHome />));
    expect(r.getByText(/Plafond d’espèces atteint \(50 000 FCFA\)/)).toBeTruthy();
    expect(r.getByText(/Autorisez la localisation pour passer en ligne/)).toBeTruthy();
  });

  it('dossier en attente : écran du dossier, pas de carte ni de gains', async () => {
    mockDriver.profile = driverProfile({ status: 'PENDING', kycComplete: false });
    const r = await render(wrap(<DriverHome />));
    expect(r.getByText('Mon dossier livreur')).toBeTruthy();
    expect(r.getByText('Ajoutez les pièces manquantes pour que votre dossier soit examiné.')).toBeTruthy();
    expect(r.queryByTestId('live-map')).toBeNull();
    expect(mockApi.driverEarnings).not.toHaveBeenCalled();
    await act(async () => fireEvent.press(r.getByText('Compléter mes documents')));
    expect(mockRouter.navigate).toHaveBeenCalledWith('/driver/documents');
  });
});
