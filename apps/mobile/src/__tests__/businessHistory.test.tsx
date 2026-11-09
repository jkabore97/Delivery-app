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
    expect(r.getByTestId('history-collected-h-1')).toHaveTextContent(/^Encaissé auprès du destinataire/);
    expect(r.getByTestId('history-collected-h-1-value')).toHaveTextContent('16 500 FCFA');
    // Carte de colis : destinataire, état « LIVRÉE », date et frais (payés par le destinataire).
    expect(r.getByTestId('history-h-1')).toHaveTextContent(/LIVRÉE.*Awa Kaboré/);
    expect(r.getByTestId('history-h-1')).toHaveTextContent(/08\/11\/2026 14:51 · livraison 1\s500\sFCFA payée par le destinataire/);
    expect(r.getByText('1 livraison terminée')).toBeTruthy();
    expect(r.getByText(/Touchez une livraison pour revoir son détail/)).toBeTruthy();
    expect(r.queryByText(/ne sont plus affichées/)).toBeNull();
  });

  it('annulée : état, motif, aucun montant encaissé ; liste vide : message', async () => {
    const cancelled = delivery({ id: 'h-2', status: 'CANCELLED', cancelReason: 'Annulée par l’entreprise', cancelledAt: '2026-11-08T15:00:00.000Z' });
    mockApi.listDeliveries.mockResolvedValueOnce({ items: [cancelled], total: 1, page: 1, pageSize: 20 });
    const r = await render(<BusinessHistoryScreen />);
    await waitFor(() => expect(r.getByTestId('history-h-2')).toBeTruthy());
    expect(r.getByTestId('history-h-2')).toHaveTextContent(/ANNULÉE.*Motif : Annulée par l’entreprise/);
    expect(r.queryByTestId('history-collected-h-2')).toBeNull();
    r.unmount();
    mockApi.listDeliveries.mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 20 });
    const empty = await render(<BusinessHistoryScreen />);
    await waitFor(() => expect(empty.getByText('Aucune livraison terminée pour le moment.')).toBeTruthy());
  });
});
