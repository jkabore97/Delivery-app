import { ORDER_STATUSES } from '@yaar/shared';
import { estimateEtaMinutes, isDriverTracked, progressSteps, sellerBadge, trackingTitle } from './orderProgress';

describe('progressSteps', () => {
  it('FOOD en livraison : acceptée et préparée faites, « En route » validée, livrée en cours', () => {
    const steps = progressSteps('FOOD', 'PICKED_UP');
    expect(steps.map((s) => s.done)).toEqual([true, true, true, false]);
    expect(steps.find((s) => s.current)?.label).toBe('Livrée');
  });

  it('FOOD livreur affecté : étape courante « En route »', () => {
    const steps = progressSteps('FOOD', 'ASSIGNED');
    expect(steps.map((s) => s.done)).toEqual([true, true, false, false]);
    expect(steps.find((s) => s.current)?.label).toBe('En route');
  });

  it('PARCEL en recherche de livreur', () => {
    const steps = progressSteps('PARCEL', 'SEARCHING_DRIVER');
    expect(steps.every((s) => !s.done)).toBe(true);
    expect(steps[0]?.current).toBe(true);
  });

  it('commande annulée : aucune étape courante', () => {
    expect(progressSteps('FOOD', 'CANCELLED').some((s) => s.current)).toBe(false);
  });

  it('a un titre et une pastille pour chaque statut', () => {
    for (const s of ORDER_STATUSES) {
      expect(trackingTitle(s)).toBeTruthy();
      expect(sellerBadge(s).label).toBeTruthy();
    }
  });

  it('suit le livreur uniquement pendant ASSIGNED / PICKED_UP', () => {
    expect(ORDER_STATUSES.filter(isDriverTracked)).toEqual(['ASSIGNED', 'PICKED_UP']);
  });
});

describe('estimateEtaMinutes', () => {
  const pickup = { lat: 12.3714, lng: -1.5197, address: 'Centre', landmark: 'Rond-point' };
  const dropoff = { lat: 12.3714, lng: -1.4997, address: 'Est', landmark: 'Pharmacie' };
  const base = { vehicleType: 'MOTO' as const, pickup, dropoff, etaMinutes: 12 };

  it('hors suivi : null', () => {
    expect(estimateEtaMinutes({ ...base, status: 'SEARCHING_DRIVER' }, pickup)).toBeNull();
    expect(estimateEtaMinutes({ ...base, status: 'DELIVERED' }, pickup)).toBeNull();
  });

  it('PICKED_UP : livreur → livraison, à la vitesse moyenne du véhicule', () => {
    // ~2,17 km à vol d'oiseau × 1,3 ≈ 2,8 km ; moto 22 km/h ≈ 7,7 min → 8
    expect(estimateEtaMinutes({ ...base, status: 'PICKED_UP' }, pickup)).toBe(8);
  });

  it('ASSIGNED : passe par le point de retrait', () => {
    const atDropoff = { lat: dropoff.lat, lng: dropoff.lng };
    // livreur au point de livraison : aller au retrait puis revenir ≈ 2 × 2,8 km
    expect(estimateEtaMinutes({ ...base, status: 'ASSIGNED' }, atDropoff)).toBe(16);
  });

  it('sans position live : estimation de l’API', () => {
    expect(estimateEtaMinutes({ ...base, status: 'ASSIGNED' }, null)).toBe(12);
    expect(estimateEtaMinutes({ ...base, status: 'ASSIGNED', etaMinutes: undefined }, null)).toBeNull();
  });
});
