import type { ReactElement } from 'react';
import { Alert, Linking, Share } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { OrderDto } from '@yaar/shared';
import BusinessDeliveryScreen from '../app/business/livraison/[id]';
import { businessStore, delivery, route } from './fixtures';

const mockParams: { id: string; created?: string } = { id: 'del-1' };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
const mockApi = { getOrder: jest.fn<Promise<OrderDto>, [string]>(), cancelOrder: jest.fn(), rateOrder: jest.fn(), disputeOrder: jest.fn() };
jest.mock('../state/auth', () => ({ useApi: () => mockApi }));
const mockBusiness = { store: businessStore() };
jest.mock('../state/business', () => ({ useBusiness: () => mockBusiness }));
jest.mock('../state/socket', () => ({
  useOrderRoom: () => undefined,
  usePolling: () => undefined,
  useSocketEvent: () => undefined,
  useSocket: () => ({ pollIntervalMs: 4000 }),
}));
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

describe('Suivi d’une livraison par l’entreprise', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams.created = undefined;
  });
  afterEach(() => jest.restoreAllMocks());

  it('livreur en route vers l’entreprise : carte, livreur, destinataire ; jamais le code de livraison', async () => {
    // Même si un code arrivait par erreur dans la réponse, l'entreprise ne doit pas le voir.
    mockApi.getOrder.mockResolvedValue(
      delivery({ status: 'ASSIGNED', deliveryCode: '1234', route: route({ target: 'PICKUP', points: [[12.3627, -1.521], [12.3686, -1.5275]] }) }),
    );
    const r = await render(wrap(<BusinessDeliveryScreen />));
    await waitFor(() => expect(r.getByText('Le livreur arrive pour le retrait')).toBeTruthy());
    expect(mockApi.getOrder).toHaveBeenCalledWith('del-1');
    expect(r.getByTestId('live-map').props.children).toBe('pickup,dropoff,driver|route,pending');
    expect(r.getByTestId('driver-card')).toHaveTextContent(/Issouf Sawadogo/);
    expect(r.getByTestId('recipient-card')).toHaveTextContent(/Awa Kaboré.*70 11 22 33/);
    expect(r.queryByText('1234')).toBeNull();
    expect(r.queryByText(/1\s+2\s+3\s+4/)).toBeNull();
    expect(r.queryByTestId('delivery-code')).toBeNull();
    expect(r.getByTestId('recipient-amount')).toHaveTextContent(/Le destinataire paie à la livraison.*16 500 FCFA/);
    // Titre : arrivée du livreur AU RETRAIT (itinéraire restant vers l'entreprise), livraison rappelée en dessous.
    expect(r.getByLabelText(/^Au retrait vers \d\d:\d\d · dans \d+ min$/)).toBeTruthy();
    expect(r.getByTestId('eta-secondary')).toHaveTextContent(/^Livraison chez Awa prévue vers \d\d:\d\d$/);
  });

  it('livreur en route vers l’entreprise : arrivée au retrait d’après l’itinéraire restant, pas l’heure de livraison', async () => {
    jest.useFakeTimers({ now: Date.parse('2026-11-08T14:20:00.000Z') });
    // Itinéraire de 2 km / 4 min vers le retrait ; le livreur est au début : ~4 min. L'API annonce 25 min (livraison).
    mockApi.getOrder.mockResolvedValue(
      delivery({
        status: 'ASSIGNED',
        etaMinutes: 25,
        driver: { ...delivery().driver!, lastLocation: { lat: 12.3627, lng: -1.521, at: '2026-11-08T14:19:55.000Z', heading: 170 } },
        route: route({ target: 'PICKUP', distanceM: 2000, durationS: 240, points: [[12.3627, -1.521], [12.3686, -1.5275]] }),
      }),
    );
    const r = await render(wrap(<BusinessDeliveryScreen />));
    await act(async () => jest.advanceTimersByTimeAsync(0));
    expect(r.getByLabelText('Au retrait vers 14:24 · dans 4 min')).toBeTruthy();
    expect(r.getByTestId('eta-secondary')).toHaveTextContent('Livraison chez Awa prévue vers 14:45');
    jest.useRealTimers();
  });

  it('destinataire entreprise : son nom complet dans les textes (pas « Bureau »)', async () => {
    mockParams.created = '1';
    mockApi.getOrder.mockResolvedValue(
      delivery({ status: 'SEARCHING_DRIVER', driver: null, route: null, recipientName: 'Bureau Faso Conseil', recipientIsBusiness: true }),
    );
    const r = await render(wrap(<BusinessDeliveryScreen />));
    await waitFor(() => expect(r.getByTestId('share-tracking')).toBeTruthy());
    expect(r.getByTestId('share-tracking')).toHaveTextContent(/Bureau Faso Conseil suivra le livreur/);
  });

  it('juste après la demande : « Envoyer le lien de suivi au destinataire » mis en avant (feuille de partage)', async () => {
    mockParams.created = '1';
    mockApi.getOrder.mockResolvedValue(delivery({ status: 'SEARCHING_DRIVER', driver: null, route: null }));
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    const r = await render(wrap(<BusinessDeliveryScreen />));
    await waitFor(() => expect(r.getByText('Prévenez le destinataire')).toBeTruthy());
    expect(r.getByTestId('tracking-url')).toHaveTextContent('yaar-livraison.vercel.app/suivi/tok-abc');
    // La carte est l'action de l'écran : pas de boutons ronds qui la doubleraient tant qu'aucun livreur n'est en route.
    expect(r.queryByTestId('share-round-button')).toBeNull();
    await fireEvent.press(r.getByTestId('share-link-button'));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('https://yaar-livraison.vercel.app/suivi/tok-abc') }));
    expect(r.getByText('Lien envoyé.')).toBeTruthy();
  });

  it('annulation possible avant le retrait seulement', async () => {
    mockApi.getOrder.mockResolvedValue(delivery({ status: 'ASSIGNED' }));
    mockApi.cancelOrder.mockResolvedValue(delivery({ status: 'CANCELLED', cancelReason: 'Annulée par l’entreprise', driver: null }));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const r = await render(wrap(<BusinessDeliveryScreen />));
    await waitFor(() => expect(r.getByTestId('cancel-delivery')).toBeTruthy());
    await fireEvent.press(r.getByTestId('cancel-delivery'));
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    await act(async () => buttons.find((b) => b.style === 'destructive')?.onPress?.());
    await waitFor(() => expect(r.getByText('Livraison annulée')).toBeTruthy());
    expect(mockApi.cancelOrder).toHaveBeenCalledWith('del-1', 'Annulée par l’entreprise');
    expect(r.queryByTestId('cancel-delivery')).toBeNull();
  });

  it('boutons ronds : partager le lien, WhatsApp au destinataire (lien prérempli), appeler le livreur', async () => {
    mockApi.getOrder.mockResolvedValue(delivery());
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const r = await render(wrap(<BusinessDeliveryScreen />));
    await waitFor(() => expect(r.getByTestId('share-round-button')).toBeTruthy());
    // Itinéraire jusqu'au destinataire, épinglé à ses initiales ; l'entreprise garde son pictogramme.
    expect(r.getByTestId('live-map-initials').props.children).toBe('AK,-');
    await fireEvent.press(r.getByTestId('share-round-button'));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('https://yaar-livraison.vercel.app/suivi/tok-abc') }));
    expect(r.getByText('Lien envoyé.')).toBeTruthy();
    await fireEvent.press(r.getByTestId('whatsapp-recipient'));
    const text =
      'Bonjour Awa, Pharmacie du Centre vous envoie un colis avec Yaar Livraison. Suivez votre livreur en direct (le code à lui donner s’affiche sur la page) : https://yaar-livraison.vercel.app/suivi/tok-abc';
    expect(open).toHaveBeenCalledWith(`https://wa.me/22670112233?text=${encodeURIComponent(text)}`);
    await fireEvent.press(r.getByTestId('call-driver'));
    expect(open).toHaveBeenLastCalledWith('tel:+22673000001');
    // Montants : ce que paie le destinataire, ce qui revient à l'entreprise (marchandise).
    expect(r.getByTestId('recipient-amount-value')).toHaveTextContent('16 500 FCFA');
    expect(r.getByTestId('business-amount')).toHaveTextContent(/Pour votre entreprise.*15 000 FCFA/);
    expect(r.getByTestId('recipient-card')).toHaveTextContent(/Colis pour.*Awa Kaboré.*Patte d’Oie, rue 15\.23.*Repère : Station Total.*2 boîtes de médicaments/);
    share.mockRestore();
    open.mockRestore();
  });

  it('recherche d’un livreur : pas encore de livreur à appeler ; livrée : plus de boutons ronds', async () => {
    mockApi.getOrder.mockResolvedValue(delivery({ status: 'SEARCHING_DRIVER', driver: null, route: null }));
    const r = await render(wrap(<BusinessDeliveryScreen />));
    await waitFor(() => expect(r.getByTestId('share-round-button')).toBeTruthy());
    expect(r.getByTestId('whatsapp-recipient')).toBeTruthy();
    expect(r.queryByTestId('call-driver')).toBeNull();
    mockApi.getOrder.mockResolvedValue(delivery({ status: 'DELIVERED', driver: null, route: null, deliveredAt: '2026-11-08T14:51:00.000Z' }));
    const done = await render(wrap(<BusinessDeliveryScreen />));
    await waitFor(() => expect(done.getByText('Livrée à Awa Kaboré')).toBeTruthy());
    expect(done.queryByTestId('share-round-button')).toBeNull();
    expect(done.getByTestId('recipient-amount')).toHaveTextContent(/Encaissé auprès du destinataire/);
    // Le reversement par Yaar n'est pas suivi : « à reverser », jamais « reversé ».
    expect(done.getByTestId('business-amount')).toHaveTextContent(/^À reverser à votre entreprise/);
    expect(done.getByTestId('delivery-fee')).toHaveTextContent(/Payés par le destinataire à la livraison/);
  });

  it('phrases d’argent vraies à chaque étape : « à payer » avant le retrait, « payés » après ; annulée : aucuns frais', async () => {
    mockApi.getOrder.mockResolvedValue(delivery({ status: 'ASSIGNED', feePaidBy: 'SENDER', cashToCollect: 0, deliveryFee: 2300 }));
    const before = await render(wrap(<BusinessDeliveryScreen />));
    await waitFor(() => expect(before.getByTestId('delivery-fee')).toBeTruthy());
    expect(before.getByTestId('delivery-fee')).toHaveTextContent(/À payer par l’entreprise au retrait du colis/);
    expect(before.getByTestId('pickup-amount')).toHaveTextContent(/À payer au livreur au retrait/);
    await before.unmount();
    mockApi.getOrder.mockResolvedValue(delivery({ feePaidBy: 'SENDER', cashToCollect: 0, deliveryFee: 2300 }));
    const after = await render(wrap(<BusinessDeliveryScreen />));
    await waitFor(() => expect(after.getByTestId('delivery-fee')).toBeTruthy());
    expect(after.getByTestId('delivery-fee')).toHaveTextContent(/Payés par l’entreprise au retrait du colis/);
    await after.unmount();
    mockApi.getOrder.mockResolvedValue(
      delivery({ status: 'CANCELLED', feePaidBy: 'SENDER', cashToCollect: 15000, deliveryFee: 2300, driver: null, route: null, cancelReason: 'Annulée par l’entreprise' }),
    );
    const cancelled = await render(wrap(<BusinessDeliveryScreen />));
    await waitFor(() => expect(cancelled.getByText('Livraison annulée')).toBeTruthy());
    expect(cancelled.getByTestId('delivery-fee')).toHaveTextContent(/Aucuns frais à payer/);
    expect(cancelled.getByTestId('delivery-fee')).not.toHaveTextContent(/Payés|À payer/);
    expect(cancelled.queryByTestId('business-amount')).toBeNull();
    expect(cancelled.queryByTestId('recipient-amount')).toBeNull();
  });

  it('pied de page : « WhatsApp client » (le destinataire nommé pour les lecteurs d’écran) à côté de « Appeler le livreur »', async () => {
    mockApi.getOrder.mockResolvedValue(delivery());
    const r = await render(wrap(<BusinessDeliveryScreen />));
    await waitFor(() => expect(r.getByTestId('whatsapp-recipient')).toBeTruthy());
    expect(r.getByTestId('whatsapp-recipient')).toHaveTextContent('WhatsApp client');
    expect(r.getByTestId('whatsapp-recipient').props.accessibilityLabel).toBe('Écrire à Awa Kaboré sur WhatsApp (+22670112233)');
    expect(r.getByTestId('call-driver')).toHaveTextContent('Appeler le livreur');
  });

  it('partage : « Lien envoyé. » s’efface après 4 s ; échec : le lien s’affiche, sélectionnable', async () => {
    jest.useFakeTimers();
    mockApi.getOrder.mockResolvedValue(delivery());
    const share = jest.spyOn(Share, 'share').mockResolvedValueOnce({ action: Share.sharedAction, activityType: undefined });
    const r = await render(wrap(<BusinessDeliveryScreen />));
    await act(async () => jest.advanceTimersByTimeAsync(0));
    await fireEvent.press(r.getByTestId('share-round-button'));
    await act(async () => jest.advanceTimersByTimeAsync(0));
    expect(r.getByTestId('share-feedback')).toHaveTextContent('Lien envoyé.');
    await act(async () => jest.advanceTimersByTimeAsync(4000));
    expect(r.queryByTestId('share-feedback')).toBeNull();
    share.mockRejectedValueOnce(new Error('indisponible'));
    await fireEvent.press(r.getByTestId('share-round-button'));
    await act(async () => jest.advanceTimersByTimeAsync(0));
    expect(r.getByTestId('share-feedback')).toHaveTextContent('Partage impossible : copiez le lien ci-dessous.');
    expect(r.getByTestId('tracking-link')).toHaveTextContent('https://yaar-livraison.vercel.app/suivi/tok-abc');
    expect(r.getByTestId('tracking-link').props.selectable).toBe(true);
    // L'échec reste affiché (le lien est à copier).
    await act(async () => jest.advanceTimersByTimeAsync(10_000));
    expect(r.getByTestId('tracking-link')).toBeTruthy();
    jest.useRealTimers();
  });

  it('chargement en échec : « Réessayer » relance la lecture de la livraison', async () => {
    mockApi.getOrder.mockRejectedValueOnce(new Error('Connexion impossible'));
    mockApi.getOrder.mockResolvedValue(delivery());
    const r = await render(wrap(<BusinessDeliveryScreen />));
    await waitFor(() => expect(r.getByText('Connexion impossible')).toBeTruthy());
    await fireEvent.press(r.getByTestId('retry-order'));
    await waitFor(() => expect(r.getByText('En route vers Awa Kaboré')).toBeTruthy());
    expect(mockApi.getOrder).toHaveBeenCalledTimes(2);
  });

  it('colis récupéré : plus d’annulation', async () => {
    mockApi.getOrder.mockResolvedValue(delivery());
    const r = await render(wrap(<BusinessDeliveryScreen />));
    await waitFor(() => expect(r.getByText('En route vers Awa Kaboré')).toBeTruthy());
    expect(r.queryByTestId('cancel-delivery')).toBeNull();
    expect(r.getByTestId('live-map').props.children).toBe('dropoff,driver|route');
  });
});
