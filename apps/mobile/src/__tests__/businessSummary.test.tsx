import { act, render } from '@testing-library/react-native';
import type { BusinessSummaryDto } from '@yaar/shared';
import { Text } from '../components/Text';
import { BusinessSummaryProvider, useBusinessSummary } from '../components/business/summary';

const SUMMARY: BusinessSummaryDto = { date: '2026-11-09', active: 3, today: { delivered: 14, cancelled: 1, avgDeliveryMinutes: 24, goodsCollected: 87500, deliveryFees: 21400 } };
const mockApi = { request: jest.fn<Promise<unknown>, [string, string]>() };
jest.mock('../state/auth', () => ({ useApi: () => mockApi }));
jest.mock('../state/socket', () => ({ usePolling: () => undefined, useSocketEvent: () => undefined }));

let refresh: () => Promise<boolean> = async () => false;
function Probe() {
  const s = useBusinessSummary();
  refresh = s.refresh;
  return <Text testID="probe">{`${s.summary ? s.summary.today.delivered : '-'}|${s.error ?? ''}`}</Text>;
}

describe('Résumé du jour de l’entreprise (GET /business/summary)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lu à l’ouverture ; deux rafraîchissements simultanés = une seule requête ; une erreur garde le dernier résumé', async () => {
    let release: (v: unknown) => void = () => undefined;
    mockApi.request.mockReturnValueOnce(Promise.resolve(SUMMARY));
    const r = await render(
      <BusinessSummaryProvider>
        <Probe />
      </BusinessSummaryProvider>,
    );
    await act(async () => undefined);
    expect(mockApi.request).toHaveBeenCalledWith('GET', '/business/summary');
    expect(r.getByTestId('probe')).toHaveTextContent('14|');
    mockApi.request.mockReturnValueOnce(new Promise((res) => (release = res)));
    let a: Promise<boolean> = Promise.resolve(false);
    let b: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      a = refresh();
      b = refresh();
    });
    expect(mockApi.request).toHaveBeenCalledTimes(2);
    await act(async () => release({ ...SUMMARY, today: { ...SUMMARY.today, delivered: 15 } }));
    expect(await a).toBe(true);
    expect(await b).toBe(true);
    expect(r.getByTestId('probe')).toHaveTextContent('15|');
    mockApi.request.mockRejectedValueOnce(new Error('Connexion impossible'));
    await act(async () => {
      expect(await refresh()).toBe(false);
    });
    expect(r.getByTestId('probe')).toHaveTextContent('15|Connexion impossible');
  });

  it('hors de l’espace entreprise (sans fournisseur) : aucune requête, valeurs nulles', async () => {
    const r = await render(<Probe />);
    expect(r.getByTestId('probe')).toHaveTextContent('-|');
    expect(await refresh()).toBe(false);
    expect(mockApi.request).not.toHaveBeenCalled();
  });
});
