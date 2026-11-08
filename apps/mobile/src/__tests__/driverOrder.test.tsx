import type { ReactElement } from 'react';
import { render } from '@testing-library/react-native';
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
    LiveMap: (p: { markers: { kind: string }[]; lines: { kind: string }[]; allowRotate?: boolean }) => (
      <RNText testID="live-map">{`${p.markers.map((m) => m.kind).join(',')}|${p.lines.map((l) => l.kind).join(',')}|${p.allowRotate ? 'rotation' : ''}`}</RNText>
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
    expect(r.getByTestId('next-step')).toHaveTextContent(/Récupérer chez Pharmacie du Centre · \d,\d km · \d+ min/);
    expect(r.getByTestId('collect-at-pickup')).toHaveTextContent(/À encaisser auprès de l’entreprise.*1 700 FCFA/);
    expect(r.getByTestId('collect-at-dropoff')).toHaveTextContent(/Ensuite, à encaisser auprès du destinataire.*8 000 FCFA/);
    expect(r.getByTestId('live-map').props.children).toBe('pickup,dropoff,driver|route,dashed|rotation');
    expect(r.getByTestId('pickup-button')).toBeTruthy();
  });

  it('livraison : destinataire, montant à encaisser = marchandise + frais (payés par le destinataire)', async () => {
    mockDriver.currentOrder = delivery();
    mockDriver.position = { lat: 12.3536, lng: -1.5191, at: 0, heading: null };
    const r = await render(wrap(<DriverOrderScreen />));
    expect(r.getByTestId('next-step')).toHaveTextContent(/Livrer à Awa Kaboré · \d,\d km · \d+ min/);
    expect(r.getByTestId('collect-at-dropoff')).toHaveTextContent(
      /À encaisser auprès du destinataire.*Marchandise 15 000 FCFA \+ frais de livraison 1 500 FCFA, en espèces.*16 500 FCFA/,
    );
    expect(r.queryByTestId('collect-at-pickup')).toBeNull();
    expect(r.getByTestId('go-deliver')).toBeTruthy();
  });
});
