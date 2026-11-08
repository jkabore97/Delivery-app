import { buildScene, estimateArrivalMinutes, orderSceneInput, overviewScene, stageOf, trackingSceneInput } from './liveScene';
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
