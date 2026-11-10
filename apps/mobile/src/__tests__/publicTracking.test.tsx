import type { ReactElement } from 'react';
import { Dimensions, Linking } from 'react-native';
import { StyleSheet } from 'react-native';
import { headlineFontSize } from '../components/tracking/TrackingParts';
import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { TrackingDto } from '@yaar/shared';
import { ApiError, NETWORK_ERROR_CODE } from '../lib/api';
import type { VisibilitySource } from '../lib/pollScheduler';
import { usePublicTracking } from '../hooks/usePublicTracking';
import { prefetchPublicTracking } from '../lib/webShell';
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
    LiveMap: (p: { markers: { kind: string; pulse?: boolean; initials?: string | null }[]; lines: { kind: string }[]; fitPoints: unknown[] }) => (
      <>
        <RNText testID="live-map">
          {`${p.markers.map((m) => `${m.kind}${m.pulse ? '*' : ''}`).join(',')}|${p.lines.map((l) => l.kind).join(',')}|${p.fitPoints.length}`}
        </RNText>
        <RNText testID="live-map-initials">{p.markers.map((m) => m.initials ?? '-').join(',')}</RNText>
      </>
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

  it('reprend la requête lancée au démarrage de l’application (lib/webShell) au lieu d’en lancer une seconde', async () => {
    const early = jest.fn(async () => tracking());
    expect(prefetchPublicTracking('/suivi/tok-abc', early)).toBe(true);
    mockTrack.mockResolvedValue(tracking());
    const r = await render(wrap(<PublicTrackingScreen />));
    await act(async () => jest.advanceTimersByTimeAsync(0));
    expect(early).toHaveBeenCalledWith('tok-abc');
    expect(mockTrack).not.toHaveBeenCalled();
    expect(r.getByText('Votre colis est en route')).toBeTruthy();
    // Rafraîchissement suivant : requête ordinaire.
    await act(async () => jest.advanceTimersByTimeAsync(8000));
    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(early).toHaveBeenCalledTimes(1);
  });

  it('livreur en route vers l’expéditeur : heure d’arrivée, étape, livreur avec appel', async () => {
    const r = await show(
      tracking({ status: 'ASSIGNED', pickedUpAt: null, etaMinutes: 12, route: route({ target: 'PICKUP', points: [[12.3627, -1.521], [12.3686, -1.5275]] }) }),
    );
    expect(r.getByLabelText('Arrivée vers 14:32 · dans 12 min')).toBeTruthy();
    expect(r.getByText('Le livreur récupère votre colis')).toBeTruthy();
    expect(r.getByText('Issouf est en route vers Pharmacie du Centre.')).toBeTruthy();
    expect(r.getByText('Moto · 11 JJ 4521')).toBeTruthy();
    expect(r.getByTestId('live-map').props.children).toMatch(/^pickup,dropoff\*,driver\|route,pending\|/);
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
    expect(r.getByTestId('amount-to-pay')).toHaveTextContent(/À payer à la réception.*En espèces, au livreur\..*16 500 FCFA/);
    // Tuile soleil, texte encre (jamais de texte jaune), montant exact sous `-value`.
    expect(StyleSheet.flatten(r.getByTestId('amount-to-pay').props.style)).toMatchObject({ backgroundColor: '#FFC93C' });
    expect(r.getByTestId('amount-to-pay-value')).toHaveTextContent('16\u202f500\u202fFCFA', { normalizer: (t: string) => t });
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

  it('feuille blanche Cobalt ; entreprise à ses initiales, « chez vous » en épingle à maison', async () => {
    const r = await show(tracking({ status: 'ASSIGNED', pickedUpAt: null, route: route({ target: 'PICKUP', points: [[12.3627, -1.521], [12.3686, -1.5275]] }) }));
    expect(StyleSheet.flatten(r.getByTestId('tracking-sheet').props.style)).toMatchObject({ backgroundColor: '#FFFFFF', borderTopLeftRadius: 32 });
    // Retrait (Pharmacie du Centre → PC), destinataire sans initiales (maison), livreur.
    expect(r.getByTestId('live-map-initials').props.children).toBe('PC,-,-');
    expect(r.getByTestId('dropoff-address')).toHaveTextContent(/Patte d’Oie, rue 15\.23.*Repère : Station Total/);
  });

  it('livreur : WhatsApp prérempli (destinataire du colis #1052 de l’entreprise)', async () => {
    const r = await show(tracking());
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await fireEvent.press(r.getByTestId('whatsapp-driver'));
    const text = 'Bonjour Issouf, je suis le destinataire du colis #1052 de Pharmacie du Centre (Yaar Livraison).';
    expect(open).toHaveBeenCalledWith(`https://wa.me/22673000001?text=${encodeURIComponent(text)}`);
    // Un livreur est en route : l'expéditeur n'est plus le contact proposé.
    expect(r.queryByTestId('call-sender')).toBeNull();
    open.mockRestore();
  });

  it('annulée : ni étapes ni code, l’expéditeur à appeler', async () => {
    const r = await show(tracking({ status: 'CANCELLED', deliveryCode: null, driver: null, route: null, cancelledAt: '2026-11-08T14:15:00.000Z' }));
    expect(r.getByText('Livraison annulée')).toBeTruthy();
    expect(r.getByText('Contactez Pharmacie du Centre pour plus d’informations.')).toBeTruthy();
    expect(r.queryByTestId('tracking-steps')).toBeNull();
    expect(r.queryByTestId('delivery-code')).toBeNull();
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await fireEvent.press(r.getByTestId('call-sender'));
    expect(open).toHaveBeenCalledWith('tel:+22671000001');
    open.mockRestore();
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
    expect(StyleSheet.flatten(r.getByTestId('tracking-expired').props.style)).toMatchObject({ backgroundColor: '#FFFFFF' });
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
    // « Connexion impossible » une seule fois (titre), le texte donne la marche à suivre.
    expect(r.getByTestId('tracking-error')).toHaveTextContent(
      /^Connexion impossibleVérifiez votre connexion Internet\. Nouvel essai automatique dans quelques secondes\.$/,
    );
    // Intervalle doublé après l'échec (8 s → 16 s).
    await act(async () => jest.advanceTimersByTimeAsync(8000));
    expect(r.getByTestId('tracking-error')).toBeTruthy();
    await act(async () => jest.advanceTimersByTimeAsync(8000));
    expect(r.getByText('Votre colis est en route')).toBeTruthy();
  });
});

describe('page publique sur un petit téléphone (360 × 640) et sur une page claire', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: T0 });
    mockTrack.mockReset();
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 360, height: 640, scale: 2, fontScale: 1 });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('écran court : feuille à 0,62 de l’écran, code compact (44 px), heure en chiffres héros réduits (48 px) avec sa pastille sur sa ligne, montant sur une ligne', async () => {
    const r = await show(tracking());
    expect(StyleSheet.flatten(r.getByTestId('tracking-sheet').props.style).maxHeight).toBe(Math.round(640 * 0.62));
    // La phrase « Issouf arrive chez vous. » cède sa place (le prénom est sur la carte du livreur).
    expect(r.queryByText('Issouf arrive chez vous.')).toBeNull();
    const digits = r.getByText('4  8  2  1');
    expect(StyleSheet.flatten(digits.props.style)).toMatchObject({ fontSize: 44 });
    // « 14:29 [dans 9 min] » : heure en grand (chiffres tabulaires) et pastille dans la même rangée, libellé au-dessus.
    const clock = r.getByText('14:29');
    expect(StyleSheet.flatten(clock.props.style)).toMatchObject({ fontSize: 48, fontWeight: '800', fontVariant: ['tabular-nums'] });
    expect(clock.parent).toBe(r.getByText('dans 9 min').parent?.parent);
    expect(r.getByLabelText('Arrivée vers 14:29 · dans 9 min')).toBeTruthy();
    // Montant sur une ligne, tuile plus basse.
    expect(r.getByTestId('amount-to-pay-value').props.numberOfLines).toBe(1);
    expect(StyleSheet.flatten(r.getByTestId('amount-to-pay').props.style)).toMatchObject({ minHeight: 60 });
    expect(r.getByTestId('amount-to-pay-value')).toHaveTextContent('16 500 FCFA');
  });

  it('téléphone ordinaire : heure en chiffres héros (64 px), état de la livraison en cobalt dessous', async () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 390, height: 844, scale: 2, fontScale: 1 });
    const r = await show(tracking());
    const clock = r.getByText('14:29');
    expect(StyleSheet.flatten(clock.props.style)).toMatchObject({ fontSize: 64, fontVariant: ['tabular-nums'] });
    expect(StyleSheet.flatten(r.getByText('Votre colis est en route').props.style)).toMatchObject({ color: '#2448FF' });
  });

  it('taille de l’heure : tient avec sa pastille, de 30 (24 sur une feuille claire) à 20 px', () => {
    // Largeur estimée d'après les avances de la police (src/fonts.ts) : 360 px (contenu 328) : 23 px ; 390 (358) : 27 ;
    // panneau latéral d'un ordinateur (388) : 30.
    expect(headlineFontSize('Arrivée vers 14:29', 'dans 8 min', 328, 30)).toBe(23);
    expect(headlineFontSize('Arrivée vers 14:29', 'dans 8 min', 358, 30)).toBe(27);
    expect(headlineFontSize('Arrivée vers 14:29', 'dans 8 min', 388, 30)).toBe(30);
    expect(headlineFontSize('Arrivée vers 14:29', 'dans 8 min', 358, 24)).toBe(24);
    expect(headlineFontSize('Arrivée imminente', null, 328, 30)).toBe(30);
    expect(headlineFontSize('Au retrait vers 14:24', 'dans 1 h 05', 200, 30)).toBe(20);
  });

  it('erreur du serveur (pas le réseau) : titre « Suivi momentanément indisponible »', async () => {
    const r = await show(new ApiError(500, 'INTERNAL', 'Erreur interne du serveur'));
    expect(r.getByTestId('tracking-error')).toHaveTextContent(/^Suivi momentanément indisponibleErreur interne du serveur\. Nouvel essai/);
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
