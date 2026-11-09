import type { ReactElement } from 'react';
import { Linking } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { OrderDto } from '@yaar/shared';
import DriverOrderScreen from '../app/driver/order';
import { delivery, route } from './fixtures';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: false })),
  getCurrentPositionAsync: jest.fn(),
}));
jest.mock('../state/auth', () => ({ useApi: () => ({ pickupOrder: jest.fn(), sos: jest.fn(), disputeOrder: jest.fn() }) }));
jest.mock('../state/socket', () => ({ useOrderRoom: () => undefined }));
const mockDriver: {
  currentOrder: OrderDto | null;
  position: { lat: number; lng: number; at: number; heading: number | null } | null;
  [k: string]: unknown;
} = {
  currentOrder: null,
  position: null,
  setCurrentOrder: jest.fn(),
  refreshCurrentOrder: jest.fn(),
  refreshProfile: jest.fn(),
  orderNotice: null,
  clearOrderNotice: jest.fn(),
};
jest.mock('../state/driver', () => ({ useDriver: () => mockDriver }));
jest.mock('../components/map/LiveMap', () => {
  const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    LiveMap: (p: { markers: { kind: string; initials?: string | null }[]; lines: { kind: string }[]; allowRotate?: boolean; theme?: string }) => (
      <>
        <RNText testID="live-map">{`${p.markers.map((m) => m.kind).join(',')}|${p.lines.map((l) => l.kind).join(',')}|${p.allowRotate ? 'rotation' : ''}`}</RNText>
        <RNText testID="live-map-avatars">{`${p.markers.map((m) => `${m.kind}:${m.initials ?? '-'}`).join(',')}|${p.theme ?? 'light'}`}</RNText>
      </>
    ),
  };
});

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (el: ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{el}</SafeAreaProvider>;

describe('Course du livreur (carte, prochaine étape, montants)', () => {
  it('retrait : itinéraire vers l’entreprise, « Récupérer chez … · km · min », frais à encaisser au retrait', async () => {
    mockDriver.currentOrder = delivery({
      status: 'ASSIGNED',
      feePaidBy: 'SENDER',
      cashToCollect: 8000,
      deliveryFee: 1700,
      driverEarning: 1360,
      route: route({ target: 'PICKUP', points: [[12.3735, -1.492], [12.3727, -1.505], [12.3686, -1.5275]], distanceM: 4000, durationS: 600 }),
    });
    mockDriver.position = { lat: 12.3729, lng: -1.4985, at: 0, heading: 265 };
    const r = await render(wrap(<DriverOrderScreen />));
    // Étape, entreprise, puis distance et durée restantes de l'itinéraire.
    expect(r.getByTestId('next-step')).toHaveTextContent(/1 · RÉCUPÉRER.*Pharmacie du Centre.*Avenue Kwame Nkrumah.*\d,\d km · \d+ min/);
    expect(r.getByTestId('collect-at-pickup')).toHaveTextContent(/À encaisser auprès de l’entreprise.*1 700 FCFA/);
    expect(r.getByTestId('collect-at-dropoff')).toHaveTextContent(/Ensuite, à encaisser auprès du destinataire.*8 000 FCFA/);
    expect(r.getByTestId('live-map').props.children).toBe('pickup,dropoff,driver|route,dashed|rotation');
    // Carte claire ; entreprise et destinataire en épingles « avatar » à leurs initiales.
    expect(r.getByTestId('live-map-avatars').props.children).toBe('pickup:PC,dropoff:AK,driver:-|light');
    expect(r.getByTestId('pickup-button')).toBeTruthy();
    expect(r.getByTestId('tracking-sheet')).toBeTruthy();
  });

  it('retrait : WhatsApp de l’entreprise avec un message prérempli, appel de l’entreprise', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    mockDriver.currentOrder = delivery({ status: 'ASSIGNED', route: null });
    mockDriver.position = null;
    const r = await render(wrap(<DriverOrderScreen />));
    await act(async () => fireEvent.press(r.getByTestId('whatsapp-contact')));
    expect(open).toHaveBeenLastCalledWith(expect.stringMatching(/^https:\/\/wa\.me\/22671000001\?text=Bonjour/));
    expect(decodeURIComponent(String(open.mock.calls.at(-1)?.[0]))).toContain('récupérer la course #1052');
    await act(async () => fireEvent.press(r.getByTestId('call-contact')));
    expect(open).toHaveBeenLastCalledWith('tel:+22671000001');
    open.mockRestore();
  });

  it('livraison : destinataire, montant à encaisser = marchandise + frais (payés par le destinataire)', async () => {
    mockDriver.currentOrder = delivery();
    mockDriver.position = { lat: 12.3536, lng: -1.5191, at: 0, heading: null };
    const r = await render(wrap(<DriverOrderScreen />));
    expect(r.getByTestId('next-step')).toHaveTextContent(/2 · LIVRER.*Colis pour Awa Kaboré.*Patte d’Oie, rue 15\.23 · Repère : Station Total.*\d,\d km · \d+ min/);
    expect(r.getByTestId('collect-at-dropoff')).toHaveTextContent(
      /À encaisser auprès du destinataire.*Marchandise 15 000 FCFA \+ frais de livraison 1 500 FCFA, en espèces.*16 500 FCFA/,
    );
    expect(r.queryByTestId('collect-at-pickup')).toBeNull();
    expect(r.getByTestId('collect-at-dropoff-value')).toHaveTextContent('16\u202f500\u202fFCFA');
    expect(r.getByText('2 boîtes de médicaments')).toBeTruthy();
    expect(r.getByTestId('go-deliver')).toBeTruthy();
  });

  it('livraison : « Livré » ouvre la saisie du code ; « Signaler un problème » reste replié', async () => {
    const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');
    mockDriver.currentOrder = delivery();
    const r = await render(wrap(<DriverOrderScreen />));
    expect(r.getByTestId('dispute-open')).toBeTruthy();
    expect(r.queryByText('Envoyer au support')).toBeNull();
    await act(async () => fireEvent.press(r.getByTestId('go-deliver')));
    expect(router.push).toHaveBeenCalledWith('/driver/deliver');
  });
});
