import type { QuoteResponse } from '@yaar/shared';
import {
  amountsToCollect,
  buildDeliveryInput,
  businessStatusLabel,
  canBusinessCancel,
  collectDetail,
  EMPTY_DELIVERY_FORM,
  feePaymentText,
  goodsAmountText,
  historyFeeText,
  nextStep,
  offerCash,
  parseAmount,
  pickupFromStore,
  pickVehicle,
  recipientPays,
  sortActiveDeliveries,
  stageCollect,
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
    expect(collectDetail(a)).toBe('Marchandise 15\u202f000\u202fFCFA + frais de livraison 1\u202f500\u202fFCFA, en espèces.');
  });

  it('entreprise qui paie : frais au retrait, marchandise seule à la livraison', () => {
    const a = amountsToCollect(delivery({ feePaidBy: 'SENDER', cashToCollect: 8000, deliveryFee: 1700 }));
    expect(a).toMatchObject({ atPickup: 1700, atDropoff: 8000 });
    expect(collectDetail(a)).toBe('Marchandise 8\u202f000\u202fFCFA, en espèces.');
    const nothing = amountsToCollect(delivery({ feePaidBy: 'SENDER', cashToCollect: 0 }));
    expect(nothing.atDropoff).toBe(0);
    expect(collectDetail(nothing)).toBeNull();
  });

  it('montants détaillés par l’API (cashAtPickup / cashAtDelivery) utilisés tels quels quand ils sont présents', () => {
    const fromApi = amountsToCollect({ ...delivery({ feePaidBy: 'RECIPIENT', cashToCollect: 15000, deliveryFee: 1500 }), cashAtPickup: 0, cashAtDelivery: 16000 });
    expect(fromApi).toMatchObject({ atPickup: 0, atDropoff: 16000, goods: 15000 });
    const sender = amountsToCollect({ ...delivery({ feePaidBy: 'SENDER', cashToCollect: 8000, deliveryFee: 1700 }), cashAtPickup: 1800 });
    expect(sender).toMatchObject({ atPickup: 1800, atDropoff: 8000 });
    // Valeurs absentes ou invalides : calcul local.
    const bad = amountsToCollect({ ...delivery({ feePaidBy: 'SENDER', cashToCollect: 8000, deliveryFee: 1700 }), cashAtPickup: -5, cashAtDelivery: null });
    expect(bad).toMatchObject({ atPickup: 1700, atDropoff: 8000 });
  });

  it('espèces d’une offre : détail retrait / livraison de l’API, sinon le total seul', () => {
    expect(offerCash({ cashToCollect: 16500, cashAtPickup: 0, cashAtDelivery: 16500 })).toEqual({ atPickup: 0, atDelivery: 16500, total: 16500 });
    expect(offerCash({ cashToCollect: 9700, cashAtPickup: 1700, cashAtDelivery: 8000 })).toEqual({ atPickup: 1700, atDelivery: 8000, total: 9700 });
    expect(offerCash({ cashToCollect: 6600 })).toEqual({ atPickup: null, atDelivery: null, total: 6600 });
    expect(offerCash({ cashToCollect: 6600, cashAtPickup: 1100 })).toEqual({ atPickup: null, atDelivery: null, total: 6600 });
  });

  it('retrait envoyé à l’API : l’établissement choisi (adresse, repère, coordonnées arrondies)', () => {
    expect(pickupFromStore({ lat: 12.36861234, lng: -1.52751234, address: ' Avenue Kwame Nkrumah ', landmark: 'BCEAO' })).toEqual({
      lat: 12.368612,
      lng: -1.527512,
      address: 'Avenue Kwame Nkrumah',
      landmark: 'BCEAO',
    });
    expect(pickupFromStore(null)).toBeNull();
    expect(pickupFromStore({ lat: Number.NaN, lng: 1, address: 'x', landmark: '' })).toBeNull();
  });

  it('espèces de l’étape en cours (montant fixé au-dessus des boutons de la course) : retrait, puis livraison', () => {
    // Frais payés par l'entreprise : au retrait, les frais ; ensuite, la marchandise seule.
    const sender = amountsToCollect(delivery({ feePaidBy: 'SENDER', cashToCollect: 8000, deliveryFee: 1700 }));
    expect(stageCollect('ASSIGNED', sender)).toEqual({
      at: 'pickup',
      label: 'À encaisser au retrait',
      amount: 1700,
      detail: 'Frais de livraison payés au retrait, en espèces.',
    });
    expect(stageCollect('PICKED_UP', sender)).toEqual({ at: 'dropoff', label: 'À encaisser', amount: 8000, detail: 'Marchandise 8\u202f000\u202fFCFA, en espèces.' });
    // Frais payés par le destinataire : rien au retrait, marchandise + frais à la livraison.
    const recipient = amountsToCollect(delivery({ feePaidBy: 'RECIPIENT', cashToCollect: 15000, deliveryFee: 1500 }));
    expect(stageCollect('ASSIGNED', recipient)).toBeNull();
    expect(stageCollect('PICKED_UP', recipient)).toMatchObject({ at: 'dropoff', amount: 16500 });
    // Livraison déjà payée, ou course terminée : rien à afficher.
    expect(stageCollect('PICKED_UP', amountsToCollect(delivery({ feePaidBy: 'SENDER', cashToCollect: 0 })))).toBeNull();
    expect(stageCollect('DELIVERED', recipient)).toBeNull();
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

  it('retrait de l’établissement choisi envoyé avec la demande (prix et livreur du bon point de retrait)', () => {
    const pickup = { lat: 12.3712, lng: -1.5301, address: 'Boutique 2, Zogona', landmark: 'Face au marché' };
    const built = buildDeliveryInput(filled, pickup);
    expect(built.ok && built.input.pickup).toEqual(pickup);
    expect(buildDeliveryInput(filled, null).ok && 'pickup' in (buildDeliveryInput(filled, null) as { input: object }).input).toBe(false);
  });

  it('véhicule par défaut : le choix courant s’il reste disponible, sinon la moto, sinon le premier', () => {
    expect(pickVehicle(quote(), 'CAR')).toBe('CAR');
    expect(pickVehicle(quote(), null)).toBe('MOTO');
    expect(pickVehicle(quote({ MOTO: false }), null)).toBe('BIKE');
    expect(pickVehicle(quote({ BIKE: false, MOTO: false, CAR: false }), null)).toBeNull();
  });
});

describe('liste et actions de l’entreprise', () => {
  it('colis en route d’abord (par heure d’arrivée), puis livreurs vers le retrait, puis recherches regroupées ; annulation avant le retrait', () => {
    const list = sortActiveDeliveries([
      delivery({ id: 's1', status: 'SEARCHING_DRIVER', driver: null, route: null, etaMinutes: null, createdAt: '2026-11-08T14:00:00.000Z' }),
      delivery({ id: 'a', status: 'ASSIGNED', etaMinutes: 20 }),
      delivery({ id: 'p-late', status: 'PICKED_UP', etaMinutes: 14 }),
      delivery({ id: 's2', status: 'SEARCHING_DRIVER', driver: null, route: null, etaMinutes: null, createdAt: '2026-11-08T14:10:00.000Z' }),
      delivery({ id: 'p-soon', status: 'PICKED_UP', etaMinutes: 3 }),
      delivery({ id: 'a-soon', status: 'ASSIGNED', etaMinutes: 12 }),
    ]);
    expect(list.map((o) => o.id)).toEqual(['p-soon', 'p-late', 'a-soon', 'a', 's2', 's1']);
    expect(canBusinessCancel('SEARCHING_DRIVER')).toBe(true);
    expect(canBusinessCancel('ASSIGNED')).toBe(true);
    expect(canBusinessCancel('PICKED_UP')).toBe(false);
    expect(canBusinessCancel('DELIVERED')).toBe(false);
  });

  it('un seul nom pour la recherche d’un livreur (puce des cartes)', () => {
    expect(businessStatusLabel('SEARCHING_DRIVER').label).toBe('RECHERCHE D’UN LIVREUR');
    expect(businessStatusLabel('PENDING').label).toBe('RECHERCHE D’UN LIVREUR');
  });
});

describe('phrases d’argent vraies à chaque étape', () => {
  it('frais : « à payer » avant, « payés » après ; annulée : aucuns frais, sans payeur', () => {
    expect(feePaymentText('SEARCHING_DRIVER', 'SENDER')).toBe('À payer par l’entreprise au retrait du colis');
    expect(feePaymentText('ASSIGNED', 'SENDER')).toBe('À payer par l’entreprise au retrait du colis');
    expect(feePaymentText('PICKED_UP', 'SENDER')).toBe('Payés par l’entreprise au retrait du colis');
    expect(feePaymentText('DELIVERED', 'SENDER')).toBe('Payés par l’entreprise au retrait du colis');
    expect(feePaymentText('ASSIGNED', 'RECIPIENT')).toBe('À payer par le destinataire à la livraison');
    expect(feePaymentText('PICKED_UP', 'RECIPIENT')).toBe('À payer par le destinataire à la livraison');
    expect(feePaymentText('DELIVERED', 'RECIPIENT')).toBe('Payés par le destinataire à la livraison');
    for (const payer of ['SENDER', 'RECIPIENT', null] as const) expect(feePaymentText('CANCELLED', payer)).toBe('Aucuns frais à payer');
    expect(feePaymentText('DELIVERED', null)).toBeNull();
  });

  it('historique : frais et payeur d’une livraison livrée ; annulée : « Annulée · aucuns frais »', () => {
    expect(historyFeeText(delivery({ status: 'DELIVERED', deliveryFee: 1500, feePaidBy: 'RECIPIENT' }))).toMatch(/^livraison 1\s500\sFCFA payée par le destinataire$/);
    expect(historyFeeText(delivery({ status: 'DELIVERED', deliveryFee: 2300, feePaidBy: 'SENDER' }))).toMatch(/payée par l’entreprise$/);
    expect(historyFeeText(delivery({ status: 'CANCELLED', deliveryFee: 2300, feePaidBy: 'SENDER' }))).toBe('Annulée · aucuns frais');
  });

  it('marchandise : jamais « reversé » (reversement non suivi) ; « à reverser » une fois livrée', () => {
    expect(goodsAmountText('PICKED_UP').label).toBe('Pour votre entreprise');
    expect(goodsAmountText('DELIVERED').label).toBe('À reverser à votre entreprise');
    for (const s of ['SEARCHING_DRIVER', 'ASSIGNED', 'PICKED_UP', 'DELIVERED'] as const) {
      const t = goodsAmountText(s);
      expect(`${t.label} ${t.detail}`).not.toMatch(/\b[Rr]eversée? à votre|a été reversé/);
    }
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
