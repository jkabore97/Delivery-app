import {
  arrivalSummary,
  buildScene,
  deliveryEtaLine,
  estimateArrivalMinutes,
  estimatePickupMinutes,
  NUDGE_AT_PICKUP_M,
  orderSceneInput,
  overviewScene,
  stageOf,
  trackingSceneInput,
} from './liveScene';
import { delivery, route, tracking } from '../__tests__/fixtures';

const kinds = (s: ReturnType<typeof buildScene>) => s.markers.map((m) => `${m.kind}${m.pulse ? '*' : ''}`);

describe('stageOf', () => {
  it('associe chaque statut à une étape de carte', () => {
    expect(stageOf('SEARCHING_DRIVER')).toBe('searching');
    expect(stageOf('ASSIGNED')).toBe('toPickup');
    expect(stageOf('PICKED_UP')).toBe('toDropoff');
    expect(stageOf('DELIVERED')).toBe('delivered');
    expect(stageOf('CANCELLED')).toBe('cancelled');
    expect(stageOf('PENDING')).toBe('pending');
  });
});

describe('buildScene', () => {
  it('recherche d’un livreur : entreprise avec radar + destinataire, reliés en pointillés, cadrage des deux', () => {
    const s = buildScene(trackingSceneInput(tracking({ status: 'SEARCHING_DRIVER', driver: null, route: null, etaMinutes: null })));
    expect(s.stage).toBe('searching');
    expect(kinds(s)).toEqual(['pickup*', 'dropoff*']);
    expect(s.lines.map((l) => l.kind)).toEqual(['dashed']);
    expect(s.fitPoints).toHaveLength(2);
    expect(s.driver).toBeNull();
  });

  it('livreur en route vers l’entreprise : itinéraire PICKUP rogné au livreur, étape suivante en pointillés', () => {
    const o = delivery({ status: 'ASSIGNED', route: route({ target: 'PICKUP', points: [[12.373, -1.49], [12.37, -1.51], [12.3686, -1.5275]] }) });
    const s = buildScene(orderSceneInput(o));
    expect(s.target).toBe('PICKUP');
    expect(kinds(s)).toEqual(['pickup', 'dropoff*', 'driver']);
    const r = s.lines.find((l) => l.kind === 'route');
    expect(r?.trimToMarkerId).toBe('del-1:driver');
    expect(s.lines.map((l) => l.id)).toEqual(['del-1:route', 'del-1:next']);
    // Cadrage : livreur + entreprise (+ reste du tracé), pas le destinataire.
    expect(s.fitPoints[0]).toMatchObject({ lat: 12.3627, lng: -1.521 });
    expect(s.fitPoints[1]).toMatchObject({ lat: 12.3686, lng: -1.5275 });
    expect(s.fitPoints.some((p) => p.lat === 12.3395)).toBe(false);
  });

  it('itinéraire périmé (autre cible) : ligne droite en pointillés depuis le livreur', () => {
    const s = buildScene(orderSceneInput(delivery({ status: 'ASSIGNED', route: route({ target: 'DROPOFF' }) })));
    expect(s.route).toBeNull();
    expect(s.lines[0]).toMatchObject({ kind: 'dashed', trimToMarkerId: 'del-1:driver' });
  });

  it('itinéraire de secours (ligne droite, service indisponible) : dessiné en pointillés', () => {
    const s = buildScene(orderSceneInput(delivery({ route: route({ source: 'straight', points: [[12.3627, -1.521], [12.3395, -1.517]] }) })));
    expect(s.lines).toEqual([expect.objectContaining({ id: 'del-1:route', kind: 'dashed', trimToMarkerId: 'del-1:driver' })]);
  });

  it('colis récupéré : plus de marqueur entreprise, itinéraire vers le destinataire, cap du livreur conservé', () => {
    const s = buildScene(orderSceneInput(delivery()));
    expect(kinds(s)).toEqual(['dropoff*', 'driver']);
    expect(s.markers.find((m) => m.kind === 'driver')).toMatchObject({ heading: 170, vehicleType: 'MOTO' });
    expect(s.lines).toEqual([expect.objectContaining({ kind: 'route', trimToMarkerId: 'del-1:driver' })]);
    // Cadrage sur le reste du tracé : la partie déjà parcourue (au nord du livreur) n'est pas cadrée.
    expect(Math.max(...s.fitPoints.map((p) => p.lat))).toBeLessThanOrEqual(12.3627);
  });

  it('horodatage du relevé GPS transmis au marqueur du livreur (durée réelle du glissement)', () => {
    const s = buildScene(trackingSceneInput(tracking()));
    expect(s.markers.find((m) => m.kind === 'driver')?.fixAt).toBe(Date.parse('2026-11-08T14:10:00.000Z'));
    const live = buildScene(orderSceneInput(delivery(), { lat: 12.35, lng: -1.52, heading: null, at: 1234 }));
    expect(live.markers.find((m) => m.kind === 'driver')?.fixAt).toBe(1234);
  });

  it('page du destinataire, livreur en route vers l’entreprise : son épingle reste dans le cadre', () => {
    const t = tracking({ status: 'ASSIGNED', pickedUpAt: null, route: route({ target: 'PICKUP', points: [[12.3627, -1.521], [12.3686, -1.5275]] }) });
    const s = buildScene(trackingSceneInput(t));
    expect(s.fitPoints).toContainEqual({ lat: 12.3395, lng: -1.517 });
    // Côté entreprise, le cadrage reste livreur + retrait.
    const b = buildScene(orderSceneInput(delivery({ status: 'ASSIGNED', route: t.route })));
    expect(b.fitPoints.some((p) => p.lat === 12.3395)).toBe(false);
  });

  it('livreur arrivé chez l’entreprise : marqueur décalé pour ne pas cacher celui de l’entreprise', () => {
    const at = (lat: number, lng: number) =>
      buildScene(orderSceneInput(delivery({ status: 'ASSIGNED', route: null }), { lat, lng, heading: null })).markers.find((m) => m.kind === 'driver');
    expect(at(12.36865, -1.52752)?.nudge).toBe(true); // ~6 m
    expect(at(12.3627, -1.521)?.nudge).toBe(false); // ~900 m
    expect(NUDGE_AT_PICKUP_M).toBeLessThan(60);
    // Colis récupéré : plus de marqueur entreprise, pas de décalage.
    expect(buildScene(orderSceneInput(delivery(), { lat: 12.36865, lng: -1.52752 })).markers.find((m) => m.kind === 'driver')?.nudge).toBe(false);
  });

  it('position plus récente (socket) prioritaire sur la dernière position de l’API', () => {
    const s = buildScene(orderSceneInput(delivery(), { lat: 12.35, lng: -1.52, heading: 200 }));
    expect(s.driver).toMatchObject({ lat: 12.35, heading: 200 });
  });

  it('livrée : le destinataire seul ; annulée : sans livreur', () => {
    expect(kinds(buildScene(trackingSceneInput(tracking({ status: 'DELIVERED' }))))).toEqual(['dropoff']);
    const c = buildScene(orderSceneInput(delivery({ status: 'CANCELLED' })));
    expect(kinds(c)).toEqual(['pickup', 'dropoff']);
    expect(c.lines).toEqual([]);
  });
});

describe('overviewScene', () => {
  it('un seul marqueur entreprise (radar si une livraison attend), destinataires et livreurs', () => {
    const business = { lat: 12.3686, lng: -1.5275 };
    const scene = overviewScene(business, [
      delivery({ id: 'a', status: 'SEARCHING_DRIVER', driver: null, route: null }),
      delivery({ id: 'b' }),
    ]);
    expect(scene.markers.filter((m) => m.kind === 'pickup')).toEqual([expect.objectContaining({ id: 'business', pulse: true })]);
    expect(scene.markers.filter((m) => m.kind === 'dropoff')).toHaveLength(2);
    expect(scene.markers.filter((m) => m.kind === 'driver').map((m) => m.id)).toEqual(['b:driver']);
    expect(scene.fitPoints.length).toBeGreaterThanOrEqual(4);
  });
});

describe('estimateArrivalMinutes', () => {
  it('estimation de l’API en priorité, sinon reste de l’itinéraire', () => {
    const input = orderSceneInput(delivery());
    const scene = buildScene(input);
    expect(estimateArrivalMinutes(scene, input, 9)).toBe(9);
    const local = estimateArrivalMinutes(scene, input, null)!;
    expect(local).toBeGreaterThan(3);
    expect(local).toBeLessThan(13); // 780 s pour le tracé complet, livreur déjà avancé
  });

  it('hors course : null', () => {
    const input = trackingSceneInput(tracking({ status: 'SEARCHING_DRIVER', driver: null }));
    expect(estimateArrivalMinutes(buildScene(input), input, 12)).toBeNull();
  });
});

describe('arrivée au retrait (entreprise, livreur en route vers elle)', () => {
  const assigned = (over: Parameters<typeof delivery>[0] = {}) =>
    delivery({
      status: 'ASSIGNED',
      etaMinutes: 25,
      route: route({ target: 'PICKUP', distanceM: 2000, durationS: 240, points: [[12.3627, -1.521], [12.3686, -1.5275]] }),
      ...over,
    });

  it('durée restante de l’itinéraire vers le retrait, pas l’estimation de livraison de l’API', () => {
    const input = orderSceneInput(assigned());
    const scene = buildScene(input);
    expect(estimatePickupMinutes(scene, input)).toBe(4);
    expect(estimateArrivalMinutes(scene, input, 25)).toBe(25);
  });

  it('sans itinéraire : distance estimée ; déjà sur place : 0 ; colis récupéré : null', () => {
    const far = orderSceneInput(assigned({ route: null }));
    expect(estimatePickupMinutes(buildScene(far), far)).toBeGreaterThanOrEqual(1);
    const there = orderSceneInput(assigned({ route: null }), { lat: 12.36865, lng: -1.52752 });
    expect(estimatePickupMinutes(buildScene(there), there)).toBe(0);
    const picked = orderSceneInput(delivery());
    expect(estimatePickupMinutes(buildScene(picked), picked)).toBeNull();
  });

  it('textes : ligne de livraison sous l’arrivée au retrait, et cartes de la liste', () => {
    const now = Date.parse('2026-11-08T14:20:00.000Z');
    expect(deliveryEtaLine(25, now, 'Awa', 4)).toBe('Livraison chez Awa prévue vers 14:45');
    expect(deliveryEtaLine(25, now, 'Bureau Faso Conseil')).toBe('Livraison chez Bureau Faso Conseil prévue vers 14:45');
    expect(deliveryEtaLine(null, now, 'Awa')).toBeNull();
    expect(arrivalSummary(assigned(), now)).toBe('Au retrait dans 4 min · livraison vers 14:45');
    expect(arrivalSummary(delivery({ etaMinutes: 9 }), now)).toBe('Arrivée vers 14:29 · dans 9 min');
    expect(arrivalSummary(delivery({ status: 'SEARCHING_DRIVER', driver: null, route: null }), now)).toBeNull();
  });
});
