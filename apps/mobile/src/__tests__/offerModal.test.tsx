import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ApiError } from '../lib/api';
import { OfferModal } from '../components/OfferModal';
import { driverProfile, offer, order } from './fixtures';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

const mockApi = { acceptOffer: jest.fn(), rejectOffer: jest.fn(async () => undefined) };
jest.mock('../state/auth', () => ({ useApi: () => mockApi }));

const mockDriver = {
  offers: [offer()],
  profile: driverProfile({ isOnline: true }),
  currentOrder: null as ReturnType<typeof order> | null,
  removeOffer: jest.fn(),
  setCurrentOrder: jest.fn(),
  refreshProfile: jest.fn(async () => undefined),
};
jest.mock('../state/driver', () => ({ useDriver: () => mockDriver }));

const T0 = Date.parse('2026-11-06T09:43:00.000Z');

describe('OfferModal', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: T0 });
    jest.clearAllMocks();
    mockDriver.offers = [offer()];
    mockDriver.profile = driverProfile({ isOnline: true });
    mockDriver.currentOrder = null;
  });
  afterEach(() => jest.useRealTimers());

  it('affiche l’offre avec le compte à rebours et le gain', async () => {
    const r = await render(<OfferModal />);
    expect(r.getByText('Nouvelle course 🔔')).toBeTruthy();
    expect(r.getByText('0:30')).toBeTruthy();
    expect(r.getByText(/Maquis Le Verdoyant/)).toBeTruthy();
  });

  it('entreprise : nom et adresse du retrait, zone de livraison seulement (pas d’adresse du destinataire)', async () => {
    const r = await render(<OfferModal />);
    expect(r.getByText('Récupérer chez Maquis Le Verdoyant')).toBeTruthy();
    expect(r.getByText(/Avenue Kwame Nkrumah, centre-ville · Secteur Centre-ville/)).toBeTruthy();
    expect(r.getByText('Livrer : Secteur Patte d’Oie')).toBeTruthy();
    expect(r.getByText(/adresse exacte du destinataire s’affiche une fois la course acceptée/)).toBeTruthy();
  });

  it('livraison d’entreprise (colis) : entreprise, véhicule et montants', async () => {
    mockDriver.offers = [
      offer({
        orderType: 'PARCEL',
        vehicleType: 'MOTO',
        pickup: { address: 'Avenue de l’Université, Zogona', name: 'Pharmacie du Campus', distanceFromDriverKm: 1.2, zone: 'Secteur Zogona' },
        dropoff: { address: 'Secteur Patte d’Oie', zone: 'Secteur Patte d’Oie' },
        distanceKm: 5.4,
        cashToCollect: 16500,
        driverEarning: 1250,
      }),
    ];
    const r = await render(<OfferModal />);
    expect(r.getByText('Récupérer chez Pharmacie du Campus')).toBeTruthy();
    expect(r.getByText(/Avenue de l’Université, Zogona · Secteur Zogona/)).toBeTruthy();
    expect(r.getByTestId('offer-vehicle')).toHaveTextContent(/Moto · 5,4 km de course/);
    // Un seul format de montant (FCFA, espaces fines insécables) pour les espèces et le gain.
    expect(r.getByTestId('offer-cash')).toHaveTextContent(/16 500 FCFA/);
    expect(r.getByTestId('offer-earning')).toHaveTextContent(/1 250 FCFA/);
    expect(r.queryByTestId('offer-cash-split')).toBeNull(); // API sans détail retrait / livraison
  });

  it('détail des espèces de l’API : retrait (frais payés par l’entreprise) et livraison', async () => {
    mockDriver.offers = [offer({ cashToCollect: 9700, cashAtPickup: 1700, cashAtDelivery: 8000, driverEarning: 1280 })];
    const r = await render(<OfferModal />);
    expect(r.getByTestId('offer-cash')).toHaveTextContent(/9 700 FCFA/);
    expect(r.getByTestId('offer-cash-split')).toHaveTextContent('1\u202f700\u202fFCFA au retrait · 8\u202f000\u202fFCFA à la livraison');
    expect(r.getByTestId('offer-earning')).toHaveTextContent(/1 280 FCFA/);
  });

  it('colis : zones approximatives au retrait et à la livraison', async () => {
    mockDriver.offers = [
      offer({
        orderType: 'PARCEL',
        pickup: { address: 'Secteur Zogona', name: null, distanceFromDriverKm: 0.8, zone: 'Secteur Zogona' },
        dropoff: { address: 'Secteur Tampouy', zone: 'Secteur Tampouy' },
      }),
    ];
    const r = await render(<OfferModal />);
    expect(r.getByText('Récupérer : Secteur Zogona')).toBeTruthy();
    expect(r.getByText('à 0,8 km de vous')).toBeTruthy();
    expect(r.getByText('Livrer : Secteur Tampouy')).toBeTruthy();
  });

  it('hors ligne ou déjà en course : aucune offre affichée', async () => {
    mockDriver.profile = driverProfile({ isOnline: false });
    const r = await render(<OfferModal />);
    expect(r.queryByText('Nouvelle course 🔔')).toBeNull();
    mockDriver.profile = driverProfile({ isOnline: true });
    mockDriver.currentOrder = order();
    await r.rerender(<OfferModal />);
    expect(r.queryByText('Nouvelle course 🔔')).toBeNull();
  });

  it('accepter : enregistre la course et ouvre l’écran de course', async () => {
    mockApi.acceptOffer.mockResolvedValue(order());
    const r = await render(<OfferModal />);
    await act(async () => fireEvent.press(r.getByTestId('accept-offer')));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/driver/order'));
    expect(mockApi.acceptOffer).toHaveBeenCalledWith('offer-1');
    expect(mockDriver.setCurrentOrder).toHaveBeenCalledWith(expect.objectContaining({ id: 'order-1' }));
    expect(mockDriver.removeOffer).toHaveBeenCalledWith('offer-1');
  });

  it('OFFER_EXPIRED : l’offre est retirée sans navigation', async () => {
    mockApi.acceptOffer.mockRejectedValue(new ApiError(409, 'OFFER_EXPIRED', 'Offre expirée'));
    const r = await render(<OfferModal />);
    await act(async () => fireEvent.press(r.getByTestId('accept-offer')));
    await waitFor(() => expect(mockDriver.removeOffer).toHaveBeenCalledWith('offer-1'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('autre erreur : message affiché, offre conservée', async () => {
    mockApi.acceptOffer.mockRejectedValue(new ApiError(409, 'DRIVER_BUSY', 'Vous avez déjà une course.'));
    const r = await render(<OfferModal />);
    await act(async () => fireEvent.press(r.getByTestId('accept-offer')));
    await waitFor(() => expect(r.getByText('Vous avez une course en cours : terminez-la d’abord.')).toBeTruthy());
    expect(mockDriver.removeOffer).not.toHaveBeenCalled();
  });

  it('après 30 s : l’offre expire et disparaît', async () => {
    await render(<OfferModal />);
    await act(async () => {
      jest.advanceTimersByTime(31_000);
    });
    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
    expect(mockDriver.removeOffer).toHaveBeenCalledWith('offer-1');
  });
});
