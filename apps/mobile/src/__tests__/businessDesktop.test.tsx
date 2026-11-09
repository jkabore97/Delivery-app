import type { ReactElement } from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { OrderDto, Paginated, QuoteResponse, StoreDto } from '@yaar/shared';
import BusinessHistoryScreen from '../app/business/(tabs)/history';
import BusinessProfile from '../app/business/(tabs)/profile';
import BusinessDeliveryScreen from '../app/business/livraison/[id]';
import NewDeliveryScreen from '../app/business/nouvelle';
import { businessStore, delivery, route } from './fixtures';

const mockParams: { id: string; created?: string } = { id: 'del-1' };
const mockRouter = { back: jest.fn(), replace: jest.fn(), push: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    useLocalSearchParams: () => mockParams,
    router: mockRouter,
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
    useIsFocused: () => true,
    usePathname: () => '/business',
  };
});
const QUOTE: QuoteResponse = {
  type: 'PARCEL',
  distanceKm: 4.4,
  itemsTotal: 0,
  pickup: { lat: 12.3686, lng: -1.5275, address: 'Avenue Kwame Nkrumah', landmark: '' },
  dropoff: { lat: 12.3395, lng: -1.517, address: 'Patte d’Oie', landmark: '' },
  paymentMethods: ['CASH'],
  options: [{ vehicleType: 'MOTO', available: true, deliveryFee: 1500, total: 1500, estimatedMinutes: 13 }],
};
const mockApi = {
  getOrder: jest.fn<Promise<OrderDto>, [string]>(),
  cancelOrder: jest.fn(),
  rateOrder: jest.fn(),
  disputeOrder: jest.fn(),
  listDeliveries: jest.fn<Promise<Paginated<OrderDto>>, [unknown]>(),
  quoteDelivery: jest.fn(async () => QUOTE),
  createDelivery: jest.fn(),
  request: jest.fn(async () => null),
};
jest.mock('../state/auth', () => ({ useApi: () => mockApi, useAuth: () => ({ api: mockApi, user: { id: 'u', name: 'Aïcha Traoré', phone: '+22671000001', role: 'SELLER' } }) }));
const mockBusiness: { store: StoreDto | null; stores: StoreDto[] | undefined } = { store: businessStore(), stores: [businessStore()] };
jest.mock('../state/business', () => ({
  useBusiness: () => ({ ...mockBusiness, selectStore: jest.fn(), upsertStore: jest.fn(), error: null, refreshStores: jest.fn() }),
  isBusinessApproved: (s: StoreDto | null) => !!s && s.approvalStatus === 'APPROVED',
}));
jest.mock('../state/socket', () => ({
  useOrderRoom: () => undefined,
  useOrderRooms: () => undefined,
  usePolling: () => undefined,
  useSocketEvent: () => undefined,
  useSocket: () => ({ pollIntervalMs: 4000 }),
}));
jest.mock('../components/map/LiveMap', () => {
  const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    LiveMap: (p: { markers: { kind: string; tone?: string }[]; lines: { kind: string }[] }) => (
      <RNText testID="live-map">{`${p.markers.map((m) => `${m.kind}${m.tone ? `:${m.tone}` : ''}`).join(',')}|${p.lines.map((l) => l.kind).join(',')}`}</RNText>
    ),
  };
});
jest.mock('../components/map/PickerMap', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  const { forwardRef: fr, useImperativeHandle: uih } = jest.requireActual<typeof import('react')>('react');
  return {
    PickerMap: fr(function PickerMapStub(p: { onCenterChange: (lat: number, lng: number) => void }, ref: unknown) {
      uih(ref as never, () => ({ centerOn: jest.fn() }));
      return <RN.Pressable testID="simulate-move" onPress={() => p.onCenterChange(12.3395, -1.517)} />;
    }),
  };
});
// Profil du compte (composant commun aux deux espaces) : remplacé par son titre.
jest.mock('../components/ProfileScreen', () => {
  const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ProfileScreen: (p: { top?: ReactElement }) => <>{p.top ?? <RNText testID="account-panel">Mon profil</RNText>}</> };
});

const metrics = { frame: { x: 0, y: 0, width: 1440, height: 900 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (el: ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{el}</SafeAreaProvider>;

describe('Espace entreprise sur ordinateur (1 440 × 900) : pages larges', () => {
  let dims: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams.created = undefined;
    mockBusiness.store = businessStore();
    mockBusiness.stores = [businessStore()];
    dims = jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ width: 1440, height: 900, scale: 2, fontScale: 1 });
  });
  afterEach(() => {
    dims.mockRestore();
    jest.useRealTimers();
  });

  it('détail : carte à gauche, colonne à droite (heure d’arrivée en tuile cobalt, livreur à appeler, montants) ; jamais le code', async () => {
    jest.useFakeTimers({ now: Date.parse('2026-11-08T14:20:00.000Z') });
    mockApi.getOrder.mockResolvedValue(delivery({ deliveryCode: '1234', etaMinutes: 9, pickedUpAt: '2026-11-08T14:05:00.000Z' }));
    const r = await render(wrap(<BusinessDeliveryScreen />));
    await act(async () => jest.advanceTimersByTimeAsync(0));
    expect(r.getByRole('header', { name: 'Livraison #1052' })).toBeTruthy();
    expect(r.getByTestId('delivery-map')).toBeTruthy();
    expect(r.getByTestId('tracking-headline')).toHaveTextContent(/^Arrivée vers14:29dans 9 minEn route vers Awa KaboréColis récupéré\./);
    expect(r.getByTestId('tracking-headline')).toHaveTextContent(/Récupérée14:05En routemaintenantLivrée14:29/);
    expect(within(r.getByTestId('driver-card')).getByTestId('call-driver')).toBeTruthy();
    expect(r.getByTestId('recipient-amount-value')).toHaveTextContent('16 500 FCFA');
    expect(r.getByTestId('share-tracking')).toBeTruthy();
    expect(r.queryByText('1234')).toBeNull();
    // Colis récupéré : plus d'annulation.
    expect(r.queryByTestId('cancel-delivery')).toBeNull();
    await fireEvent.press(r.getByTestId('page-back'));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('détail, livreur vers l’entreprise : livreur en disque soleil, annulation en haut à droite (avec confirmation)', async () => {
    mockApi.getOrder.mockResolvedValue(delivery({ status: 'ASSIGNED', route: route({ target: 'PICKUP', points: [[12.3627, -1.521], [12.3686, -1.5275]] }) }));
    mockApi.cancelOrder.mockResolvedValue(delivery({ status: 'CANCELLED', cancelReason: 'Annulée par l’entreprise', driver: null, cancelledAt: '2026-11-08T14:22:00.000Z' }));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const r = await render(wrap(<BusinessDeliveryScreen />));
    await waitFor(() => expect(r.getByTestId('cancel-delivery')).toBeTruthy());
    expect(r.getByTestId('live-map').props.children).toBe('pickup,dropoff,driver:sun|route,pending');
    expect(r.getByTestId('eta-secondary')).toHaveTextContent(/^Livraison chez Awa prévue vers \d\d:\d\d$/);
    await fireEvent.press(r.getByTestId('cancel-delivery'));
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    await act(async () => buttons.find((b) => b.style === 'destructive')?.onPress?.());
    await waitFor(() => expect(r.getByText('Livraison annulée')).toBeTruthy());
    expect(mockApi.cancelOrder).toHaveBeenCalledWith('del-1', 'Annulée par l’entreprise');
    expect(r.getByTestId('tracking-headline')).toHaveTextContent(/Livraison annuléeAnnulée le 08\/11\/2026 14:22/);
    alert.mockRestore();
  });

  it('historique : tableau (numéro, destinataire, état, date, encaissé, frais), une ligne ouvre le détail', async () => {
    mockApi.listDeliveries.mockResolvedValue({
      items: [
        delivery({ id: 'h-1', status: 'DELIVERED', deliveredAt: '2026-11-08T14:51:00.000Z', createdAt: '2026-11-08T14:20:00.000Z' }),
        delivery({ id: 'h-2', number: 1040, status: 'CANCELLED', cancelReason: 'Client absent', cancelledAt: '2026-11-08T15:00:00.000Z' }),
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    });
    const r = await render(wrap(<BusinessHistoryScreen />));
    await waitFor(() => expect(r.getByTestId('history-row-h-1')).toBeTruthy());
    expect(r.getByTestId('history-desktop')).toHaveTextContent(/Historique2 livraisons terminées/);
    expect(r.getByTestId('history-row-h-1')).toHaveTextContent(/#1052AKAwa KaboréPatte d’Oie · 31 minLivrée08\/11\/2026 14:5116\s500\sFCFA1\s500\sFCFApayés par le destinataire/);
    expect(r.getByTestId('history-row-collected-h-1')).toHaveTextContent('16 500 FCFA');
    expect(r.getByTestId('history-row-h-2')).toHaveTextContent(/Patte d’Oie · Client absentAnnulée.*—aucuns frais/);
    await fireEvent.press(r.getByTestId('history-row-h-2'));
    expect(mockRouter.push).toHaveBeenCalledWith('/business/livraison/h-2');
  });

  it('nouvelle livraison : carte à gauche et formulaire en colonne ; les mêmes étapes et contrôles', async () => {
    mockApi.createDelivery.mockResolvedValue(delivery({ id: 'del-9', status: 'SEARCHING_DRIVER' }));
    const r = await render(wrap(<NewDeliveryScreen />));
    expect(r.getByTestId('new-delivery-desktop')).toBeTruthy();
    expect(r.getByRole('header', { name: 'Nouvelle livraison' })).toBeTruthy();
    await fireEvent.press(r.getByTestId('wizard-next'));
    expect(r.getByText('Déplacez la carte pour placer l’épingle sur le lieu de livraison.')).toBeTruthy();
    await fireEvent.press(r.getByTestId('simulate-move'));
    await fireEvent.changeText(r.getByTestId('recipient-name'), 'Awa Kaboré');
    await fireEvent.changeText(r.getByTestId('recipient-phone'), '70 11 22 33');
    await fireEvent.press(r.getByTestId('wizard-next'));
    await waitFor(() => expect(r.getByTestId('vehicle-MOTO')).toBeTruthy());
    // Étapes 2 et 3 : la carte montre le trajet de l'entreprise au destinataire.
    expect(r.getByTestId('trip-map')).toBeTruthy();
    expect(r.getByTestId('live-map').props.children).toBe('pickup,dropoff|dashed');
    await fireEvent.changeText(r.getByTestId('package-description'), 'Repas');
    await fireEvent.press(r.getByTestId('wizard-next'));
    expect(r.getByText('Récapitulatif')).toBeTruthy();
    await fireEvent.press(r.getByTestId('request-driver'));
    expect(mockApi.createDelivery).toHaveBeenCalledWith(expect.objectContaining({ recipientName: 'Awa Kaboré', vehicleType: 'MOTO' }));
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/business/livraison/[id]', params: { id: 'del-9', created: '1' } });
  });

  it('établissements : page large (entreprise, validation, adresse) et le compte dans une colonne à droite', async () => {
    const r = await render(wrap(<BusinessProfile />));
    expect(r.getByTestId('profile-desktop')).toBeTruthy();
    expect(r.getByRole('header', { name: 'Établissements' })).toBeTruthy();
    expect(r.getByTestId('business-identity')).toHaveTextContent(/PCPharmacie du CentreAvenue Kwame NkrumahValidée par Yaar/);
    expect(r.getByTestId('account-panel')).toHaveTextContent('Mon profil');
    expect(r.getByTestId('save-business')).toBeTruthy();
  });
});
