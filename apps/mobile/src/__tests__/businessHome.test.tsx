import type { ReactElement } from 'react';
import { Alert, Dimensions, Linking, StyleSheet } from 'react-native';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { BusinessSummaryDto, OrderDto, Paginated, StoreDto } from '@yaar/shared';
import BusinessDeliveriesScreen from '../app/business/(tabs)/index';
import { BusinessSummaryProvider } from '../components/business/summary';
import { businessStore, delivery, route } from './fixtures';

const mockPush = jest.fn();
const mockNavigate = jest.fn();
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: (...a: unknown[]) => mockPush(...a), navigate: (...a: unknown[]) => mockNavigate(...a) },
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
    useIsFocused: () => true,
  };
});
const SUMMARY: BusinessSummaryDto = {
  date: '2026-11-08',
  active: 2,
  today: { delivered: 14, cancelled: 1, avgDeliveryMinutes: 24, goodsCollected: 87500, deliveryFees: 21400 },
};
const mockApi = {
  listDeliveries: jest.fn<Promise<Paginated<OrderDto>>, [unknown]>(),
  getOrder: jest.fn<Promise<OrderDto>, [string]>(),
  request: jest.fn<Promise<unknown>, [string, string]>(),
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
// Carte remplacée par un résumé de sa scène : types des marqueurs | types des tracés, initiales et teinte des livreurs.
jest.mock('../components/map/LiveMap', () => {
  const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    LiveMap: (p: { markers: { kind: string; initials?: string | null; tone?: string }[]; lines: { kind: string }[] }) => (
      <>
        <RNText testID="live-map">{`${p.markers.map((m) => m.kind).join(',')}|${p.lines.map((l) => l.kind).join(',')}`}</RNText>
        <RNText testID="live-map-initials">{p.markers.map((m) => m.initials ?? '-').join(',')}</RNText>
        <RNText testID="live-map-tones">{p.markers.map((m) => m.tone ?? '-').join(',')}</RNText>
      </>
    ),
  };
});

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (el: ReactElement) => (
  <SafeAreaProvider initialMetrics={metrics}>
    <BusinessSummaryProvider>{el}</BusinessSummaryProvider>
  </SafeAreaProvider>
);
const page = (items: OrderDto[]): Paginated<OrderDto> => ({ items, total: items.length, page: 1, pageSize: 50 });
/** Liste de l'API : jamais de tracé (apps/api, orders.list `includeRoute: false`). */
const listed = (over: Partial<OrderDto> = {}) => delivery({ route: null, ...over });

async function show() {
  const r = await render(wrap(<BusinessDeliveriesScreen />));
  await act(async () => jest.advanceTimersByTimeAsync(0));
  return r;
}

describe('Accueil de l’entreprise (téléphone) : carte, chiffres du jour et livraisons en cours', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: Date.parse('2026-11-08T14:20:00.000Z') });
    jest.clearAllMocks();
    mockBusiness.store = businessStore();
    mockBusiness.stores = [businessStore()];
    mockBusiness.error = null;
    mockApi.request.mockImplementation(async (_m, path) => (path === '/business/summary' ? SUMMARY : null));
  });
  afterEach(() => jest.useRealTimers());

  it('itinéraire par les rues lu sur le détail de la livraison (la liste n’en a pas), entreprise et destinataire à leurs initiales', async () => {
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
    expect(r.getByTestId('live-map-initials').props.children).toBe('PC,AK,-');
    expect(mockApi.getOrder).toHaveBeenCalledTimes(1);
  });

  it('titre = nom de l’entreprise, « Nouvelle livraison » pleine largeur, chiffres du jour lus sur GET /business/summary', async () => {
    mockApi.getOrder.mockRejectedValue(new Error('réseau'));
    mockApi.listDeliveries.mockResolvedValue(page([listed({ etaMinutes: 9 }), listed({ id: 'del-2', number: 1053, status: 'SEARCHING_DRIVER', driver: null })]));
    const r = await show();
    expect(r.getByRole('header', { name: 'Pharmacie du Centre' })).toBeTruthy();
    expect(r.getByTestId('new-delivery')).toHaveTextContent('Nouvelle livraison');
    expect(r.getByLabelText('Nouvelle livraison')).toBe(r.getByTestId('new-delivery'));
    await fireEvent.press(r.getByTestId('new-delivery'));
    expect(mockPush).toHaveBeenCalledWith('/business/nouvelle');
    expect(mockApi.request).toHaveBeenCalledWith('GET', '/business/summary');
    // « 2 en cours » (la liste affichée), « 14 livrées », « 87 500 FCFA à reverser » (soleil).
    expect(r.getByTestId('kpi-chips')).toHaveTextContent(/^2en cours14livrées87\s500\sFCFAà reverser$/);
    expect(r.getByLabelText('87 500 FCFA à reverser, encaissés pour vous aujourd’hui')).toBeTruthy();
    // Pastille de la carte et titre de la liste (attendu aussi par le parcours e2e).
    expect(r.getByTestId('summary-on-the-way')).toHaveTextContent('2 en cours');
    expect(r.getByTestId('summary-searching')).toHaveTextContent('1 en recherche');
    expect(r.getByTestId('summary-on-the-way').props.numberOfLines).toBe(1);
    expect(r.getByText('Livraisons en cours')).toBeTruthy();
  });

  it('tuile héros cobalt : la livraison dont le colis arrive le premier (heure géante, soleil, livreur), toucher → suivi', async () => {
    mockApi.getOrder.mockRejectedValue(new Error('réseau'));
    mockApi.listDeliveries.mockResolvedValue(
      page([listed({ id: 'a', status: 'ASSIGNED', etaMinutes: 18 }), listed({ id: 'p-late', etaMinutes: 14 }), listed({ id: 'p-soon', number: 1060, etaMinutes: 4 })]),
    );
    const r = await show();
    const hero = r.getByTestId('hero-delivery');
    expect(within(hero).getByText('14:24')).toBeTruthy();
    expect(hero).toHaveTextContent(/^Arrivée16\s500\sFCFA14:24dans 4 minAKAwa Kaboré\s+Patte d’OieIssouf S\./);
    expect(StyleSheet.flatten(within(hero).getByText('14:24').props.style)).toMatchObject({ fontSize: 64, fontWeight: '800' });
    await fireEvent.press(r.getByTestId('delivery-p-soon'));
    expect(mockPush).toHaveBeenCalledWith('/business/livraison/p-soon');
  });

  it('ordre : colis en route d’abord par heure d’arrivée, puis livreurs vers le retrait, puis recherches ; feuille plus haute', async () => {
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
    // La première (héros), puis les autres en liste (plus de deux).
    expect(r.getByTestId('hero-delivery')).toBeTruthy();
    expect(r.getByTestId('delivery-p-soon')).toContainElement(r.getByTestId('hero-delivery'));
    const ids = r.getAllByTestId(/^delivery-[a-z-]+-card$/).map((e) => (e.props.testID as string).replace(/-card$/, ''));
    expect(ids).toEqual(['delivery-p-late', 'delivery-a', 'delivery-s']);
    // Puces d'état courtes : « Retrait dans … », « Recherche d’un livreur ».
    expect(r.getByTestId('delivery-a')).toHaveTextContent(/Retrait dans \d+ min/);
    expect(r.getByTestId('delivery-s')).toHaveTextContent(/Recherche d’un livreur/);
    const { height } = Dimensions.get('window');
    expect(StyleSheet.flatten(r.getByTestId('tracking-sheet').props.style).maxHeight).toBe(Math.round(height * 0.62));
  });

  it('exactement deux autres livraisons : deux cartes côte à côte', async () => {
    mockApi.getOrder.mockRejectedValue(new Error('réseau'));
    mockApi.listDeliveries.mockResolvedValue(
      page([listed({ id: 'p', etaMinutes: 5 }), listed({ id: 'a', status: 'ASSIGNED', etaMinutes: 20 }), listed({ id: 's', status: 'SEARCHING_DRIVER', driver: null })]),
    );
    const r = await show();
    const a = r.getByTestId('delivery-a-card');
    const s = r.getByTestId('delivery-s-card');
    expect(a.parent).toBe(s.parent);
    expect(StyleSheet.flatten(a.parent?.props.style)).toMatchObject({ flexDirection: 'row' });
    expect(StyleSheet.flatten(a.props.style)).toMatchObject({ flex: 1 });
  });

  it('carte compacte : la partie qui ouvre le suivi et les boutons de contact sont voisins (jamais un bouton dans un bouton)', async () => {
    mockApi.getOrder.mockRejectedValue(new Error('réseau'));
    mockApi.listDeliveries.mockResolvedValue(page([listed({ id: 'first', etaMinutes: 3, recipientName: 'Mariam Ouédraogo' }), listed({ etaMinutes: 9 })]));
    const r = await show();
    const open = r.getByTestId('delivery-del-1');
    expect(open.props.accessibilityRole).toBe('button');
    expect(open.props.accessibilityLabel).toBe('Awa Kaboré, en livraison, arrivée vers 14:29, dans 9 min');
    expect(within(open).queryByLabelText(/WhatsApp|Appeler/)).toBeNull();
    const card = r.getByTestId('delivery-del-1-card');
    expect(within(card).getByLabelText('Écrire à Awa Kaboré sur WhatsApp (+22670112233)')).toBeTruthy();
    expect(within(card).getByLabelText('Appeler Awa Kaboré (+22670112233)')).toBeTruthy();
    await fireEvent.press(open);
    expect(mockPush).toHaveBeenCalledWith('/business/livraison/del-1');
  });

  it('WhatsApp au destinataire depuis la carte : message prérempli avec le lien de suivi', async () => {
    mockApi.getOrder.mockResolvedValue(delivery());
    mockApi.listDeliveries.mockResolvedValue(page([listed({ id: 'first', etaMinutes: 3 }), listed()]));
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const r = await show();
    const card = r.getByTestId('delivery-del-1-card');
    await fireEvent.press(within(card).getByLabelText('Écrire à Awa Kaboré sur WhatsApp (+22670112233)'));
    const text =
      'Bonjour Awa, Pharmacie du Centre vous envoie un colis avec Yaar Livraison. Suivez votre livreur en direct (le code à lui donner s’affiche sur la page) : https://yaar-livraison.vercel.app/suivi/tok-abc';
    expect(open).toHaveBeenCalledWith(`https://wa.me/22670112233?text=${encodeURIComponent(text)}`);
    await fireEvent.press(within(card).getByLabelText('Appeler Awa Kaboré (+22670112233)'));
    expect(open).toHaveBeenLastCalledWith('tel:+22670112233');
    // Les boutons de contact n'ouvrent pas le suivi de la livraison.
    expect(mockPush).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('livreur en route vers l’entreprise : disque soleil sur la carte, étape suivante en pointillés encre', async () => {
    mockApi.getOrder.mockRejectedValue(new Error('réseau'));
    mockApi.listDeliveries.mockResolvedValue(page([listed({ status: 'ASSIGNED', etaMinutes: 18 })]));
    const r = await show();
    expect(r.getByTestId('live-map').props.children).toBe('pickup,dropoff,driver|dashed,pending');
    expect(r.getByTestId('live-map-tones').props.children).toBe('-,-,sun');
  });

  it('aucune livraison : illustration et explication, « Nouvelle livraison », pas de pastille sur la carte', async () => {
    mockApi.listDeliveries.mockResolvedValue(page([]));
    const r = await show();
    expect(r.getByTestId('no-active-delivery')).toHaveTextContent(/Aucune livraison en cours.*il récupère le colis chez vous/);
    expect(r.queryByTestId('summary-on-the-way')).toBeNull();
    expect(r.getByTestId('live-map').props.children).toBe('pickup|');
    expect(r.getByTestId('kpi-chips')).toHaveTextContent(/^0en cours/);
    expect(mockApi.getOrder).not.toHaveBeenCalled();
    await fireEvent.press(r.getByTestId('new-delivery'));
    expect(mockPush).toHaveBeenCalledWith('/business/nouvelle');
  });

  it('entreprise en attente de validation : bandeau, « Nouvelle livraison » grisée qui explique pourquoi', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockBusiness.store = businessStore({ approvalStatus: 'PENDING' });
    mockApi.listDeliveries.mockResolvedValue(page([]));
    const r = await show();
    expect(r.getByText('Entreprise en attente de validation')).toBeTruthy();
    expect(r.queryByTestId('new-delivery')).toBeNull();
    const off = r.getByTestId('new-delivery-unavailable');
    expect(off.props.accessibilityLabel).toBe('Nouvelle livraison, indisponible\u202f: entreprise en attente de validation');
    await fireEvent.press(off);
    expect(mockPush).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('Entreprise en attente de validation', expect.stringMatching(/Yaar vérifie votre entreprise/));
    expect(r.getByTestId('no-active-delivery')).toHaveTextContent(/Vos livraisons s’afficheront ici/);
    expect(r.getByTestId('no-active-delivery')).not.toHaveTextContent(/Demandez un livreur/);
    mockBusiness.store = businessStore({ approvalStatus: 'SUSPENDED', approvalNote: 'Hygiène' });
    const suspended = await show();
    expect(suspended.getAllByText('Entreprise suspendue par Yaar').length).toBeGreaterThan(0);
    expect(suspended.getAllByTestId('no-active-delivery').at(-1)).not.toHaveTextContent(/Demandez un livreur/);
    alert.mockRestore();
  });

  it('pas encore d’entreprise : « Créer mon profil d’entreprise » à la place de la demande', async () => {
    mockBusiness.store = null;
    mockBusiness.stores = [];
    mockApi.listDeliveries.mockResolvedValue(page([]));
    const r = await show();
    expect(r.queryByTestId('new-delivery')).toBeNull();
    await fireEvent.press(r.getByTestId('create-business'));
    expect(mockNavigate).toHaveBeenCalledWith('/business/profile');
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

  it('résumé du jour indisponible : les pastilles attendent (« … ») sans bloquer la liste', async () => {
    mockApi.request.mockRejectedValue(new Error('réseau'));
    mockApi.getOrder.mockRejectedValue(new Error('réseau'));
    mockApi.listDeliveries.mockResolvedValue(page([listed({ etaMinutes: 9 })]));
    const r = await show();
    expect(r.getByTestId('kpi-chips')).toHaveTextContent(/^1en cours…livrées…à reverser$/);
    expect(r.getByTestId('hero-delivery')).toBeTruthy();
  });
});
