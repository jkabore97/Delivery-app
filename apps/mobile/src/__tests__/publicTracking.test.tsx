import type { ReactElement } from 'react';
import { Linking } from 'react-native';
import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { TrackingDto } from '@yaar/shared';
import { ApiError, NETWORK_ERROR_CODE } from '../lib/api';
import type { VisibilitySource } from '../lib/pollScheduler';
import { usePublicTracking } from '../hooks/usePublicTracking';
import PublicTrackingScreen from '../app/suivi/[token]';
import { route, tracking } from './fixtures';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ token: 'tok-abc' }),
  Stack: { Screen: () => null },
}));
jest.mock('expo-router/head', () => ({ __esModule: true, default: () => null }));
const mockConfig: { config: Record<string, unknown> } = {
  config: { realtime: 'poll', pollIntervalMs: 4000, demoMode: false, otpChannel: 'sms' },
};
jest.mock('../state/config', () => ({ useAppConfig: () => mockConfig }));
const mockTrack = jest.fn<Promise<TrackingDto>, [string]>();
jest.mock('../lib/publicApi', () => ({ publicApi: { trackDelivery: (token: string) => mockTrack(token) } }));
// La carte (MapLibre / react-native-maps) est remplacée par un résumé de sa scène.
jest.mock('../components/map/LiveMap', () => {
  const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    LiveMap: (p: { markers: { kind: string; pulse?: boolean }[]; lines: { kind: string }[]; fitPoints: unknown[] }) => (
      <RNText testID="live-map">
        {`${p.markers.map((m) => `${m.kind}${m.pulse ? '*' : ''}`).join(',')}|${p.lines.map((l) => l.kind).join(',')}|${p.fitPoints.length}`}
      </RNText>
    ),
  };
});

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (el: ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{el}</SafeAreaProvider>;
const T0 = Date.parse('2026-11-08T14:20:10.000Z');

async function show(data: TrackingDto | Error) {
  if (data instanceof Error) mockTrack.mockRejectedValue(data);
  else mockTrack.mockResolvedValue(data);
  const r = await render(wrap(<PublicTrackingScreen />));
  await act(async () => jest.advanceTimersByTimeAsync(0));
  return r;
}

describe('page publique de suivi /suivi/[token] (sans compte)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: T0 });
    mockTrack.mockReset();
    mockConfig.config = { realtime: 'poll', pollIntervalMs: 4000, demoMode: false, otpChannel: 'sms' };
  });
  afterEach(() => jest.useRealTimers());

  it('recherche d’un livreur : expéditeur, code déjà visible, radar à l’entreprise et pointillés', async () => {
    const r = await show(tracking({ status: 'SEARCHING_DRIVER', driver: null, route: null, etaMinutes: null, assignedAt: null, pickedUpAt: null }));
    expect(mockTrack).toHaveBeenCalledWith('tok-abc');
    expect(r.getByText('Recherche d’un livreur…')).toBeTruthy();
    expect(r.getByText('Pharmacie du Centre a confirmé votre commande.')).toBeTruthy();
    expect(r.getByText('Donnez ce code au livreur')).toBeTruthy();
    expect(r.getByTestId('live-map').props.children).toBe('pickup*,dropoff*|dashed|2');
    expect(r.queryByTestId('driver-card')).toBeNull();
    // Recherche : seule la première étape est en cours ; rafraîchi toutes les 16 s (2 × 8 s).
    expect(r.getByTestId('tracking-steps')).toHaveTextContent(/Confirmée.*Retrait.*En route.*Livrée/);
    await act(async () => jest.advanceTimersByTimeAsync(15_000));
    expect(mockTrack).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTimeAsync(1_000));
    expect(mockTrack).toHaveBeenCalledTimes(2);
  });

  it('livreur en route vers l’expéditeur : heure d’arrivée, étape, livreur avec appel', async () => {
    const r = await show(
      tracking({ status: 'ASSIGNED', pickedUpAt: null, etaMinutes: 12, route: route({ target: 'PICKUP', points: [[12.3627, -1.521], [12.3686, -1.5275]] }) }),
    );
    expect(r.getByLabelText('Arrivée vers 14:32 · dans 12 min')).toBeTruthy();
    expect(r.getByText('Le livreur récupère votre colis')).toBeTruthy();
    expect(r.getByText('Issouf est en route vers Pharmacie du Centre.')).toBeTruthy();
    expect(r.getByText('Moto · 11 JJ 4521')).toBeTruthy();
    expect(r.getByTestId('live-map').props.children).toMatch(/^pickup,dropoff\*,driver\|route,dashed\|/);
    // Le destinataire garde son épingle dans le cadre pendant le retrait : livreur + entreprise + reste de
    // l'itinéraire (2 points) + destinataire.
    expect(r.getByTestId('live-map').props.children).toMatch(/\|5$/);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await fireEvent.press(r.getByTestId('call-driver'));
    expect(open).toHaveBeenCalledWith('tel:+22673000001');
    open.mockRestore();
  });

  it('en route vers vous : code à donner, montant à payer, itinéraire vers le destinataire ; rafraîchi toutes les 8 s', async () => {
    const r = await show(tracking());
    expect(r.getByText('Votre colis est en route')).toBeTruthy();
    expect(r.getByLabelText('Code de livraison 4 8 2 1')).toBeTruthy();
    expect(r.getByTestId('amount-to-pay')).toHaveTextContent(/À payer au livreur à la réception.*16 500 FCFA/);
    expect(r.getByTestId('live-map').props.children).toMatch(/^dropoff\*,driver\|route\|/);
    expect(mockTrack).toHaveBeenCalledTimes(1);
    // /config sans trackingPollIntervalMs (pollIntervalMs = 4 s) : 8 s par défaut, pas 4 s.
    await act(async () => jest.advanceTimersByTimeAsync(4000));
    expect(mockTrack).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTimeAsync(4000));
    expect(mockTrack).toHaveBeenCalledTimes(2);
  });

  it('intervalle de /config (trackingPollIntervalMs) : 6 s pendant la course, 12 s pendant la recherche', async () => {
    mockConfig.config = { ...mockConfig.config, trackingPollIntervalMs: 6000 };
    mockTrack.mockResolvedValueOnce(tracking({ status: 'SEARCHING_DRIVER', driver: null, route: null, etaMinutes: null }));
    mockTrack.mockResolvedValue(tracking({ status: 'ASSIGNED', pickedUpAt: null }));
    await render(wrap(<PublicTrackingScreen />));
    await act(async () => jest.advanceTimersByTimeAsync(0));
    expect(mockTrack).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTimeAsync(11_900));
    expect(mockTrack).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTimeAsync(100));
    expect(mockTrack).toHaveBeenCalledTimes(2); // livreur trouvé : rythme de la course ensuite
    await act(async () => jest.advanceTimersByTimeAsync(6000));
    expect(mockTrack).toHaveBeenCalledTimes(3);
  });

  it('trop de requêtes (429) : message clair, sans contradiction, et nouvel essai automatique', async () => {
    mockTrack.mockRejectedValueOnce(new ApiError(429, 'RATE_LIMITED', 'Trop de requêtes'));
    mockTrack.mockResolvedValue(tracking());
    const r = await render(wrap(<PublicTrackingScreen />));
    await act(async () => jest.advanceTimersByTimeAsync(0));
    expect(r.getByTestId('tracking-rate-limited')).toHaveTextContent(/Trop de demandes depuis votre connexion/);
    expect(r.getByTestId('tracking-rate-limited')).toHaveTextContent(/reprend tout seul/);
    expect(r.queryByText(/patientez quelques minutes/)).toBeNull();
    await act(async () => jest.advanceTimersByTimeAsync(16_000));
    expect(r.getByText('Votre colis est en route')).toBeTruthy();
  });

  it('livrée : merci, ni code ni montant, plus de rafraîchissement', async () => {
    const r = await show(tracking({ status: 'DELIVERED', deliveryCode: null, driver: null, route: null, deliveredAt: '2026-11-08T14:51:00.000Z' }));
    expect(r.getByText('Colis livré : merci !')).toBeTruthy();
    expect(r.getByText(/Livré à 14:51/)).toBeTruthy();
    expect(r.queryByTestId('delivery-code')).toBeNull();
    expect(r.queryByTestId('amount-to-pay')).toBeNull();
    expect(r.getByTestId('live-map').props.children).toBe('dropoff||1');
    await act(async () => jest.advanceTimersByTimeAsync(20_000));
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });

  it('lien expiré ou inconnu (404) : message clair, sans carte, plus de requête', async () => {
    const r = await show(new ApiError(404, 'NOT_FOUND', 'Lien de suivi introuvable ou expiré'));
    expect(r.getByText('Ce lien de suivi n’est plus valide')).toBeTruthy();
    expect(r.queryByTestId('live-map')).toBeNull();
    await act(async () => jest.advanceTimersByTimeAsync(20_000));
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });

  it('réseau coupé : message, nouvel essai ralenti, puis le suivi s’affiche', async () => {
    mockTrack.mockRejectedValueOnce(new ApiError(0, NETWORK_ERROR_CODE, 'Connexion impossible. Vérifiez votre connexion Internet.'));
    mockTrack.mockResolvedValue(tracking());
    const r = await render(wrap(<PublicTrackingScreen />));
    await act(async () => jest.advanceTimersByTimeAsync(0));
    expect(r.getByTestId('tracking-error')).toBeTruthy();
    // Intervalle doublé après l'échec (8 s → 16 s).
    await act(async () => jest.advanceTimersByTimeAsync(8000));
    expect(r.getByTestId('tracking-error')).toBeTruthy();
    await act(async () => jest.advanceTimersByTimeAsync(8000));
    expect(r.getByText('Votre colis est en route')).toBeTruthy();
  });
});

describe('usePublicTracking : pause quand l’onglet est masqué', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('aucune requête masqué ; rafraîchissement immédiat au retour', async () => {
    let visible = true;
    const listeners = new Set<(v: boolean) => void>();
    const visibility: VisibilitySource = {
      isVisible: () => visible,
      subscribe: (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
    };
    const fetcher = jest.fn(async () => tracking());
    const { result } = await renderHook(() => usePublicTracking('tok', { intervalMs: 4000, visibility, fetcher }));
    await act(async () => jest.advanceTimersByTimeAsync(0));
    expect(result.current.status).toBe('ok');
    expect(fetcher).toHaveBeenCalledTimes(1);
    visible = false;
    await act(async () => listeners.forEach((l) => l(false)));
    await act(async () => jest.advanceTimersByTimeAsync(60_000));
    expect(fetcher).toHaveBeenCalledTimes(1);
    visible = true;
    await act(async () => listeners.forEach((l) => l(true)));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
