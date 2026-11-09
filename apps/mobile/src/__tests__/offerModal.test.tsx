import type { ReactElement } from 'react';
import { Platform, StyleSheet, Vibration } from 'react-native';
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError } from '../lib/api';
import { OfferModal } from '../components/OfferModal';
import type { RoundButtonProps } from '../components/design/RoundButton';
import { driverProfile, offer, order } from './fixtures';

/** Comparaison exacte du texte (sans normaliser les espaces : les espaces fines insécables comptent). */
const exactly = { normalizer: (t: string) => t };

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

const mockApi = { acceptOffer: jest.fn(), rejectOffer: jest.fn(async () => undefined) };
jest.mock('../state/auth', () => ({ useApi: () => mockApi }));

const mockDriver = {
  offers: [offer()],
  profile: driverProfile({ isOnline: true }),
  currentOrder: null as ReturnType<typeof order> | null,
  position: null as { lat: number; lng: number; at: number; heading: number | null } | null,
  removeOffer: jest.fn(),
  setCurrentOrder: jest.fn(),
  refreshProfile: jest.fn(async () => undefined),
};
jest.mock('../state/driver', () => ({ useDriver: () => mockDriver }));

/** Carte simulée : on lit ce qu'elle reçoit (fond, marqueurs, zones, tracés) et on compte ses rendus. */
const mockMapProps: { current: Record<string, unknown> | null; renders: number } = { current: null, renders: 0 };
jest.mock('../components/map/LiveMap', () => {
  const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    LiveMap: (p: Record<string, unknown>) => {
      mockMapProps.current = p;
      mockMapProps.renders++;
      return <RNText testID="live-map">map</RNText>;
    },
  };
});

/** Boutons ronds réels, rendus comptés par testID (le bouton « Accepter » ne doit pas suivre l'anneau image par image). */
const mockButtonRenders: Record<string, number> = {};
jest.mock('../components/design/RoundButton', () => {
  const actual = jest.requireActual<typeof import('../components/design/RoundButton')>('../components/design/RoundButton');
  return {
    ...actual,
    RoundButton: (p: RoundButtonProps) => {
      if (p.testID) mockButtonRenders[p.testID] = (mockButtonRenders[p.testID] ?? 0) + 1;
      return <actual.RoundButton {...p} />;
    },
  };
});

const T0 = Date.parse('2026-11-06T09:43:00.000Z');
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (el: ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{el}</SafeAreaProvider>;
const show = () => render(wrap(<OfferModal />));

describe('OfferModal (plein écran)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: T0 });
    jest.clearAllMocks();
    mockDriver.offers = [offer()];
    mockDriver.profile = driverProfile({ isOnline: true });
    mockDriver.currentOrder = null;
    mockDriver.position = null;
    mockMapProps.current = null;
    mockMapProps.renders = 0;
    for (const k of Object.keys(mockButtonRenders)) delete mockButtonRenders[k];
  });
  afterEach(async () => {
    // Démontage avec l'horloge simulée encore active : le StatusBar de React Native (barre d'état claire de l'offre)
    // programme sa mise à jour avec setImmediate ; démonté sous l'horloge réelle, il bloquerait le test suivant.
    await cleanup();
    jest.useRealTimers();
  });

  it('affiche l’offre avec le compte à rebours, le véhicule et le gain', async () => {
    const r = await show();
    expect(r.getByTestId('offer-screen')).toBeTruthy();
    expect(r.getByTestId('offer-title')).toHaveTextContent('Nouvelle course');
    // Étiquette avec libellé : un seul élément accessible, qui annonce aussi le véhicule (pictogramme seul à l'écran).
    expect(r.getByLabelText('Nouvelle course, Moto').props).toMatchObject({ accessible: true, accessibilityRole: 'text' });
    expect(r.getByLabelText('Retrait à environ 4 min · 1,2 km').props.accessible).toBe(true);
    expect(r.getByTestId('offer-vehicle')).toHaveTextContent('Moto · 4,1 km de course');
    expect(r.getByText('30 s')).toBeTruthy();
    expect(r.getByText(/Maquis Le Verdoyant/)).toBeTruthy();
    expect(r.getByTestId('offer-earning')).toHaveTextContent(/Votre gain.*1 200 FCFA/);
    expect(r.getByTestId('reject-offer')).toBeTruthy();
  });

  it('Cobalt : gain sur tuile cobalt douce, espèces sur tuile SOLEIL pleine au texte encre, titres en minuscules', async () => {
    mockDriver.offers = [offer({ cashToCollect: 9700, cashAtPickup: 1700, cashAtDelivery: 8000, driverEarning: 1280 })];
    const r = await show();
    expect(StyleSheet.flatten(r.getByTestId('offer-earning').props.style)).toMatchObject({ backgroundColor: '#E9EDFF' });
    expect(StyleSheet.flatten(r.getByTestId('offer-cash').props.style)).toMatchObject({ backgroundColor: '#FFC93C' });
    // Texte encre sur le soleil (12,2:1), détail en encre brune (7,1:1) : jamais de texte jaune.
    expect(StyleSheet.flatten(r.getByTestId('offer-cash-total').props.style)).toMatchObject({ color: '#0C1222', fontVariant: ['tabular-nums'] });
    expect(StyleSheet.flatten(r.getByTestId('offer-cash-split').props.style)).toMatchObject({ color: '#4B3B08' });
    const kicker = r.getByText('Détails de la course');
    expect(StyleSheet.flatten(kicker.props.style).textTransform).toBeUndefined();
    // Refuser : pilule rouge pleine (texte blanc 4,8:1), 56 px.
    const reject = within(r.getByTestId('reject-offer'));
    expect(reject.getByText('Refuser')).toBeTruthy();
  });

  it('temps jusqu’au retrait : distance de l’API à la vitesse moyenne du véhicule (1 min au moins)', async () => {
    const r = await show();
    // 1,2 km à moto (22 km/h) : 3,3 min → 4 min.
    expect(r.getByTestId('offer-eta')).toHaveTextContent('≈ 4 min · 1,2 km');
  });

  it('entreprise : nom et adresse du retrait, zone de livraison seulement (pas d’adresse du destinataire)', async () => {
    const r = await show();
    expect(r.getByText('Récupérer chez Maquis Le Verdoyant')).toBeTruthy();
    expect(r.getByText(/Avenue Kwame Nkrumah, centre-ville · Secteur Centre-ville/)).toBeTruthy();
    expect(r.getByText('Livrer : Secteur Patte d’Oie')).toBeTruthy();
    expect(r.getByText(/adresse exacte du destinataire s’affiche une fois la course acceptée/)).toBeTruthy();
  });

  it('carte Cobalt (claire) : livreur, entreprise en épingle à initiales, zone de livraison en cercle (jamais de point exact)', async () => {
    mockDriver.position = { lat: 12.372, lng: -1.515, at: T0, heading: null };
    mockDriver.offers = [
      offer({
        orderType: 'PARCEL',
        pickup: {
          address: 'Avenue Kwame Nkrumah',
          name: 'Pharmacie du Centre',
          distanceFromDriverKm: 1.1,
          zone: 'Secteur Centre-ville',
          location: { lat: 12.3686, lng: -1.5275 },
        },
        dropoff: { address: 'Secteur Patte d’Oie', zone: 'Secteur Patte d’Oie', approxLocation: { lat: 12.3395, lng: -1.517 } },
      }),
    ];
    await show();
    const p = mockMapProps.current as {
      theme: string;
      markers: Array<{ kind: string; initials?: string | null; lat: number; lng: number }>;
      zones: Array<{ kind: string; lat: number; lng: number; radiusM: number }>;
      lines: Array<{ kind: string; points: Array<{ lat: number; lng: number }> }>;
    };
    // Plus de carte sombre : le fond Cobalt par défaut (aucun thème transmis).
    expect(p.theme).toBeUndefined();
    expect(p.markers.map((m) => m.kind).sort()).toEqual(['driver', 'pickup']);
    expect(p.markers.find((m) => m.kind === 'pickup')?.initials).toBe('PC');
    expect(p.markers.some((m) => m.kind === 'dropoff')).toBe(false);
    expect(p.zones).toEqual([expect.objectContaining({ kind: 'dropoff', lat: 12.3395, lng: -1.517 })]);
    expect(p.lines).toEqual([
      expect.objectContaining({ kind: 'dashed', points: [{ lat: 12.3686, lng: -1.5275 }, { lat: 12.3395, lng: -1.517 }] }),
    ]);
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
    const r = await show();
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
    const r = await show();
    expect(r.getByTestId('offer-cash')).toHaveTextContent(/9 700 FCFA/);
    // Texte exact : espaces fines insécables (U+202F) entre les milliers et avant « FCFA », jamais d'espace ordinaire.
    expect(r.getByTestId('offer-cash-total')).toHaveTextContent('9 700 FCFA', exactly);
    expect(r.getByTestId('offer-cash-split')).toHaveTextContent('1 700 FCFA au retrait · 8 000 FCFA à la livraison', exactly);
    expect(within(r.getByTestId('offer-cash')).getByTestId('offer-cash-split')).toBeTruthy(); // grand écran : dans la case
    expect(r.getByTestId('offer-earning')).toHaveTextContent(/1 280 FCFA/);
  });

  it('petit téléphone (360 × 640) : rien de coupé, détail resserré, barre de défilement visible', async () => {
    const dims = jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ width: 360, height: 640, scale: 2, fontScale: 1 });
    mockDriver.offers = [
      offer({
        orderType: 'PARCEL',
        vehicleType: 'CAR',
        distanceKm: 12.6,
        pickup: {
          address: 'Secteur Zogona',
          name: 'Établissements Commerciaux Ouédraogo & Frères Import-Export',
          distanceFromDriverKm: null,
          zone: 'Secteur Zogona',
          approxLocation: { lat: 12.38, lng: -1.4986 },
        },
        dropoff: { address: 'Secteur Ouaga 2000', zone: 'Secteur Ouaga 2000', approxLocation: { lat: 12.3226, lng: -1.4977 } },
        cashToCollect: 125000,
        cashAtPickup: 2500,
        cashAtDelivery: 122500,
        driverEarning: 2750,
      }),
    ];
    const small = { frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
    const r = await render(
      <SafeAreaProvider initialMetrics={small}>
        <OfferModal />
      </SafeAreaProvider>,
    );
    try {
      // Véhicule sous le titre (colonne), jamais tronqué.
      const vehicle = r.getByTestId('offer-vehicle');
      expect(vehicle).toHaveTextContent('Voiture · 12,6 km de course');
      expect(vehicle.props.numberOfLines).toBeUndefined();
      expect(StyleSheet.flatten(vehicle.parent?.props.style)).toMatchObject({ flexDirection: 'column' });
      // Nom d'entreprise entier (pas de limite de lignes).
      const pickupTitle = r.getByText('Récupérer chez Établissements Commerciaux Ouédraogo & Frères Import-Export');
      expect(pickupTitle.props.numberOfLines).toBeUndefined();
      // Détail des espèces sur toute la largeur (hors de la case), au texte exact.
      expect(within(r.getByTestId('offer-cash')).queryByTestId('offer-cash-split')).toBeNull();
      expect(r.getByTestId('offer-cash-split')).toHaveTextContent('2 500 FCFA au retrait · 122 500 FCFA à la livraison', exactly);
      expect(r.getByTestId('offer-cash-total')).toHaveTextContent('125 000 FCFA', exactly);
      // Zone de livraison : rappel court.
      expect(r.getByTestId('offer-dropoff')).toHaveTextContent('Livrer : Secteur Ouaga 2000Zone approximative');
      // Détail : jusqu'à la moitié de l'écran, barre de défilement affichée.
      const scroll = r.getByTestId('offer-details-scroll');
      expect(scroll.props.showsVerticalScrollIndicator).toBe(true);
      expect(StyleSheet.flatten(scroll.props.style)).toMatchObject({ maxHeight: 320 });
    } finally {
      dims.mockRestore();
    }
  });

  it('colis : zones approximatives au retrait et à la livraison', async () => {
    mockDriver.offers = [
      offer({
        orderType: 'PARCEL',
        pickup: { address: 'Secteur Zogona', name: null, distanceFromDriverKm: 0.8, zone: 'Secteur Zogona', approxLocation: { lat: 12.38, lng: -1.4986 } },
        dropoff: { address: 'Secteur Tampouy', zone: 'Secteur Tampouy', approxLocation: { lat: 12.4, lng: -1.54 } },
      }),
    ];
    const r = await show();
    expect(r.getByText('Récupérer : Secteur Zogona')).toBeTruthy();
    expect(r.getByText('à 0,8 km de vous')).toBeTruthy();
    expect(r.getByText('Livrer : Secteur Tampouy')).toBeTruthy();
    // Retrait chez un particulier : un cercle de zone, pas d'épingle.
    const p = mockMapProps.current as { markers: Array<{ kind: string }>; zones: Array<{ kind: string }> };
    expect(p.markers.some((m) => m.kind === 'pickup')).toBe(false);
    expect(p.zones.map((z) => z.kind)).toEqual(['pickup', 'dropoff']);
  });

  it('hors ligne ou déjà en course : aucune offre affichée', async () => {
    mockDriver.profile = driverProfile({ isOnline: false });
    const r = await show();
    expect(r.queryByTestId('offer-screen')).toBeNull();
    mockDriver.profile = driverProfile({ isOnline: true });
    mockDriver.currentOrder = order();
    await r.rerender(wrap(<OfferModal />));
    expect(r.queryByTestId('offer-screen')).toBeNull();
  });

  it('nouvelle offre : vibration sur téléphone', async () => {
    const vibrate = jest.spyOn(Vibration, 'vibrate');
    await show();
    expect(Platform.OS).not.toBe('web');
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('accepter : enregistre la course et ouvre l’écran de course', async () => {
    mockApi.acceptOffer.mockResolvedValue(order());
    const r = await show();
    await act(async () => fireEvent.press(r.getByTestId('accept-offer')));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/driver/order'));
    expect(mockApi.acceptOffer).toHaveBeenCalledWith('offer-1');
    expect(mockDriver.setCurrentOrder).toHaveBeenCalledWith(expect.objectContaining({ id: 'order-1' }));
    expect(mockDriver.removeOffer).toHaveBeenCalledWith('offer-1');
  });

  it('refuser : l’offre est refusée puis retirée', async () => {
    const r = await show();
    await act(async () => fireEvent.press(r.getByTestId('reject-offer')));
    await waitFor(() => expect(mockDriver.removeOffer).toHaveBeenCalledWith('offer-1'));
    expect(mockApi.rejectOffer).toHaveBeenCalledWith('offer-1');
    expect(mockApi.acceptOffer).not.toHaveBeenCalled();
  });

  it('OFFER_EXPIRED : l’offre est retirée sans navigation', async () => {
    mockApi.acceptOffer.mockRejectedValue(new ApiError(409, 'OFFER_EXPIRED', 'Offre expirée'));
    const r = await show();
    await act(async () => fireEvent.press(r.getByTestId('accept-offer')));
    await waitFor(() => expect(mockDriver.removeOffer).toHaveBeenCalledWith('offer-1'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('autre erreur : message affiché, offre conservée', async () => {
    mockApi.acceptOffer.mockRejectedValue(new ApiError(409, 'DRIVER_BUSY', 'Vous avez déjà une course.'));
    const r = await show();
    await act(async () => fireEvent.press(r.getByTestId('accept-offer')));
    await waitFor(() => expect(r.getByText('Vous avez une course en cours : terminez-la d’abord.')).toBeTruthy());
    expect(mockDriver.removeOffer).not.toHaveBeenCalled();
  });

  it('anneau du compte à rebours : normal, puis « dernières secondes » (rouge) pendant les 10 dernières secondes', async () => {
    const r = await show();
    const ring = () => r.getByTestId('offer-countdown').props as Record<string, unknown>;
    expect([ring()['aria-valuenow'], ring()['aria-valuetext'], ring()['aria-valuemax']]).toEqual([30, '30 s', 30]);
    await act(async () => {
      jest.advanceTimersByTime(21_500);
    });
    expect(r.getByText('9 s')).toBeTruthy();
    expect([ring()['aria-valuenow'], ring()['aria-valuetext']]).toEqual([9, '9 s, dernières secondes']);
    expect(r.getByTestId('offer-countdown-arc')).toBeTruthy();
  });

  it('accessibilité : l’anneau (barre de progression) est posé à côté du bouton « Accepter », pas autour', async () => {
    const r = await show();
    const ring = r.getByTestId('offer-countdown');
    expect(ring.props.accessibilityRole).toBe('progressbar');
    // Les enfants d'une barre de progression ne sont pas lus : le bouton n'en fait pas partie.
    expect(within(ring).queryByTestId('accept-offer')).toBeNull();
    // Le temps restant reste annoncé par le bouton lui-même.
    expect(r.getByTestId('accept-offer').props.accessibilityHint).toBe('Il reste 30 secondes pour accepter');
  });

  it('compte à rebours : l’anneau suit son horloge, « Accepter » n’est redessiné qu’à chaque seconde, la carte jamais', async () => {
    const r = await show();
    const mapBefore = mockMapProps.renders;
    const buttonBefore = mockButtonRenders['accept-offer'] ?? 0;
    const arc = () => r.getByTestId('offer-countdown-arc').props.d as string;
    const arcBefore = arc();
    // 3,1 s par pas de 50 ms : l'anneau (15 images par seconde, une toutes les 67 ms) est redessiné 46 fois.
    for (let i = 0; i < 62; i++) {
      await act(async () => {
        jest.advanceTimersByTime(50);
      });
    }
    expect(arc()).not.toBe(arcBefore);
    expect(r.getByText('27 s')).toBeTruthy();
    expect(mockMapProps.renders).toBe(mapBefore);
    // 30 → 29 → 28 → 27 : trois changements de seconde, pas 45 rendus.
    const buttonRenders = (mockButtonRenders['accept-offer'] ?? 0) - buttonBefore;
    expect(buttonRenders).toBeGreaterThanOrEqual(3);
    expect(buttonRenders).toBeLessThanOrEqual(4);
  });

  it('après 30 s : l’offre expire, « Accepter » est désactivé, puis l’offre disparaît', async () => {
    const r = await show();
    await act(async () => {
      jest.advanceTimersByTime(31_000);
    });
    expect(r.getByText('Expirée')).toBeTruthy();
    await act(async () => fireEvent.press(r.getByTestId('accept-offer')));
    expect(mockApi.acceptOffer).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
    expect(mockDriver.removeOffer).toHaveBeenCalledWith('offer-1');
  });
});
