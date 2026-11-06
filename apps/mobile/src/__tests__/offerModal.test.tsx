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
    await waitFor(() => expect(r.getByText('Vous avez déjà une course.')).toBeTruthy());
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
