import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ApiError } from '../lib/api';
import DeliverScreen from '../app/driver/deliver';
import { driverProfile, order } from './fixtures';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), dismissTo: jest.fn() } }));
jest.mock('../lib/photo', () => ({ capturePhoto: jest.fn(async () => null) }));

const mockApi = {
  deliverOrder: jest.fn(),
  driverEarnings: jest.fn(async () => ({
    today: { deliveries: 9, earnings: 11500, cashCollected: 32000 },
    allTime: { deliveries: 120, earnings: 150000 },
    cashHeld: 32000,
    cashLimit: 50000,
    cashBlocked: false,
    recentLedger: [],
  })),
  rateOrder: jest.fn(),
};
jest.mock('../state/auth', () => ({ useApi: () => mockApi }));

const mockDriver = {
  currentOrder: order({ status: 'PICKED_UP' }) as ReturnType<typeof order> | null,
  profile: driverProfile({ isOnline: true, cashHeld: 10000 }),
  setCurrentOrder: jest.fn(),
  refreshProfile: jest.fn(async () => undefined),
};
jest.mock('../state/driver', () => ({ useDriver: () => mockDriver }));

describe('DeliverScreen (confirmer la livraison)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDriver.currentOrder = order({ status: 'PICKED_UP' });
  });

  it('bouton désactivé tant que les 4 chiffres ne sont pas saisis ; chiffres seulement', async () => {
    const r = await render(<DeliverScreen />);
    const input = r.getByTestId('delivery-code-input');
    await act(async () => fireEvent.changeText(input, '4a2'));
    expect(r.getByTestId('delivery-code-input').props.value).toBe('42');
    await act(async () => fireEvent.press(r.getByTestId('deliver-button')));
    expect(mockApi.deliverOrder).not.toHaveBeenCalled();
  });

  it('code faux : message et saisie remise à zéro', async () => {
    mockApi.deliverOrder.mockRejectedValue(new ApiError(400, 'DELIVERY_CODE_INVALID', 'Code incorrect (4 essais restants).'));
    const r = await render(<DeliverScreen />);
    await act(async () => fireEvent.changeText(r.getByTestId('delivery-code-input'), '1234'));
    await act(async () => fireEvent.press(r.getByTestId('deliver-button')));
    await waitFor(() => expect(r.getByText('Code incorrect (4 essais restants).')).toBeTruthy());
    expect(mockApi.deliverOrder).toHaveBeenCalledWith('order-1', { code: '1234' });
    expect(r.getByTestId('delivery-code-input').props.value).toBe('');
    expect(mockDriver.setCurrentOrder).not.toHaveBeenCalled();
  });

  it('bon code : livraison confirmée, course terminée, gains du jour', async () => {
    mockApi.deliverOrder.mockResolvedValue(order({ status: 'DELIVERED', cashCollected: 4500 }));
    const r = await render(<DeliverScreen />);
    await waitFor(() => expect(r.getByText('Gains du jour · 9 courses')).toBeTruthy());
    await act(async () => fireEvent.changeText(r.getByTestId('delivery-code-input'), '4821'));
    await act(async () => fireEvent.press(r.getByTestId('deliver-button')));
    await waitFor(() => expect(r.getByText('Livraison confirmée ✅')).toBeTruthy());
    expect(mockDriver.setCurrentOrder).toHaveBeenCalledWith(null);
    expect(mockDriver.refreshProfile).toHaveBeenCalled();
  });

  it('pas de course récupérée : rien à livrer', async () => {
    mockDriver.currentOrder = order({ status: 'ASSIGNED' });
    const r = await render(<DeliverScreen />);
    expect(r.getByText('Aucune course à livrer.')).toBeTruthy();
  });
});
