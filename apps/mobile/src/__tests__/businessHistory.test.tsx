import { render, waitFor } from '@testing-library/react-native';
import type { OrderDto, Paginated } from '@yaar/shared';
import BusinessHistoryScreen from '../app/business/(tabs)/history';
import { delivery } from './fixtures';

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: jest.fn() },
    // Écran au premier plan : l'effet de focus s'exécute au montage.
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});
const mockApi = { listDeliveries: jest.fn<Promise<Paginated<OrderDto>>, [unknown]>() };
jest.mock('../state/auth', () => ({ useApi: () => mockApi }));

describe('Historique de l’entreprise', () => {
  it('montant encaissé identique au détail (marchandise + frais payés par le destinataire) et note exacte', async () => {
    const delivered = delivery({
      id: 'h-1',
      status: 'DELIVERED',
      feePaidBy: 'RECIPIENT',
      cashToCollect: 15000,
      deliveryFee: 1500,
      deliveredAt: '2026-11-08T14:51:00.000Z',
    });
    mockApi.listDeliveries.mockResolvedValue({ items: [delivered], total: 1, page: 1, pageSize: 20 });
    const r = await render(<BusinessHistoryScreen />);
    await waitFor(() => expect(r.getByTestId('history-collected-h-1')).toBeTruthy());
    // Détail de la livraison : « Encaissé auprès du destinataire 16 500 FCFA » (amountsToCollect) ; plus 15 000.
    expect(r.getByTestId('history-collected-h-1')).toHaveTextContent('Encaissé auprès du destinataire : 16 500 FCFA');
    expect(r.getByText(/Touchez une livraison pour revoir son détail/)).toBeTruthy();
    expect(r.queryByText(/ne sont plus affichées/)).toBeNull();
  });
});
