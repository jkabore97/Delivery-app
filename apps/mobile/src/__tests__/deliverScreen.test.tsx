import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ApiError } from '../lib/api';
import DeliverScreen from '../app/driver/deliver';
import { delivery, driverProfile, order } from './fixtures';

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

  it('bon code : livraison confirmée, course terminée, gain et gains du jour, notation', async () => {
    mockApi.deliverOrder.mockResolvedValue(order({ status: 'DELIVERED', cashCollected: 4500, driverEarning: 1200 }));
    const r = await render(<DeliverScreen />);
    await waitFor(() => expect(r.getByText('Gains du jour · 9 courses')).toBeTruthy());
    await act(async () => fireEvent.changeText(r.getByTestId('delivery-code-input'), '4821'));
    await act(async () => fireEvent.press(r.getByTestId('deliver-button')));
    await waitFor(() => expect(r.getByTestId('delivery-success')).toBeTruthy());
    expect(r.getByText('Livraison confirmée')).toBeTruthy();
    expect(r.getByText('+1\u202f200\u202fFCFA')).toBeTruthy();
    expect(r.getByText('Gains du jour · 9 courses')).toBeTruthy();
    expect(r.getByText('Notez le client')).toBeTruthy();
    expect(mockDriver.setCurrentOrder).toHaveBeenCalledWith(null);
    expect(mockDriver.refreshProfile).toHaveBeenCalled();
  });

  it('après la livraison : la note est envoyée, puis remerciement', async () => {
    mockApi.deliverOrder.mockResolvedValue(order({ status: 'DELIVERED', cashCollected: 4500 }));
    mockApi.rateOrder.mockResolvedValue(undefined);
    const r = await render(<DeliverScreen />);
    await act(async () => fireEvent.changeText(r.getByTestId('delivery-code-input'), '4821'));
    await act(async () => fireEvent.press(r.getByTestId('deliver-button')));
    await waitFor(() => expect(r.getByTestId('rating-submit')).toBeTruthy());
    await act(async () => fireEvent.press(r.getByTestId('rating-submit')));
    await waitFor(() => expect(r.getByText('Merci pour votre note.')).toBeTruthy());
    expect(mockApi.rateOrder).toHaveBeenCalledWith('order-1', { score: 5 });
  });

  it('livraison d’entreprise : montant à encaisser (marchandise + frais payés par le destinataire) avant le code', async () => {
    mockDriver.currentOrder = delivery({ feePaidBy: 'RECIPIENT', cashToCollect: 15000, deliveryFee: 1500 });
    const r = await render(<DeliverScreen />);
    // Montant d'abord, en très grand, puis son détail.
    expect(r.getByTestId('amount-to-collect')).toHaveTextContent(
      /1\. Encaissez auprès de Awa Kaboré.*16 500 FCFA.*Marchandise 15 000 FCFA \+ frais de livraison 1 500 FCFA, en espèces\./,
    );
    expect(r.getByTestId('amount-to-collect-value')).toHaveTextContent('16\u202f500\u202fFCFA');
    expect(r.getByText('2. Demandez le code au destinataire')).toBeTruthy();
    // Solde après la course : 10 000 détenus + 16 500 encaissés (même libellé que l'accueil : « Espèces détenues »).
    expect(r.getByText('Espèces détenues après cette course')).toBeTruthy();
    expect(r.getByText('26\u202f500 FCFA')).toBeTruthy();
  });

  it('frais payés par l’entreprise et rien à encaisser : le livreur le sait avant le code', async () => {
    mockDriver.currentOrder = delivery({ feePaidBy: 'SENDER', cashToCollect: 0 });
    const r = await render(<DeliverScreen />);
    expect(r.queryByTestId('amount-to-collect')).toBeNull();
    expect(r.getByText('Rien à encaisser : la livraison est déjà payée.')).toBeTruthy();
    expect(r.getByText('Demandez le code au destinataire')).toBeTruthy();
  });

  it('ancienne commande client : le total en espèces', async () => {
    const r = await render(<DeliverScreen />);
    expect(r.getByTestId('amount-to-collect')).toHaveTextContent(/Encaissez.*4 500 FCFA.*Total de la commande, en espèces\./);
  });

  it('pas de course récupérée : rien à livrer', async () => {
    mockDriver.currentOrder = order({ status: 'ASSIGNED' });
    const r = await render(<DeliverScreen />);
    expect(r.getByText('Aucune course à livrer.')).toBeTruthy();
  });
});
