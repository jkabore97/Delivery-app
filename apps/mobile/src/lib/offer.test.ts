import { AVERAGE_SPEED_KMH, distanceM, estimateMinutes } from '@yaar/shared';
import { driverProfile, offer, order } from '../__tests__/fixtures';
import { formatOfferEta, OFFER_ZONE_RADIUS_M, offerPickupEta, offerScene, visibleOffer } from './offer';

describe('offre : temps jusqu’au retrait', () => {
  it('distance de l’API à la vitesse moyenne du véhicule, arrondie à la minute supérieure', () => {
    // 2,1 km à moto (22 km/h) = 5,7 min → 6 min ; à vélo (12 km/h) = 10,5 → 11 min.
    expect(AVERAGE_SPEED_KMH.MOTO).toBe(22);
    expect(offerPickupEta(offer({ vehicleType: 'MOTO', pickup: { ...offer().pickup, distanceFromDriverKm: 2.1 } }))).toEqual({ minutes: 6, km: 2.1 });
    expect(offerPickupEta(offer({ vehicleType: 'BIKE', pickup: { ...offer().pickup, distanceFromDriverKm: 2.1 } }))?.minutes).toBe(11);
  });

  it('1 minute au moins (et non les 5 minutes d’estimateMinutes)', () => {
    const near = offer({ pickup: { ...offer().pickup, distanceFromDriverKm: 0.2 } });
    expect(offerPickupEta(near)?.minutes).toBe(1);
    expect(estimateMinutes('MOTO', 0.2)).toBe(5);
    expect(offerPickupEta(offer({ pickup: { ...offer().pickup, distanceFromDriverKm: 0 } }))?.minutes).toBe(1);
  });

  it('« ≈ N min · X km » ; rien si la distance est inconnue', () => {
    expect(formatOfferEta(offer())).toBe('≈ 4 min · 1,2 km');
    expect(formatOfferEta(offer({ pickup: { ...offer().pickup, distanceFromDriverKm: null } }))).toBeNull();
  });
});

describe('offre affichée', () => {
  it('en ligne et sans course : la plus récente ; sinon aucune', () => {
    const list = [offer({ id: 'o2' }), offer({ id: 'o1' })];
    expect(visibleOffer(driverProfile({ isOnline: true }), null, list)?.id).toBe('o2');
    expect(visibleOffer(driverProfile({ isOnline: false }), null, list)).toBeNull();
    expect(visibleOffer(driverProfile({ isOnline: true }), order(), list)).toBeNull();
    expect(visibleOffer(driverProfile({ isOnline: true }), null, [])).toBeNull();
    expect(visibleOffer(undefined, null, list)).toBeNull();
  });
});

describe('carte de l’offre (avant acceptation)', () => {
  const drop = { lat: 12.3395, lng: -1.517 };
  const business = offer({
    pickup: { ...offer().pickup, name: 'Pharmacie du Centre', location: { lat: 12.3686, lng: -1.5275 } },
    dropoff: { address: 'Secteur Patte d’Oie', zone: 'Secteur Patte d’Oie', approxLocation: drop },
  });

  it('livreur, entreprise à sa position exacte (initiales), zone de livraison en cercle, pointillé retrait → zone', () => {
    const s = offerScene(business, { lat: 12.372, lng: -1.515 });
    expect(s.markers.map((m) => [m.kind, m.initials ?? null])).toEqual([
      ['pickup', 'PC'],
      ['driver', null],
    ]);
    expect(s.zones).toEqual([{ id: 'offer-1:dropoff-zone', kind: 'dropoff', ...drop, radiusM: OFFER_ZONE_RADIUS_M }]);
    expect(s.lines).toEqual([{ id: 'offer-1:trip', kind: 'dashed', points: [{ lat: 12.3686, lng: -1.5275 }, drop] }]);
  });

  it('jamais de marqueur ni de point plus précis que la zone pour la livraison', () => {
    const s = offerScene(business, null);
    expect(s.markers.some((m) => m.kind === 'dropoff')).toBe(false);
    // Cadrage : le retrait, puis quatre points sur le cercle de la zone (à OFFER_ZONE_RADIUS_M de son centre).
    expect(s.fitPoints[0]).toEqual({ lat: 12.3686, lng: -1.5275 });
    const around = s.fitPoints.slice(1);
    expect(around).toHaveLength(4);
    for (const p of around) expect(Math.abs(distanceM(p, drop) - OFFER_ZONE_RADIUS_M)).toBeLessThan(2);
  });

  it('retrait chez un particulier : cercle de zone au lieu d’une épingle', () => {
    const s = offerScene(
      offer({
        orderType: 'PARCEL',
        pickup: { address: 'Secteur Zogona', name: null, distanceFromDriverKm: 0.8, zone: 'Secteur Zogona', approxLocation: { lat: 12.38, lng: -1.4986 } },
        dropoff: { address: 'Secteur Tampouy', zone: 'Secteur Tampouy', approxLocation: { lat: 12.4, lng: -1.54 } },
      }),
      null,
    );
    expect(s.markers).toEqual([]);
    expect(s.zones.map((z) => z.kind)).toEqual(['pickup', 'dropoff']);
    expect(s.lines[0]?.points).toEqual([{ lat: 12.38, lng: -1.4986 }, { lat: 12.4, lng: -1.54 }]);
  });

  it('ancienne API sans positions : seulement le livreur', () => {
    const s = offerScene(offer(), { lat: 12.37, lng: -1.52 });
    expect(s.markers.map((m) => m.kind)).toEqual(['driver']);
    expect(s.zones).toEqual([]);
    expect(s.lines).toEqual([]);
    expect(s.fitPoints).toEqual([{ lat: 12.37, lng: -1.52 }]);
  });
});
