import type { ReactElement } from 'react';
import { Linking } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { OrderDto, Paginated, StoreDto } from '@yaar/shared';
import BusinessDeliveriesScreen from '../app/business/(tabs)/index';
import { businessStore, delivery, route } from './fixtures';

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: (...a: unknown[]) => mockPush(...a), navigate: jest.fn() },
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
    useIsFocused: () => true,
  };
});
const mockApi = {
  listDeliveries: jest.fn<Promise<Paginated<OrderDto>>, [unknown]>(),
  getOrder: jest.fn<Promise<OrderDto>, [string]>(),
};
jest.mock('../state/auth', () => ({ useApi: () => mockApi }));
const mockBusiness: { store: StoreDto | null; stores: StoreDto[] | undefined; error: string | null } = {
  store: null,
  stores: undefined,
  error: null,
};
jest.mock('../state/business', () => ({
  useBusiness: () => mockBusiness,
  isBusinessApproved: (s: StoreDto | null) => !!s && s.approvalStatus === 'APPROVED',
}));
jest.mock('../state/socket', () => ({
  useOrderRooms: () => undefined,
  usePolling: () => undefined,
  useSocketEvent: () => undefined,
  useSocket: () => ({ pollIntervalMs: 4000 }),
}));
// Carte remplacée par un résumé de sa scène : types des marqueurs | types des tracés, et initiales des épingles.
jest.mock('../components/map/LiveMap', () => {
  const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    LiveMap: (p: { markers: { kind: string; initials?: string | null }[]; lines: { kind: string }[] }) => (
      <>
        <RNText testID="live-map">{`${p.markers.map((m) => m.kind).join(',')}|${p.lines.map((l) => l.kind).join(',')}`}</RNText>
        <RNText testID="live-map-initials">{p.markers.map((m) => m.initials ?? '-').join(',')}</RNText>
      </>
    ),
  };
});

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (el: ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{el}</SafeAreaProvider>;
const page = (items: OrderDto[]): Paginated<OrderDto> => ({ items, total: items.length, page: 1, pageSize: 50 });
/** Liste de l'API : jamais de tracé (apps/api, orders.list `includeRoute: false`). */
const listed = (over: Partial<OrderDto> = {}) => delivery({ route: null, ...over });

async function show() {
  const r = await render(wrap(<BusinessDeliveriesScreen />));
  await act(async () => jest.advanceTimersByTimeAsync(0));
  return r;
}

describe('Accueil de l’entreprise : carte et livraisons en cours', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: Date.parse('2026-11-08T14:20:00.000Z') });
    jest.clearAllMocks();
    mockBusiness.store = businessStore();
    mockBusiness.stores = [businessStore()];
    mockBusiness.error = null;
  });
  afterEach(() => jest.useRealTimers());

  it('itinéraire par les rues lu sur le détail de la livraison (la liste n’en a pas), destinataire à ses initiales', async () => {
    let resolve: (o: OrderDto) => void = () => undefined;
    mockApi.listDeliveries.mockResolvedValue(page([listed()]));
    mockApi.getOrder.mockReturnValue(new Promise((r) => (resolve = r)));
    const r = await show();
    // Avant la réponse du détail : ligne droite en pointillés (comme avant la correction).
    expect(r.getByTestId('live-map').props.children).toBe('pickup,dropoff,driver|dashed');
    expect(mockApi.getOrder).toHaveBeenCalledWith('del-1');
    await act(async () => resolve(delivery({ route: route() })));
    // Même tracé que la page du destinataire : l'itinéraire de l'API, rogné au livreur.
    expect(r.getByTestId('live-map').props.children).toBe('pickup,dropoff,driver|route');
    expect(r.getByTestId('live-map-initials').props.children).toBe('-,AK,-');
    expect(mockApi.getOrder).toHaveBeenCalledTimes(1);
  });

  it('cartes : heure d’arrivée « Arrivée vers 14:29 · dans 9 min », livreur, recherche ; pastilles sur la carte', async () => {
    mockApi.getOrder.mockRejectedValue(new Error('réseau'));
    mockApi.listDeliveries.mockResolvedValue(
      page([
        listed({ id: 'del-2', number: 1053, status: 'SEARCHING_DRIVER', driver: null, createdAt: '2026-11-08T14:18:00.000Z' }),
        listed({ etaMinutes: 9 }),
      ]),
    );
    const r = await show();
    expect(r.getByTestId('delivery-del-1')).toHaveTextContent(/#1052EN LIVRAISONAwa Kaboré/);
    expect(r.getByTestId('delivery-del-1')).toHaveTextContent(/Arrivée vers 14:29 · dans 9 min/);
    expect(r.getByTestId('delivery-del-1')).toHaveTextContent(/Livreur : Issouf Sawadogo · Moto 11 JJ 4521/);
    expect(r.getByTestId('delivery-del-2')).toHaveTextContent(/RECHERCHE LIVREUR.*Demandée il y a 2 min/);
    expect(r.getByTestId('summary-on-the-way')).toHaveTextContent('1 en route');
    expect(r.getByTestId('summary-searching')).toHaveTextContent('1 en recherche');
    expect(r.getByText('Livraisons en cours')).toBeTruthy();
    await fireEvent.press(r.getByTestId('delivery-del-1'));
    expect(mockPush).toHaveBeenCalledWith('/business/livraison/del-1');
  });

  it('WhatsApp au destinataire depuis la carte : message prérempli avec le lien de suivi', async () => {
    mockApi.getOrder.mockResolvedValue(delivery());
    mockApi.listDeliveries.mockResolvedValue(page([listed()]));
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const r = await show();
    await fireEvent.press(r.getByLabelText('Écrire sur WhatsApp (+22670112233)'));
    const text =
      'Bonjour Awa, Pharmacie du Centre vous envoie un colis avec Yaar Livraison. Suivez votre livreur en direct (le code à lui donner s’affiche sur la page) : https://yaar-livraison.vercel.app/suivi/tok-abc';
    expect(open).toHaveBeenCalledWith(`https://wa.me/22670112233?text=${encodeURIComponent(text)}`);
    await fireEvent.press(r.getByLabelText('Appeler (+22670112233)'));
    expect(open).toHaveBeenLastCalledWith('tel:+22670112233');
    open.mockRestore();
  });

  it('aucune livraison : illustration et explication (pas de grand vide), « Nouvelle livraison », pas de pastilles', async () => {
    mockApi.listDeliveries.mockResolvedValue(page([]));
    const r = await show();
    expect(r.getByTestId('no-active-delivery')).toHaveTextContent(/Aucune livraison en cours.*il récupère le colis chez vous/);
    expect(r.queryByTestId('summary-on-the-way')).toBeNull();
    expect(r.getByTestId('live-map').props.children).toBe('pickup|');
    expect(mockApi.getOrder).not.toHaveBeenCalled();
    await fireEvent.press(r.getByTestId('new-delivery'));
    expect(mockPush).toHaveBeenCalledWith('/business/nouvelle');
  });

  it('entreprise en attente de validation : bandeau, pas de « Nouvelle livraison »', async () => {
    mockBusiness.store = businessStore({ approvalStatus: 'PENDING' });
    mockApi.listDeliveries.mockResolvedValue(page([]));
    const r = await show();
    expect(r.getByText('⏳ Entreprise en attente de validation')).toBeTruthy();
    expect(r.queryByTestId('new-delivery')).toBeNull();
  });

  it('chargement des livraisons en échec : message d’erreur dans la feuille', async () => {
    mockApi.listDeliveries.mockRejectedValue(new Error('Connexion impossible'));
    const r = await show();
    await waitFor(() => expect(r.getByText(/Connexion impossible|erreur/i)).toBeTruthy());
  });
});
