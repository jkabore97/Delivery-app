import type { ReactElement } from 'react';
import { Dimensions, Linking, StyleSheet } from 'react-native';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
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
const mockBusiness: { store: StoreDto | null; stores: StoreDto[] | undefined; error: string | null; refreshStores: jest.Mock } = {
  store: null,
  stores: undefined,
  error: null,
  refreshStores: jest.fn(async () => undefined),
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

  it('cartes denses : numéro et état, nom, heure d’arrivée juste dessous, repère, livreur ; pastilles sur une ligne', async () => {
    mockApi.getOrder.mockRejectedValue(new Error('réseau'));
    mockApi.listDeliveries.mockResolvedValue(
      page([
        listed({ id: 'del-2', number: 1053, status: 'SEARCHING_DRIVER', driver: null, createdAt: '2026-11-08T14:18:00.000Z' }),
        listed({ etaMinutes: 9 }),
      ]),
    );
    const r = await show();
    expect(r.getByTestId('delivery-del-1')).toHaveTextContent(
      /^#1052En livraisonAKAwa KaboréArrivée vers 14:29 · dans 9 minPatte d’Oie, rue 15\.23Repère : Station TotalLivreur : Issouf · Moto 11 JJ 4521$/,
    );
    // Puces d'état Cobalt (en minuscules) : en livraison, recherche d'un livreur.
    expect(r.getByTestId('delivery-del-2')).toHaveTextContent(/^#1053Recherche d’un livreurAKAwa KaboréDemandée il y a 2 min/);
    expect(r.getByTestId('summary-on-the-way')).toHaveTextContent('1 en route');
    expect(r.getByTestId('summary-searching')).toHaveTextContent('1 recherche d’un livreur');
    expect(r.getByTestId('summary-searching').props.numberOfLines).toBe(1);
    expect(r.getByText('Livraisons en cours')).toBeTruthy();
    // Pastille « + Nouvelle » sur la ligne du titre (plus de grand bouton pleine largeur).
    expect(r.getByTestId('new-delivery')).toHaveTextContent('Nouvelle');
    expect(r.getByLabelText('Nouvelle livraison')).toBe(r.getByTestId('new-delivery'));
    await fireEvent.press(r.getByTestId('delivery-del-1'));
    expect(mockPush).toHaveBeenCalledWith('/business/livraison/del-1');
  });

  it('ordre : colis en route d’abord par heure d’arrivée, puis livreurs vers le retrait, puis recherches ; feuille plus haute à 2+', async () => {
    mockApi.getOrder.mockRejectedValue(new Error('réseau'));
    mockApi.listDeliveries.mockResolvedValue(
      page([
        listed({ id: 's', status: 'SEARCHING_DRIVER', driver: null, etaMinutes: null }),
        listed({ id: 'a', status: 'ASSIGNED', etaMinutes: 18 }),
        listed({ id: 'p-late', etaMinutes: 14 }),
        listed({ id: 'p-soon', etaMinutes: 4 }),
      ]),
    );
    const r = await show();
    const ids = r.getAllByTestId(/^delivery-[a-z-]+-card$/).map((e) => (e.props.testID as string).replace(/-card$/, ''));
    expect(ids).toEqual(['delivery-p-soon', 'delivery-p-late', 'delivery-a', 'delivery-s']);
    const { height } = Dimensions.get('window');
    expect(StyleSheet.flatten(r.getByTestId('tracking-sheet').props.style).maxHeight).toBe(Math.round(height * 0.62));
  });

  it('carte : la partie qui ouvre le suivi et les boutons de contact sont voisins (jamais un bouton dans un bouton)', async () => {
    mockApi.getOrder.mockRejectedValue(new Error('réseau'));
    mockApi.listDeliveries.mockResolvedValue(page([listed({ etaMinutes: 9 })]));
    const r = await show();
    const open = r.getByTestId('delivery-del-1');
    expect(open.props.accessibilityRole).toBe('button');
    expect(open.props.accessibilityLabel).toBe('Awa Kaboré, en livraison, arrivée vers 14:29, dans 9 min');
    expect(within(open).queryByLabelText(/WhatsApp|Appeler/)).toBeNull();
    const card = r.getByTestId('delivery-del-1-card');
    expect(within(card).getByLabelText('Écrire à Awa Kaboré sur WhatsApp (+22670112233)')).toBeTruthy();
    expect(within(card).getByLabelText('Appeler Awa Kaboré (+22670112233)')).toBeTruthy();
  });

  it('WhatsApp au destinataire depuis la carte : message prérempli avec le lien de suivi', async () => {
    mockApi.getOrder.mockResolvedValue(delivery());
    mockApi.listDeliveries.mockResolvedValue(page([listed()]));
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const r = await show();
    await fireEvent.press(r.getByLabelText('Écrire à Awa Kaboré sur WhatsApp (+22670112233)'));
    const text =
      'Bonjour Awa, Pharmacie du Centre vous envoie un colis avec Yaar Livraison. Suivez votre livreur en direct (le code à lui donner s’affiche sur la page) : https://yaar-livraison.vercel.app/suivi/tok-abc';
    expect(open).toHaveBeenCalledWith(`https://wa.me/22670112233?text=${encodeURIComponent(text)}`);
    await fireEvent.press(r.getByLabelText('Appeler Awa Kaboré (+22670112233)'));
    expect(open).toHaveBeenLastCalledWith('tel:+22670112233');
    // Les boutons de contact n'ouvrent pas le suivi de la livraison.
    expect(mockPush).not.toHaveBeenCalled();
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

  it('entreprise en attente de validation : bandeau, ni « Nouvelle » ni « Demandez un livreur »', async () => {
    mockBusiness.store = businessStore({ approvalStatus: 'PENDING' });
    mockApi.listDeliveries.mockResolvedValue(page([]));
    const r = await show();
    expect(r.getByText('Entreprise en attente de validation')).toBeTruthy();
    expect(r.queryByTestId('new-delivery')).toBeNull();
    expect(r.getByTestId('no-active-delivery')).toHaveTextContent(/Vos livraisons s’afficheront ici/);
    expect(r.getByTestId('no-active-delivery')).not.toHaveTextContent(/Demandez un livreur/);
    mockBusiness.store = businessStore({ approvalStatus: 'SUSPENDED', approvalNote: 'Hygiène' });
    const suspended = await show();
    expect(suspended.getAllByText('Entreprise suspendue par Yaar').length).toBeGreaterThan(0);
    expect(suspended.getAllByTestId('no-active-delivery').at(-1)).not.toHaveTextContent(/Demandez un livreur/);
  });

  it('chargement des livraisons en échec : message et « Réessayer » (le mode socket ne relance rien tout seul)', async () => {
    mockApi.listDeliveries.mockRejectedValueOnce(new Error('Connexion impossible'));
    mockApi.listDeliveries.mockResolvedValue(page([listed({ etaMinutes: 9 })]));
    mockApi.getOrder.mockResolvedValue(delivery());
    const r = await show();
    await waitFor(() => expect(r.getByText(/Connexion impossible/)).toBeTruthy());
    expect(r.queryByTestId('delivery-del-1')).toBeNull();
    await fireEvent.press(r.getByTestId('retry-deliveries'));
    await act(async () => jest.advanceTimersByTimeAsync(0));
    expect(r.queryByText(/Connexion impossible/)).toBeNull();
    expect(r.getByTestId('delivery-del-1')).toBeTruthy();
  });
});
