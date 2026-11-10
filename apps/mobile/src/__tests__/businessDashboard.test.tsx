import type { ReactElement } from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { BusinessSummaryDto, OrderDto, Paginated, StoreDto } from '@yaar/shared';
import BusinessDeliveriesScreen from '../app/business/(tabs)/index';
import { BusinessFrame } from '../components/business/desktop/Shell';
import { activeNav, Sidebar } from '../components/business/desktop/Sidebar';
import { BusinessSummaryProvider } from '../components/business/summary';
import { businessStore, delivery, route } from './fixtures';

const mockPush = jest.fn();
const mockNavigate = jest.fn();
let mockPathname = '/business';
jest.mock('expo-router', () => {
  const { cloneElement, useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: (...a: unknown[]) => mockPush(...a), navigate: (...a: unknown[]) => mockNavigate(...a) },
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
    useIsFocused: () => true,
    usePathname: () => mockPathname,
    // `<Link href asChild>` : un vrai lien sur le web ; ici, l'appui navigue vers `href` (et l'enfant garde `href`).
    Link: ({ href, children }: { href: string; children: React.ReactElement }) => cloneElement(children as React.ReactElement<Record<string, unknown>>, { href, onPress: () => mockNavigate(href) }),
  };
});
const SUMMARY: BusinessSummaryDto = {
  date: '2026-11-09',
  active: 3,
  today: { delivered: 14, cancelled: 1, avgDeliveryMinutes: 24, goodsCollected: 87500, deliveryFees: 21400 },
};
const mockApi = {
  listDeliveries: jest.fn<Promise<Paginated<OrderDto>>, [{ status?: string[] }]>(),
  getOrder: jest.fn<Promise<OrderDto>, [string]>(),
  request: jest.fn<Promise<unknown>, [string, string]>(),
};
const mockUser = { id: 'u-biz', phone: '+22671000001', name: 'Aïcha Traoré', role: 'SELLER' };
jest.mock('../state/auth', () => ({ useApi: () => mockApi, useAuth: () => ({ user: mockUser, api: mockApi }) }));
const mockBusiness: { store: StoreDto | null; stores: StoreDto[] | undefined; error: string | null; refreshStores: jest.Mock; selectStore: jest.Mock } = {
  store: null,
  stores: undefined,
  error: null,
  refreshStores: jest.fn(async () => undefined),
  selectStore: jest.fn(),
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
// Carte : marqueurs, tracés et points cadrés par la caméra (premier point).
jest.mock('../components/map/LiveMap', () => {
  const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    LiveMap: (p: { markers: { kind: string; initials?: string | null }[]; lines: { kind: string }[]; fitPoints: { lat: number; lng: number }[] }) => (
      <>
        <RNText testID="live-map">{`${p.markers.map((m) => m.kind).join(',')}|${p.lines.map((l) => l.kind).join(',')}`}</RNText>
        <RNText testID="live-map-fit">{p.fitPoints.map((f) => `${f.lat},${f.lng}`).join(';')}</RNText>
      </>
    ),
  };
});

const NOW = Date.parse('2026-11-09T12:02:00.000Z');
const metrics = { frame: { x: 0, y: 0, width: 1440, height: 900 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (el: ReactElement) => (
  <SafeAreaProvider initialMetrics={metrics}>
    <BusinessSummaryProvider>{el}</BusinessSummaryProvider>
  </SafeAreaProvider>
);
const page = (items: OrderDto[]): Paginated<OrderDto> => ({ items, total: items.length, page: 1, pageSize: 50 });
const listed = (over: Partial<OrderDto> = {}) => delivery({ route: null, ...over });

const mariam = listed({
  id: 'o1003',
  number: 1003,
  recipientName: 'Mariam Ouédraogo',
  recipientPhone: '+22670445566',
  dropoff: { lat: 12.3226, lng: -1.4977, address: 'Ouaga 2000, avenue Mouammar Kadhafi', landmark: 'Villa 12, portail noir' },
  etaMinutes: 7,
  cashToCollect: 8200,
  deliveryFee: 1600,
  createdAt: '2026-11-09T11:41:00.000Z',
  pickedUpAt: '2026-11-09T11:58:00.000Z',
});
const awa = listed({
  id: 'o1004',
  number: 1004,
  status: 'ASSIGNED',
  driver: { ...delivery().driver!, id: 'd-karim', name: 'Karim Diallo', phone: '+22673000002', lastLocation: { lat: 12.373, lng: -1.5177, at: '2026-11-09T12:01:55.000Z', heading: 230 } },
  etaMinutes: 29,
  createdAt: '2026-11-09T11:50:00.000Z',
});
const salif = listed({ id: 'o1005', number: 1005, status: 'SEARCHING_DRIVER', driver: null, recipientName: 'Salif Compaoré', etaMinutes: null, createdAt: '2026-11-09T12:00:00.000Z' });
const done = (id: string, name: string, deliveredAt: string, createdAt: string) =>
  listed({ id, status: 'DELIVERED', recipientName: name, deliveredAt, createdAt, driver: null });
const DELIVERED = [
  done('d-old', 'Hier Soir', '2026-11-08T22:10:00.000Z', '2026-11-08T21:50:00.000Z'),
  done('d-early', 'Pharmacie du Progrès', '2026-11-09T10:15:00.000Z', '2026-11-09T09:49:00.000Z'),
  done('d-late', 'Fatimata Sawadogo', '2026-11-09T11:24:00.000Z', '2026-11-09T11:03:00.000Z'),
];

function serve(active: OrderDto[]) {
  mockApi.listDeliveries.mockImplementation(async (p) => (p.status?.length === 1 && p.status[0] === 'DELIVERED' ? page(DELIVERED) : page(active)));
}

async function showDashboard() {
  const r = await render(wrap(<BusinessDeliveriesScreen />));
  await act(async () => jest.advanceTimersByTimeAsync(0));
  return r;
}

describe('Tableau de bord de l’entreprise (ordinateur, 1 440 × 900)', () => {
  let dims: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    jest.clearAllMocks();
    dims = jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ width: 1440, height: 900, scale: 2, fontScale: 1 });
    mockBusiness.store = businessStore({ name: 'Le Verdoyant' });
    mockBusiness.stores = [businessStore({ name: 'Le Verdoyant' })];
    mockApi.request.mockImplementation(async (_m, path) => (path === '/business/summary' ? SUMMARY : null));
    mockApi.getOrder.mockRejectedValue(new Error('réseau'));
  });
  afterEach(() => {
    dims.mockRestore();
    jest.useRealTimers();
  });

  it('« Vue d’ensemble », date en direct, chiffres du jour (résumé) et la livraison suivie en tuile cobalt', async () => {
    serve([salif, awa, mariam]);
    const r = await showDashboard();
    expect(r.getByTestId('business-dashboard')).toBeTruthy();
    expect(r.getByRole('header', { name: 'Vue d’ensemble' })).toBeTruthy();
    expect(r.getByLabelText('En direct, lundi 9 novembre, 12:02')).toBeTruthy();
    expect(mockApi.request).toHaveBeenCalledWith('GET', '/business/summary');
    expect(r.getByTestId('kpi-delivered')).toHaveTextContent('14Livrées aujourd’hui');
    expect(r.getByTestId('kpi-delay')).toHaveTextContent('24 minDélai moyen');
    // Chiffre du jour (le reversement n'est pas suivi) : jamais « à reverser ».
    expect(r.getByTestId('kpi-cash')).toHaveTextContent(/^21\s400 FCFA de frais87\s500 FCFAEncaissé pour vous aujourd’hui$/);
    expect(r.getByTestId('kpi-cash')).not.toHaveTextContent(/reverser/i);
    // Par défaut, la première livraison dont le colis est en route.
    const hero = r.getByTestId('hero-tile');
    expect(hero).toHaveTextContent(/En livraison#1003SuiviArrivée12:09dans 7 minMariam peut suivre la course en directCode de livraison vérifié à la remise/);
    expect(hero).toHaveTextContent(/Demandée11:41Récupérée11:58En routemaintenantLivrée12:09/);
    expect(hero).toHaveTextContent(/Issouf S\.4,9 · Moto11 JJ 4521/);
    expect(within(hero).getByLabelText('Appeler Issouf S. (+22673000001)')).toBeTruthy();
    expect(hero).toHaveTextContent(/À encaisser9\s800\sFCFAmarchandise\s8\s200 \+\sfrais\s1\s600à payer par le destinataire/);
    // Carte : toutes les livraisons ; pastille « 3 en cours | 1 en recherche ».
    expect(r.getByTestId('map-summary')).toHaveTextContent('3 en cours1 en recherche');
    // L'entreprise une fois, puis par livraison triée : colis en route (destinataire, livreur), livreur vers le retrait
    // (son retrait est l'entreprise), recherche ; tracés : sans itinéraire chargé, pointillés ; étape à venir en encre.
    expect(r.getByTestId('live-map').props.children).toBe('pickup,dropoff,driver,dropoff,driver,dropoff|dashed,dashed,pending,dashed');
    // Pas de barre d'onglets ni de faux liens : la recherche est vraie, pas de cloche.
    expect(r.queryByLabelText('Notifications')).toBeNull();
  });

  it('choisir une ligne « En cours » : la tuile héros et la carte la suivent ; « Suivi » ouvre le détail', async () => {
    serve([salif, awa, mariam]);
    const r = await showDashboard();
    const fitAll = r.getByTestId('live-map-fit').props.children as string;
    await fireEvent.press(r.getByTestId('live-row-o1004'));
    expect(r.getByTestId('hero-tile')).toHaveTextContent(/Livreur en route#1004/);
    expect(r.getByTestId('hero-tile')).toHaveTextContent(/Livraison prévue vers/);
    expect(r.getByTestId('live-row-o1004').props.accessibilityState).toMatchObject({ selected: true });
    // Caméra : le livreur de cette livraison et l'entreprise (plus toutes les épingles).
    const fit = r.getByTestId('live-map-fit').props.children as string;
    expect(fit).not.toBe(fitAll);
    expect(fit.startsWith('12.373,-1.5177')).toBe(true);
    await fireEvent.press(r.getByTestId('hero-open'));
    expect(mockPush).toHaveBeenCalledWith('/business/livraison/o1004');
    // Un second clic sur la ligne choisie, ou sa flèche, ouvre aussi le suivi.
    mockPush.mockClear();
    await fireEvent.press(r.getByTestId('live-row-o1004'));
    expect(mockPush).toHaveBeenCalledWith('/business/livraison/o1004');
    await fireEvent.press(r.getByTestId('live-open-o1003'));
    expect(mockPush).toHaveBeenLastCalledWith('/business/livraison/o1003');
    // « Recentrer » : toutes les livraisons de nouveau.
    await fireEvent.press(r.getByTestId('map-recenter'));
    expect(r.getByTestId('live-map-fit').props.children).toBe(fitAll);
  });

  it('recherche : par numéro ou par destinataire (sans accents), dans les livraisons en cours et du jour', async () => {
    serve([salif, awa, mariam]);
    const r = await showDashboard();
    await fireEvent.press(r.getByTestId('live-row-o1004'));
    await fireEvent.changeText(r.getByTestId('dashboard-search'), 'ouedraogo');
    expect(within(r.getByTestId('live-list')).queryByText('Awa Kaboré')).toBeNull();
    expect(within(r.getByTestId('live-list')).getByText('Mariam Ouédraogo')).toBeTruthy();
    // Compteur « trouvées / en cours », et la tuile héros suit la première livraison trouvée.
    expect(r.getByTestId('live-count')).toHaveTextContent('1 / 3');
    expect(r.getByTestId('hero-tile')).toHaveTextContent(/#1003/);
    expect(within(r.getByTestId('recent-list')).getByText('Aucune livraison du jour ne correspond à « ouedraogo ».')).toBeTruthy();
    await fireEvent.changeText(r.getByTestId('dashboard-search'), '#1005');
    expect(within(r.getByTestId('live-list')).getByText('Salif Compaoré')).toBeTruthy();
    expect(within(r.getByTestId('live-list')).queryByText('Mariam Ouédraogo')).toBeNull();
    await fireEvent.changeText(r.getByTestId('dashboard-search'), 'zzz');
    expect(r.getByText('Aucune livraison en cours ne correspond à « zzz ».')).toBeTruthy();
    expect(r.getByTestId('live-count')).toHaveTextContent('0 / 3');
  });

  it('« Dernières livraisons » : livrées aujourd’hui seulement, la plus récente en premier ; « › » ouvre l’historique', async () => {
    serve([mariam]);
    const r = await showDashboard();
    const recent = r.getByTestId('recent-list');
    const rows = within(recent).getAllByTestId(/^recent-/).filter((e) => e.props.testID !== 'recent-see-all' && e.props.testID !== 'recent-list');
    expect(rows.map((e) => e.props.testID)).toEqual(['recent-d-late', 'recent-d-early']);
    expect(r.getByTestId('recent-d-late')).toHaveTextContent(/Fatimata Sawadogo11:24.*21 min/);
    await fireEvent.press(r.getByTestId('recent-d-late'));
    expect(mockPush).toHaveBeenCalledWith('/business/livraison/d-late');
    // « › » : un vrai lien (web : `<a href>`, que le clavier ouvre avec Entrée).
    expect(r.getByTestId('recent-see-all').props.accessibilityRole).toBe('link');
    expect(r.getByTestId('recent-see-all').props.href).toBe('/business/history');
    await fireEvent.press(r.getByTestId('recent-see-all'));
    expect(mockNavigate).toHaveBeenCalledWith('/business/history');
  });

  it('rien en cours : tuile d’accueil (un seul « Nouvelle livraison », en haut) ; la carte montre le quartier de l’entreprise', async () => {
    serve([]);
    const r = await showDashboard();
    expect(r.getByTestId('no-active-delivery')).toHaveTextContent(/Aucune livraison en cours.*Demandez un livreur/);
    expect(r.getAllByTestId('new-delivery').length).toBe(1);
    expect(r.getAllByText('Aucune livraison en cours')).toHaveLength(1);
    expect(r.getByTestId('live-list')).toHaveTextContent(/Les livraisons demandées s’afficheront ici/);
    expect(r.queryByTestId('map-summary')).toBeNull();
    const box = (r.getByTestId('live-map-fit').props.children as string).split(';').map((p) => p.split(',').map(Number));
    // Carré d'environ 2 km autour de l'entreprise (12,3686 ; -1,5275), pas son seul marqueur au zoom maximal.
    expect(box).toHaveLength(2);
    expect(box[0]![0]).toBeCloseTo(12.3776, 4);
    expect(box[1]![1]).toBeCloseTo(-1.5185, 4);
    await fireEvent.press(r.getAllByTestId('new-delivery')[0]!);
    expect(mockPush).toHaveBeenCalledWith('/business/nouvelle');
  });

  it('premier chargement : tuile « Chargement », jamais « Aucune livraison en cours » ni sa « Nouvelle livraison » en double', async () => {
    mockApi.listDeliveries.mockReturnValue(new Promise(() => undefined));
    mockApi.request.mockReturnValue(new Promise(() => undefined));
    const r = await showDashboard();
    expect(r.getByTestId('hero-loading')).toHaveTextContent('Chargement des livraisons en cours…');
    expect(r.queryByTestId('no-active-delivery')).toBeNull();
    expect(r.getByTestId('live-list')).toHaveTextContent(/^En coursChargement…$/);
    expect(r.getByTestId('kpi-cash')).toHaveTextContent(/^…Encaissé pour vous aujourd’hui$/);
  });

  it('liste illisible (rien d’affiché avant) : « Livraisons indisponibles » et « Réessayer » ; résumé en échec : « — »', async () => {
    mockApi.request.mockRejectedValue(new Error('réseau'));
    mockApi.listDeliveries.mockRejectedValueOnce(new Error('Service indisponible'));
    mockApi.listDeliveries.mockRejectedValueOnce(new Error('Service indisponible'));
    const r = await showDashboard();
    expect(r.getByTestId('hero-error')).toHaveTextContent(/Livraisons indisponibles/);
    expect(r.queryByTestId('no-active-delivery')).toBeNull();
    expect(r.getByTestId('live-list')).toHaveTextContent(/Livraisons indisponibles pour le moment/);
    expect(r.getByTestId('kpi-delivered')).toHaveTextContent('—Livrées aujourd’hui');
    expect(r.getByLabelText('Encaissé pour vous aujourd’hui\u202f: indisponible')).toBeTruthy();
    serve([mariam]);
    await fireEvent.press(r.getByTestId('hero-retry'));
    await act(async () => jest.advanceTimersByTimeAsync(0));
    expect(r.queryByTestId('hero-error')).toBeNull();
    expect(r.getByTestId('hero-tile')).toHaveTextContent(/#1003/);
  });

  it('recherche d’un livreur suivie : l’état en grand, l’heure de la demande en petit (pas une heure géante)', async () => {
    serve([salif]);
    const r = await showDashboard();
    const hero = r.getByTestId('hero-tile');
    expect(within(hero).getByTestId('hero-tile-state')).toHaveTextContent('Recherche d’un livreur…');
    expect(hero).toHaveTextContent(/^Recherche#1005SuiviDemandée à 12:00 · il y a 2 min/);
  });

  it('pas d’entreprise : « Dernières livraisons » ne reste pas sur « Chargement… »', async () => {
    mockBusiness.store = null;
    mockBusiness.stores = [];
    serve([]);
    const r = await showDashboard();
    expect(r.getByTestId('recent-list')).not.toHaveTextContent(/Chargement/);
    expect(r.getByTestId('recent-list')).toHaveTextContent(/Pas encore de livraison livrée aujourd’hui/);
  });

  it('entreprise en attente de validation : bandeau et « Nouvelle livraison » grisée qui explique pourquoi', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockBusiness.store = businessStore({ approvalStatus: 'PENDING' });
    serve([]);
    const r = await showDashboard();
    expect(r.getByText('Entreprise en attente de validation')).toBeTruthy();
    expect(r.queryByTestId('new-delivery')).toBeNull();
    await fireEvent.press(r.getByTestId('new-delivery-unavailable'));
    expect(alert).toHaveBeenCalledWith('Entreprise en attente de validation', expect.any(String));
    expect(mockPush).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});

describe('Barre latérale et cadre de l’ordinateur', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/business';
    mockBusiness.store = businessStore({ name: 'Le Verdoyant' });
    mockBusiness.stores = [businessStore({ name: 'Le Verdoyant' })];
    mockApi.request.mockImplementation(async () => SUMMARY);
  });

  it('entrée active d’après l’adresse (le détail et la demande dépendent du tableau de bord)', () => {
    expect(activeNav('/business')).toBe('overview');
    expect(activeNav('/business/')).toBe('overview');
    expect(activeNav('/business/livraison/o1003')).toBe('overview');
    expect(activeNav('/business/history')).toBe('history');
    expect(activeNav('/business/profile')).toBe('stores');
    expect(activeNav('/business/nouvelle')).toBe('overview');
    expect(activeNav('/driver')).toBeNull();
  });

  it('destinations réelles seulement, nombre de livraisons en cours, carte de l’entreprise vers son profil', async () => {
    mockPathname = '/business/history';
    const r = await render(wrap(<Sidebar />));
    await act(async () => undefined);
    const links = r.getAllByRole('link').map((e) => e.props.accessibilityLabel);
    expect(links).toEqual(['Yaar Livraison, vue d’ensemble', 'Vue d’ensemble, 3 livraisons en cours', 'Historique', 'Établissements']);
    // De vrais liens (web : `<a href>`, ouverts au clavier par Entrée) vers des pages qui existent.
    expect(r.getAllByRole('link').map((e) => e.props.href)).toEqual(['/business', '/business', '/business/history', '/business/profile']);
    // Hors du tableau de bord, la barre latérale relit elle-même le résumé (badge à jour).
    expect(mockApi.request).toHaveBeenCalledWith('GET', '/business/summary');
    expect(r.getByTestId('nav-history').props.accessibilityState).toMatchObject({ selected: true });
    expect(r.getByTestId('nav-overview').props.accessibilityState).toMatchObject({ selected: false });
    await fireEvent.press(r.getByTestId('nav-stores'));
    expect(mockNavigate).toHaveBeenCalledWith('/business/profile');
    expect(r.getByTestId('sidebar-business')).toHaveTextContent('LVLe VerdoyantAïcha T.');
    await fireEvent.press(r.getByTestId('sidebar-business'));
    expect(mockNavigate).toHaveBeenLastCalledWith('/business/profile');
  });

  it('plusieurs établissements : la carte de l’entreprise ouvre le choix de l’établissement', async () => {
    const second = businessStore({ id: 'store-2', name: 'Le Verdoyant Ouaga 2000' });
    mockBusiness.stores = [businessStore({ name: 'Le Verdoyant' }), second];
    const r = await render(wrap(<Sidebar />));
    expect(r.getByTestId('sidebar-business')).toHaveTextContent(/Aïcha T\. · 2 établissements$/);
    await fireEvent.press(r.getByTestId('sidebar-business'));
    const menu = r.getByTestId('store-switcher');
    // Le choix porte sur le point de retrait des nouvelles livraisons, pas sur un filtre du tableau de bord.
    expect(menu).toHaveTextContent(/^Point de retrait des nouvelles livraisonsLe tableau de bord montre les livraisons de tous vos établissements\./);
    await fireEvent.press(within(menu).getByText('Le Verdoyant Ouaga 2000'));
    expect(mockBusiness.selectStore).toHaveBeenCalledWith('store-2');
  });

  it('cadre : barre latérale sur ordinateur seulement', async () => {
    const desk = await render(wrap(<BusinessFrame desktop>{null}</BusinessFrame>));
    expect(desk.getByTestId('business-sidebar')).toBeTruthy();
    const phone = await render(wrap(<BusinessFrame desktop={false}>{null}</BusinessFrame>));
    expect(phone.queryByTestId('business-sidebar')).toBeNull();
  });
});

describe('Itinéraire de la livraison choisie', () => {
  it('le détail fournit l’itinéraire (la liste n’en a pas) : utilisé par la carte du tableau de bord', async () => {
    jest.useFakeTimers({ now: NOW });
    const dims = jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ width: 1440, height: 900, scale: 2, fontScale: 1 });
    mockBusiness.store = businessStore({ name: 'Le Verdoyant' });
    mockBusiness.stores = [businessStore({ name: 'Le Verdoyant' })];
    mockApi.request.mockImplementation(async () => SUMMARY);
    serve([mariam]);
    mockApi.getOrder.mockResolvedValue({ ...mariam, route: route() });
    const r = await showDashboard();
    expect(r.getByTestId('live-map').props.children).toBe('pickup,dropoff,driver|route');
    dims.mockRestore();
    jest.useRealTimers();
  });
});
