import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { QuoteResponse, StoreDto } from '@yaar/shared';
import { ApiError } from '../lib/api';
import NewDeliveryScreen from '../app/business/nouvelle';
import { businessStore, delivery } from './fixtures';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn(), canGoBack: () => true, push: jest.fn() },
}));

const QUOTE: QuoteResponse = {
  type: 'PARCEL',
  distanceKm: 4.4,
  itemsTotal: 0,
  pickup: { lat: 12.3686, lng: -1.5275, address: 'Avenue Kwame Nkrumah', landmark: '' },
  dropoff: { lat: 12.3395, lng: -1.517, address: 'Patte d’Oie', landmark: '' },
  paymentMethods: ['CASH'],
  options: [
    { vehicleType: 'BIKE', available: true, deliveryFee: 1200, total: 1200, estimatedMinutes: 22 },
    { vehicleType: 'MOTO', available: true, deliveryFee: 1500, total: 1500, estimatedMinutes: 13 },
    { vehicleType: 'CAR', available: false, deliveryFee: 3050, total: 3050, estimatedMinutes: 15 },
  ],
};
const mockApi = { quoteDelivery: jest.fn(async () => QUOTE), createDelivery: jest.fn() };
jest.mock('../state/auth', () => ({ useApi: () => mockApi }));

const mockBusiness: { store: StoreDto | null; stores: StoreDto[] | undefined } = { store: null, stores: undefined };
jest.mock('../state/business', () => ({
  useBusiness: () => mockBusiness,
  isBusinessApproved: (s: StoreDto | null) => !!s && s.approvalStatus === 'APPROVED',
}));

// Carte du choix d'adresse simulée : un bouton « déplace » la carte jusqu'à Patte d'Oie.
const mockCenterOn = jest.fn();
jest.mock('../components/map/PickerMap', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  const { forwardRef: fr, useImperativeHandle: uih } = jest.requireActual<typeof import('react')>('react');
  return {
    PickerMap: fr(function PickerMapStub(
      p: { onCenterChange: (lat: number, lng: number) => void; onMoveStart?: () => void },
      ref: unknown,
    ) {
      uih(ref as never, () => ({ centerOn: mockCenterOn }));
      return (
        <RN.Pressable
          testID="simulate-move"
          onPress={() => {
            p.onMoveStart?.();
            p.onCenterChange(12.3395, -1.517);
          }}
        />
      );
    }),
  };
});

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const STORE_PICKUP = { lat: 12.3686, lng: -1.5275, address: 'Avenue Kwame Nkrumah', landmark: 'En face de la BCEAO' };
const wrap = (el: ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{el}</SafeAreaProvider>;

describe('Nouvelle livraison (entreprise)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBusiness.store = businessStore();
    mockBusiness.stores = [businessStore()];
  });

  it('étape 1 : épingle, destinataire et téléphone obligatoires ; quartier pré-rempli', async () => {
    const r = await render(wrap(<NewDeliveryScreen />));
    await fireEvent.press(r.getByTestId('wizard-next'));
    expect(r.getByText('Déplacez la carte pour placer l’épingle sur le lieu de livraison.')).toBeTruthy();
    expect(r.getByText('Nom du destinataire requis.')).toBeTruthy();
    expect(mockApi.quoteDelivery).not.toHaveBeenCalled();

    await fireEvent.press(r.getByTestId('simulate-move'));
    expect(r.getByTestId('dropoff-address').props.value).toBe('Patte d’Oie');
    expect(r.getByTestId('pin-bubble')).toHaveTextContent(/Patte d’Oie/);
    // Téléphone courant (390 × 844) : bulle au-dessus de l'épingle.
    expect(StyleSheet.flatten(r.getByTestId('pin-bubble').props.style)).toMatchObject({ bottom: '50%' });
    await fireEvent.changeText(r.getByTestId('recipient-name'), 'Awa Kaboré');
    await fireEvent.changeText(r.getByTestId('recipient-phone'), '7011');
    await fireEvent.press(r.getByTestId('wizard-next'));
    expect(r.getByText('Numéro invalide : 8 chiffres (ex. 70 12 34 56).')).toBeTruthy();
    expect(r.queryByText('Colis et prix')).toBeNull();
  });

  it('suggestion de quartier : recentre la carte et remplit l’adresse', async () => {
    const r = await render(wrap(<NewDeliveryScreen />));
    await fireEvent.press(r.getByText('Zogona'));
    expect(mockCenterOn).toHaveBeenCalledWith(12.3805, -1.4975, 15);
    expect(r.getByTestId('dropoff-address').props.value).toBe('Zogona');
  });

  it('parcours complet : devis par véhicule, qui paie, montant à encaisser, demande puis suivi', async () => {
    mockApi.createDelivery.mockResolvedValue(delivery({ id: 'del-9', status: 'SEARCHING_DRIVER' }));
    const r = await render(wrap(<NewDeliveryScreen />));
    await fireEvent.press(r.getByTestId('simulate-move'));
    await fireEvent.changeText(r.getByTestId('dropoff-address'), 'Patte d’Oie, rue 15.23');
    await fireEvent.changeText(r.getByTestId('dropoff-landmark'), 'Station Total');
    await fireEvent.changeText(r.getByTestId('recipient-name'), 'Awa Kaboré');
    await fireEvent.changeText(r.getByTestId('recipient-phone'), '70 11 22 33');
    await fireEvent.press(r.getByTestId('wizard-next'));

    // Étape 2 : devis, retrait = l'établissement choisi par l'entreprise (envoyé à l'API).
    expect(r.getByText('Colis et prix')).toBeTruthy();
    await waitFor(() => expect(r.getByTestId('vehicle-MOTO')).toBeTruthy());
    expect(mockApi.quoteDelivery).toHaveBeenCalledWith({
      pickup: STORE_PICKUP,
      dropoff: { lat: 12.3395, lng: -1.517, address: 'Patte d’Oie, rue 15.23', landmark: 'Station Total' },
    });
    expect(r.getByTestId('vehicle-MOTO')).toHaveTextContent(/1 500 F/);
    expect(r.getByTestId('vehicle-CAR')).toHaveTextContent(/Indisponible/);
    await fireEvent.press(r.getByTestId('wizard-next'));
    expect(r.getByText('Décrivez le colis (ex. « 2 cartons », « documents »).')).toBeTruthy();

    await fireEvent.changeText(r.getByTestId('package-description'), '2 boîtes de médicaments');
    await fireEvent.press(r.getByTestId('payer-RECIPIENT'));
    await fireEvent.changeText(r.getByTestId('cash-to-collect'), '15 000');
    expect(r.getByTestId('recipient-pays')).toHaveTextContent(/16 500 FCFA/);
    await fireEvent.press(r.getByTestId('wizard-next'));

    // Étape 3 : récapitulatif.
    expect(r.getByText('Récapitulatif')).toBeTruthy();
    expect(r.getByTestId('summary-recipient-pays')).toHaveTextContent(/16 500 FCFA/);
    expect(r.getByText('Pharmacie du Centre')).toBeTruthy();
    await fireEvent.press(r.getByTestId('request-driver'));
    expect(mockApi.createDelivery).toHaveBeenCalledWith({
      pickup: STORE_PICKUP,
      dropoff: { lat: 12.3395, lng: -1.517, address: 'Patte d’Oie, rue 15.23', landmark: 'Station Total' },
      recipientName: 'Awa Kaboré',
      recipientPhone: '+22670112233',
      recipientIsBusiness: false,
      packageDescription: '2 boîtes de médicaments',
      vehicleType: 'MOTO',
      feePaidBy: 'RECIPIENT',
      cashToCollect: 15000,
    });
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/business/livraison/[id]', params: { id: 'del-9', created: '1' } });
  });

  it('erreur de l’API à la demande : message affiché, on reste sur le récapitulatif', async () => {
    // Réponse réelle de l'API (services/deliveries.ts, businessStore) : 403 STORE_NOT_APPROVED.
    mockApi.createDelivery.mockRejectedValue(
      new ApiError(403, 'STORE_NOT_APPROVED', 'Votre entreprise doit être validée par Yaar avant de demander une livraison'),
    );
    const r = await render(wrap(<NewDeliveryScreen />));
    await fireEvent.press(r.getByTestId('simulate-move'));
    await fireEvent.changeText(r.getByTestId('recipient-name'), 'Awa');
    await fireEvent.changeText(r.getByTestId('recipient-phone'), '70112233');
    await fireEvent.press(r.getByTestId('wizard-next'));
    await waitFor(() => expect(r.getByTestId('vehicle-MOTO')).toBeTruthy());
    await fireEvent.changeText(r.getByTestId('package-description'), 'Documents');
    await fireEvent.press(r.getByTestId('wizard-next'));
    await fireEvent.press(r.getByTestId('request-driver'));
    expect(r.getByText(/Votre entreprise n’est pas encore validée par Yaar/)).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('entreprise en attente de validation : bandeau et demande impossible', async () => {
    mockBusiness.store = businessStore({ approvalStatus: 'PENDING' });
    const r = await render(wrap(<NewDeliveryScreen />));
    expect(r.getByText('⏳ Entreprise en attente de validation')).toBeTruthy();
    // Jusqu'au récapitulatif : le bouton « Demander un livreur » reste désactivé, aucune demande n'est envoyée.
    await fireEvent.press(r.getByTestId('simulate-move'));
    await fireEvent.changeText(r.getByTestId('recipient-name'), 'Awa');
    await fireEvent.changeText(r.getByTestId('recipient-phone'), '70112233');
    await fireEvent.press(r.getByTestId('wizard-next'));
    await waitFor(() => expect(r.getByTestId('vehicle-MOTO')).toBeTruthy());
    await fireEvent.changeText(r.getByTestId('package-description'), 'Documents');
    await fireEvent.press(r.getByTestId('wizard-next'));
    expect(r.getByText('Récapitulatif')).toBeTruthy();
    expect(r.getByTestId('request-driver').props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(r.getByTestId('request-driver'));
    expect(mockApi.createDelivery).not.toHaveBeenCalled();
  });

  it('petit téléphone (360 × 640) : la bulle de l’épingle passe sous l’épingle (pas sur « 1/3 »)', async () => {
    const small = { frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
    const dims = jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ width: 360, height: 640, scale: 2, fontScale: 1 });
    const r = await render(<SafeAreaProvider initialMetrics={small}><NewDeliveryScreen /></SafeAreaProvider>);
    expect(StyleSheet.flatten(r.getByTestId('pin-bubble').props.style)).toMatchObject({ top: '50%', marginTop: 12 });
    dims.mockRestore();
  });

  it('pas encore de profil d’entreprise : renvoi vers le profil', async () => {
    mockBusiness.store = null;
    mockBusiness.stores = [];
    const r = await render(wrap(<NewDeliveryScreen />));
    expect(r.getByText('Créez d’abord le profil de votre entreprise (adresse de retrait).')).toBeTruthy();
  });
});
