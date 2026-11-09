import { StyleSheet } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { TrackingDto } from '@yaar/shared';
import { ApiError } from '../lib/api';
import PublicTrackingScreen from '../app/suivi/[token]';
import { tracking } from './fixtures';

// L'interrupteur unique du thème de la page publique, passé en clair.
jest.mock('../components/tracking/recipientSheetTheme', () => ({ RECIPIENT_SHEET_THEME: 'light' }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ token: 'tok-abc' }), Stack: { Screen: () => null } }));
jest.mock('expo-router/head', () => ({ __esModule: true, default: () => null }));
jest.mock('../state/config', () => ({ useAppConfig: () => ({ config: { realtime: 'poll', pollIntervalMs: 4000, demoMode: false, otpChannel: 'sms' } }) }));
const mockTrack = jest.fn<Promise<TrackingDto>, [string]>();
jest.mock('../lib/publicApi', () => ({ publicApi: { trackDelivery: (token: string) => mockTrack(token) } }));
jest.mock('../components/map/LiveMap', () => ({ LiveMap: () => null }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function show(data: TrackingDto | Error) {
  if (data instanceof Error) mockTrack.mockRejectedValue(data);
  else mockTrack.mockResolvedValue(data);
  const r = await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <PublicTrackingScreen />
    </SafeAreaProvider>,
  );
  await act(async () => jest.advanceTimersByTimeAsync(0));
  return r;
}

describe('page publique de suivi : thème clair (RECIPIENT_SHEET_THEME = « light »)', () => {
  beforeEach(() => jest.useFakeTimers({ now: Date.parse('2026-11-08T14:20:10.000Z') }));
  afterEach(() => jest.useRealTimers());

  it('feuille blanche, textes foncés, mêmes contenus', async () => {
    const r = await show(tracking());
    expect(StyleSheet.flatten(r.getByTestId('tracking-sheet').props.style)).toMatchObject({ backgroundColor: '#FFFFFF' });
    expect(StyleSheet.flatten(r.getByText('Votre colis est en route').props.style)).toMatchObject({ color: '#0B7A4B' });
    expect(r.getByLabelText('Code de livraison 4 8 2 1')).toBeTruthy();
    expect(r.getByTestId('amount-to-pay-value')).toHaveTextContent('16 500 FCFA');
  });

  it('lien expiré : carte claire', async () => {
    const r = await show(new ApiError(404, 'NOT_FOUND', 'Lien de suivi introuvable ou expiré'));
    expect(StyleSheet.flatten(r.getByTestId('tracking-expired').props.style)).toMatchObject({ backgroundColor: '#FFFFFF' });
  });
});
