import type { QuoteResponse } from '@yaar/shared';
import {
  amountsToCollect,
  buildDeliveryInput,
  canBusinessCancel,
  collectDetail,
  EMPTY_DELIVERY_FORM,
  nextStep,
  parseAmount,
  pickVehicle,
  recipientPays,
  sortActiveDeliveries,
  validateDestination,
  validatePackage,
  type DeliveryForm,
} from './delivery';
import { delivery, order, route } from '../__tests__/fixtures';

const quote = (available: Partial<Record<'BIKE' | 'MOTO' | 'CAR', boolean>> = {}): QuoteResponse => ({
  type: 'PARCEL',
  distanceKm: 4.4,
  itemsTotal: 0,
  pickup: { lat: 12.3686, lng: -1.5275, address: 'Centre', landmark: '' },
  dropoff: { lat: 12.3395, lng: -1.517, address: 'Patte d’Oie', landmark: '' },
  paymentMethods: ['CASH'],
  options: (['BIKE', 'MOTO', 'CAR'] as const).map((v, i) => ({
    vehicleType: v,
    available: available[v] ?? true,
    deliveryFee: [1200, 1500, 3050][i]!,
    total: [1200, 1500, 3050][i]!,
    estimatedMinutes: [22, 13, 15][i]!,
  })),
});

describe('montants à encaisser par le livreur', () => {
  it('destinataire qui paie la livraison : marchandise + frais à la livraison, rien au retrait', () => {
    const a = amountsToCollect(delivery({ feePaidBy: 'RECIPIENT', cashToCollect: 15000, deliveryFee: 1500 }));
    expect(a).toMatchObject({ atPickup: 0, atDropoff: 16500, goods: 15000, fee: 1500, business: true });
    expect(collectDetail(a)).toBe('Marchandise 15 000 FCFA + frais de livraison 1 500 FCFA, en espèces.');
  });

  it('entreprise qui paie : frais au retrait, marchandise seule à la livraison', () => {
    const a = amountsToCollect(delivery({ feePaidBy: 'SENDER', cashToCollect: 8000, deliveryFee: 1700 }));
    expect(a).toMatchObject({ atPickup: 1700, atDropoff: 8000 });
    expect(collectDetail(a)).toBe('Marchandise 8 000 FCFA, en espèces.');
    const nothing = amountsToCollect(delivery({ feePaidBy: 'SENDER', cashToCollect: 0 }));
    expect(nothing.atDropoff).toBe(0);
    expect(collectDetail(nothing)).toBeNull();
  });

  it('ancienne commande client : le total en espèces', () => {
    const a = amountsToCollect(order({ total: 4500 }));
    expect(a).toMatchObject({ atPickup: 0, atDropoff: 4500, business: false, feePaidBy: null });
  });

  it('montant payé par le destinataire pendant la saisie', () => {
    expect(recipientPays(1500, 'RECIPIENT', 15000)).toBe(16500);
    expect(recipientPays(1500, 'SENDER', 15000)).toBe(15000);
    expect(recipientPays(null, 'RECIPIENT', 0)).toBe(0);
  });
});

describe('nouvelle livraison : validation', () => {
  const pickup = { lat: 12.3686, lng: -1.5275 };
  const filled: DeliveryForm = {
    ...EMPTY_DELIVERY_FORM,
    dropoff: { lat: 12.3395, lng: -1.517, address: 'Patte d’Oie', landmark: 'Station Total' },
    recipientName: 'Awa Kaboré',
    recipientPhone: '70 11 22 33',
    packageDescription: '2 cartons',
    vehicleType: 'MOTO',
    feePaidBy: 'RECIPIENT',
    cashToCollect: '15 000',
  };

  it('étape 1 : épingle placée hors de l’entreprise, adresse, nom et téléphone', () => {
    expect(validateDestination(filled, pickup)).toEqual({});
    const empty = validateDestination(EMPTY_DELIVERY_FORM, pickup);
    expect(Object.keys(empty).sort()).toEqual(['address', 'dropoff', 'recipientName', 'recipientPhone']);
    const onBusiness = validateDestination({ ...filled, dropoff: { ...filled.dropoff!, lat: 12.36861, lng: -1.52751 } }, pickup);
    expect(onBusiness.dropoff).toMatch(/sur votre entreprise/);
    const defaultPin = validateDestination({ ...filled, dropoff: { ...filled.dropoff!, lat: 12.3714, lng: -1.5197 } }, pickup);
    expect(defaultPin.dropoff).toMatch(/Déplacez la carte/);
    expect(validateDestination({ ...filled, recipientPhone: '123' }, pickup).recipientPhone).toMatch(/8 chiffres/);
  });

  it('étape 2 : colis, véhicule disponible, montant entier', () => {
    expect(validatePackage(filled, quote())).toEqual({});
    expect(validatePackage({ ...filled, packageDescription: ' ' }, quote()).packageDescription).toBeTruthy();
    expect(validatePackage(filled, quote({ MOTO: false })).vehicleType).toMatch(/véhicule disponible/);
    expect(validatePackage(filled, null).vehicleType).toBeTruthy();
    expect(validatePackage({ ...filled, cashToCollect: '12,5' }, quote()).cashToCollect).toMatch(/Montant invalide/);
  });

  it('montants saisis', () => {
    expect(parseAmount('')).toBe(0);
    expect(parseAmount('15 000')).toBe(15000);
    expect(parseAmount('15 000 F')).toBe(15000);
    expect(parseAmount('2000001')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
  });

  it('corps de POST /business/deliveries validé par le schéma partagé (téléphone normalisé)', () => {
    const built = buildDeliveryInput(filled);
    expect(built).toEqual({
      ok: true,
      input: {
        dropoff: { lat: 12.3395, lng: -1.517, address: 'Patte d’Oie', landmark: 'Station Total' },
        recipientName: 'Awa Kaboré',
        recipientPhone: '+22670112233',
        recipientIsBusiness: false,
        packageDescription: '2 cartons',
        vehicleType: 'MOTO',
        feePaidBy: 'RECIPIENT',
        cashToCollect: 15000,
      },
    });
    const bad = buildDeliveryInput({ ...filled, recipientName: 'x'.repeat(81) });
    expect(bad).toEqual({ ok: false, error: expect.stringMatching(/^Nom du destinataire : /) });
  });

  it('véhicule par défaut : le choix courant s’il reste disponible, sinon la moto, sinon le premier', () => {
    expect(pickVehicle(quote(), 'CAR')).toBe('CAR');
    expect(pickVehicle(quote(), null)).toBe('MOTO');
    expect(pickVehicle(quote({ MOTO: false }), null)).toBe('BIKE');
    expect(pickVehicle(quote({ BIKE: false, MOTO: false, CAR: false }), null)).toBeNull();
  });
});

describe('liste et actions de l’entreprise', () => {
  it('en recherche d’abord, puis par étape ; annulation seulement avant le retrait', () => {
    const list = sortActiveDeliveries([
      delivery({ id: 'p', status: 'PICKED_UP' }),
      delivery({ id: 'a', status: 'ASSIGNED' }),
      delivery({ id: 's', status: 'SEARCHING_DRIVER' }),
    ]);
    expect(list.map((o) => o.id)).toEqual(['s', 'a', 'p']);
    expect(canBusinessCancel('SEARCHING_DRIVER')).toBe(true);
    expect(canBusinessCancel('ASSIGNED')).toBe(true);
    expect(canBusinessCancel('PICKED_UP')).toBe(false);
    expect(canBusinessCancel('DELIVERED')).toBe(false);
  });
});

describe('livreur : prochaine étape', () => {
  it('retrait : nom de l’entreprise, distance et durée restantes de l’itinéraire', () => {
    const o = delivery({
      status: 'ASSIGNED',
      route: route({ target: 'PICKUP', points: [[12.3735, -1.492], [12.3727, -1.505], [12.3686, -1.5275]], distanceM: 4000, durationS: 600 }),
    });
    const step = nextStep(o, { lat: 12.3727, lng: -1.505 })!;
    expect(step.title).toBe('Récupérer chez Pharmacie du Centre');
    expect(step.line).toMatch(/^Récupérer chez Pharmacie du Centre · \d,\d km · \d+ min$/);
    expect(step.distanceM!).toBeLessThan(4000);
  });

  it('livraison sans itinéraire : distance estimée depuis la position du livreur', () => {
    const step = nextStep(delivery({ route: null }), { lat: 12.3536, lng: -1.5191 })!;
    expect(step.line).toBe('Livrer à Awa Kaboré · 2,1 km · 6 min'); // 1,58 km à vol d’oiseau × 1,3, moto 22 km/h
  });

  it('sans position ni itinéraire : le titre seul', () => {
    expect(nextStep(delivery({ route: null }), null)!.line).toBe('Livrer à Awa Kaboré');
    expect(nextStep(delivery({ status: 'DELIVERED' }), null)).toBeNull();
  });
});
