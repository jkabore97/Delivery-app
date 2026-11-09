import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { distanceM } from '@yaar/shared';
import { MapSceneController } from '../src/lib/map/controller';
import type { BaseMap, Maplibre } from '../src/lib/map/engine';
import { createMarkerElement, setDriverHeading, updateMarkerElement } from '../src/lib/map/markers';
import {
  buildDeliveryScene,
  buildLiveScene,
  legLine,
  neighbourhoodLabels,
  resolveLines,
  sceneKey,
  scenePoints,
} from '../src/lib/map/scene';
import type { MapScene, SceneMarker } from '../src/lib/map/types';
import { b2bMapData, businessOrder } from './fixtures';

const byId = (scene: MapScene, id: string) => scene.markers.find((m) => m.id === id);
const lineById = (scene: MapScene, id: string) => scene.lines.find((l) => l.id === id);

describe('Carte en direct : marqueurs', () => {
  const scene = buildLiveScene(b2bMapData, 'ALL');

  it('entreprises en carrés orange (fermée : estompée), destinataires des livraisons en cours en épingles', () => {
    expect(scene.markers.filter((m) => m.kind === 'business').map((m) => m.id)).toEqual([
      'business:st-verdoyant',
      'business:st-tech',
      'business:st-mode',
      'business:st-pissy',
    ]);
    expect(byId(scene, 'business:st-pissy')).toMatchObject({ dimmed: true, title: 'Grillades de Pissy (fermée)' });
    expect(byId(scene, 'business:st-tech')?.dimmed).toBe(false);
    expect(scene.markers.filter((m) => m.kind === 'dropoff').map((m) => m.id)).toEqual([
      'dropoff:ord-1003',
      'dropoff:ord-1004',
      'dropoff:ord-1005',
    ]);
    expect(byId(scene, 'dropoff:ord-1004')).toMatchObject({ lat: 12.375, lng: -1.47, orderId: 'ord-1004' });
  });

  it('livraison en attente : anneaux pulsés au retrait, numéro cliquable et trajet à venir en pointillés discrets', () => {
    expect(scene.markers.filter((m) => m.kind === 'search')).toEqual([
      expect.objectContaining({ id: 'search:ord-1005', lat: 12.3805, lng: -1.4975, label: '#1005', orderId: 'ord-1005' }),
    ]);
    expect(lineById(scene, 'next:ord-1005')).toEqual({
      id: 'next:ord-1005',
      kind: 'next',
      points: [
        { lat: 12.3805, lng: -1.4975, address: 'Zogona' },
        { lat: 12.3765, lng: -1.4855, address: 'Wemtenga' },
      ],
    });
    // Le retrait est à l'adresse d'une entreprise : pas de second carré.
    expect(scene.markers.some((m) => m.id.startsWith('pickup:'))).toBe(false);
  });

  it('livreurs : pastille libre / en livraison, cap, véhicule, clic vers la fiche', () => {
    expect(byId(scene, 'driver:drv-issouf')).toMatchObject({ kind: 'driver', busy: true, heading: 135, vehicleType: 'MOTO', driverId: 'drv-issouf' });
    expect(byId(scene, 'driver:drv-abdoul')).toMatchObject({ busy: true, heading: null, vehicleType: 'CAR' });
    expect(byId(scene, 'driver:drv-fati')).toMatchObject({ busy: false, heading: 90, title: 'Fatimata Z. · Vélo · libre' });
    expect(byId(scene, 'driver:drv-issouf')?.title).toBe('Issouf S. · Moto · livraison #1003');
  });

  it('étape en cours : itinéraire routier vert rogné au livreur ; ligne droite de secours en pointillés', () => {
    expect(lineById(scene, 'leg:ord-1003')).toMatchObject({ kind: 'route', trimToMarkerId: 'driver:drv-issouf' });
    expect(lineById(scene, 'leg:ord-1003')?.points[1]).toEqual({ lat: 12.3349, lng: -1.5112 });
    // source « straight » (service d'itinéraire indisponible) : pointillés, comme sans itinéraire.
    expect(lineById(scene, 'leg:ord-1004')).toMatchObject({ kind: 'dashed', trimToMarkerId: 'driver:drv-abdoul' });
    // Livreur libre : aucune ligne.
    expect(scene.lines.map((l) => l.id).sort()).toEqual(['leg:ord-1003', 'leg:ord-1004', 'next:ord-1005']);
  });

  it('SOS pulsé avec le nom du livreur ; un SOS sans position n’est pas dessiné', () => {
    expect(scene.markers.filter((m) => m.kind === 'sos')).toEqual([
      expect.objectContaining({ id: 'sos:inc-1', label: 'SOS · Karim D.', lat: 12.3985, lng: -1.519 }),
    ]);
  });

  it('filtre véhicule : livreurs et livraisons du véhicule seulement, entreprises et SOS toujours', () => {
    const bike = buildLiveScene(b2bMapData, 'BIKE');
    expect(bike.markers.filter((m) => m.kind === 'driver').map((m) => m.id)).toEqual(['driver:drv-fati']);
    expect(bike.markers.filter((m) => m.kind === 'dropoff').map((m) => m.id)).toEqual(['dropoff:ord-1005']);
    expect(bike.markers.filter((m) => m.kind === 'business')).toHaveLength(4);
    expect(bike.markers.filter((m) => m.kind === 'sos')).toHaveLength(1);
    expect(bike.lines.map((l) => l.id)).toEqual(['next:ord-1005']);
  });

  it('retrait ailleurs qu’à l’adresse d’une entreprise : son propre carré jusqu’au retrait du colis', () => {
    const data = {
      ...b2bMapData,
      orders: b2bMapData.orders.map((o) =>
        o.id === 'ord-1004' ? { ...o, pickup: { lat: 12.42, lng: -1.53, address: 'Entrepôt de Kossodo' } } : o,
      ),
    };
    const s = buildLiveScene(data, 'ALL');
    expect(byId(s, 'pickup:ord-1004')).toMatchObject({ kind: 'business', lat: 12.42, lng: -1.53, orderId: 'ord-1004' });
    const picked = buildLiveScene({ ...data, orders: data.orders.map((o) => (o.id === 'ord-1004' ? { ...o, status: 'PICKED_UP' as const } : o)) }, 'ALL');
    expect(byId(picked, 'pickup:ord-1004')).toBeUndefined();
  });

  it('cadrage : tous les marqueurs ; clé de scène stable pour des données identiques', () => {
    expect(scenePoints(scene)).toHaveLength(scene.markers.length);
    expect(sceneKey(buildLiveScene(structuredClone(b2bMapData), 'ALL'))).toBe(sceneKey(scene));
    const moved = structuredClone(b2bMapData);
    moved.drivers[0]!.lat += 0.001;
    expect(sceneKey(buildLiveScene(moved, 'ALL'))).not.toBe(sceneKey(scene));
  });
});

describe('Ligne de l’étape en cours', () => {
  const driver = { lat: 12.39, lng: -1.54 };
  const pickup = { lat: 12.405, lng: -1.559 };
  const dropoff = { lat: 12.375, lng: -1.47 };
  const route = (target: 'PICKUP' | 'DROPOFF', source: 'osrm' | 'straight' = 'osrm') => ({
    target,
    points: [
      [12.39, -1.54],
      [12.4, -1.55],
      [12.405, -1.559],
    ] as Array<[number, number]>,
    distanceM: 2000,
    durationS: 300,
    source,
    computedAt: '2026-11-08T21:00:00.000Z',
  });

  it('sans itinéraire : pointillés du livreur vers le retrait (ASSIGNED) ou le destinataire (PICKED_UP)', () => {
    expect(legLine('l', 'drv', driver, 'ASSIGNED', pickup, dropoff, null)).toEqual({
      id: 'l',
      kind: 'dashed',
      points: [driver, pickup],
      trimToMarkerId: 'drv',
    });
    expect(legLine('l', 'drv', driver, 'PICKED_UP', pickup, dropoff, undefined)?.points[1]).toEqual(dropoff);
  });

  it('itinéraire d’une autre étape (périmé) : ignoré ; hors course : aucune ligne', () => {
    expect(legLine('l', 'drv', driver, 'PICKED_UP', pickup, dropoff, route('PICKUP'))).toMatchObject({
      kind: 'dashed',
      points: [driver, dropoff],
    });
    expect(legLine('l', 'drv', driver, 'SEARCHING_DRIVER', pickup, dropoff, route('PICKUP'))).toBeNull();
    expect(legLine('l', 'drv', driver, 'ASSIGNED', null, dropoff, null)).toBeNull();
  });

  it('itinéraire routier de l’étape : vert ; ligne droite de secours : pointillés', () => {
    expect(legLine('l', 'drv', driver, 'ASSIGNED', pickup, dropoff, route('PICKUP'))).toMatchObject({ kind: 'route' });
    expect(legLine('l', 'drv', driver, 'ASSIGNED', pickup, dropoff, route('PICKUP', 'straight'))).toMatchObject({ kind: 'dashed' });
  });
});

describe('resolveLines (positions animées)', () => {
  const route = {
    id: 'leg',
    kind: 'route' as const,
    points: [
      { lat: 12.3, lng: -1.5 },
      { lat: 12.3, lng: -1.49 },
      { lat: 12.31, lng: -1.49 },
    ],
    trimToMarkerId: 'drv',
  };

  it('rogne l’itinéraire au point le plus proche du livreur (la partie parcourue disparaît)', () => {
    const [line] = resolveLines([route], () => ({ lat: 12.3, lng: -1.495 }));
    expect(line?.kind).toBe('route');
    expect(line?.points[0]?.lng).toBeCloseTo(-1.495, 6);
    expect(line?.points.slice(1)).toEqual(route.points.slice(1));
  });

  it('livreur loin du tracé : court pointillé de raccord', () => {
    const lines = resolveLines([route], () => ({ lat: 12.302, lng: -1.495 }));
    expect(lines.map((l) => [l.id, l.kind])).toEqual([
      ['leg-join', 'dashed'],
      ['leg', 'route'],
    ]);
    expect(distanceM(lines[0]!.points[0]!, { lat: 12.302, lng: -1.495 })).toBeLessThan(0.01);
  });

  it('pointillés depuis la position animée ; trajet à venir inchangé ; lignes trop courtes ignorées', () => {
    const dashed = { id: 'd', kind: 'dashed' as const, points: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }], trimToMarkerId: 'drv' };
    const next = { id: 'n', kind: 'next' as const, points: [{ lat: 3, lng: 3 }, { lat: 4, lng: 4 }] };
    const lone = { id: 'x', kind: 'next' as const, points: [{ lat: 5, lng: 5 }] };
    expect(resolveLines([dashed, next, lone], () => ({ lat: 1.5, lng: 1.5 }))).toEqual([
      { id: 'd', kind: 'dashed', points: [{ lat: 1.5, lng: 1.5 }, { lat: 2, lng: 2 }] },
      { id: 'n', kind: 'next', points: next.points },
    ]);
    // Position inconnue : ligne telle quelle.
    expect(resolveLines([dashed], () => undefined)[0]?.points).toEqual(dashed.points);
  });
});

describe('Carte de la fiche de livraison', () => {
  it('livreur en route vers le retrait : livreur, itinéraire, trajet à venir, cadrage livreur + retrait', () => {
    const s = buildDeliveryScene(businessOrder());
    expect(s.stage).toBe('toPickup');
    expect(s.markers.map((m) => [m.id, m.kind])).toEqual([
      ['pickup', 'business'],
      ['dropoff', 'dropoff'],
      ['driver', 'driver'],
    ]);
    expect(byId(s, 'driver')).toMatchObject({ busy: true, heading: 314, vehicleType: 'CAR', driverId: 'drv-abdoul' });
    expect(byId(s, 'dropoff')?.pulse).toBe(true);
    expect(s.lines.map((l) => [l.id, l.kind])).toEqual([
      ['leg', 'route'],
      ['next', 'next'],
    ]);
    expect(s.fitPoints[0]).toEqual({ lat: 12.392, lng: -1.545 });
    expect(s.fitPoints[1]).toEqual({ lat: 12.405, lng: -1.559 });
  });

  it('recherche d’un livreur : anneaux au retrait, pas de livreur ; colis récupéré sans itinéraire : pointillés', () => {
    const searching = buildDeliveryScene(businessOrder({ status: 'SEARCHING_DRIVER', driver: null, route: null }));
    expect(searching.markers.map((m) => m.kind)).toEqual(['business', 'search', 'dropoff']);
    expect(searching.fitPoints).toHaveLength(2);
    const picked = buildDeliveryScene(businessOrder({ status: 'PICKED_UP', route: null }));
    expect(picked.lines).toEqual([
      { id: 'leg', kind: 'dashed', points: [{ lat: 12.392, lng: -1.545 }, { lat: 12.375, lng: -1.47 }], trimToMarkerId: 'driver' },
    ]);
  });

  it('livrée : ni livreur ni halo, trajet effectué en pointillés discrets', () => {
    const s = buildDeliveryScene(businessOrder({ status: 'DELIVERED', route: null }));
    expect(s.markers.some((m) => m.kind === 'driver')).toBe(false);
    expect(byId(s, 'dropoff')?.pulse).toBe(false);
    expect(s.lines.map((l) => l.kind)).toEqual(['next']);
  });
});

describe('Marqueurs DOM', () => {
  const driver: SceneMarker = {
    id: 'driver:d1', kind: 'driver', lat: 12, lng: -1, title: 'Karim D. · Moto · libre', vehicleType: 'MOTO', busy: false, driverId: 'd1',
  };

  it('livreur : véhicule droit, anneau libre / en livraison, flèche de cap séparée', () => {
    const el = createMarkerElement(driver);
    expect(el.className).toContain('yaar-driver');
    expect(el.classList.contains('is-free')).toBe(true);
    expect(el.dataset.vehicle).toBe('MOTO');
    expect(el.getAttribute('role')).toBe('button');
    expect(el.getAttribute('aria-label')).toBe('Karim D. · Moto · libre');
    expect(el.querySelector('.yaar-driver-badge svg')).not.toBeNull();
    setDriverHeading(el, null);
    expect(el.classList.contains('no-heading')).toBe(true);
    setDriverHeading(el, 135);
    expect(el.classList.contains('no-heading')).toBe(false);
    expect((el.querySelector('.yaar-driver-heading') as HTMLElement).style.transform).toBe('rotate(135deg)');
    // Le véhicule ne tourne pas.
    expect((el.querySelector('.yaar-driver-badge') as HTMLElement).style.transform).toBe('');
    updateMarkerElement(el, { ...driver, busy: true });
    expect(el.classList.contains('is-busy')).toBe(true);
    expect(el.classList.contains('is-free')).toBe(false);
  });

  it('entreprise estompée, recherche avec numéro, SOS avec nom, quartiers', () => {
    const biz = createMarkerElement({ id: 'b', kind: 'business', lat: 0, lng: 0, title: 'Kaya Market', dimmed: true });
    expect(biz.classList.contains('is-dimmed')).toBe(true);
    expect(biz.getAttribute('role')).toBe('img');
    const search = createMarkerElement({ id: 's', kind: 'search', lat: 0, lng: 0, title: 't', label: '#1005', orderId: 'o' });
    expect(search.querySelectorAll('.yaar-ring')).toHaveLength(3);
    expect(search.querySelector('.yaar-search-label')?.textContent).toBe('#1005');
    const sos = createMarkerElement({ id: 'x', kind: 'sos', lat: 0, lng: 0, title: 'SOS', label: 'SOS · Karim D.' });
    expect(sos.textContent).toBe('SOS · Karim D.');
    expect(neighbourhoodLabels().map((l) => l.label)).toContain('Zogona');
  });
});

/* ------------------------------------------------------------------ */
/* Contrôleur avec un MapLibre simulé                                   */
/* ------------------------------------------------------------------ */

class FakeMarker {
  static all: FakeMarker[] = [];
  lngLat: [number, number] = [0, 0];
  removed = false;
  readonly element: HTMLElement;
  constructor(opts: { element: HTMLElement; anchor: string }) {
    this.element = opts.element;
    FakeMarker.all.push(this);
  }
  setLngLat(ll: [number, number]) {
    this.lngLat = ll;
    return this;
  }
  getLngLat() {
    return { lng: this.lngLat[0], lat: this.lngLat[1] };
  }
  addTo() {
    return this;
  }
  remove() {
    this.removed = true;
  }
}

function fakeMap() {
  const setData = vi.fn();
  const fitBounds = vi.fn();
  const sources = new Map<string, unknown>();
  const map = {
    getSource: (id: string) => sources.get(id),
    addSource: (id: string) => sources.set(id, { setData }),
    getLayer: () => undefined,
    addLayer: vi.fn(),
    getStyle: () => ({ layers: [] }),
    getContainer: () => ({ clientWidth: 800, clientHeight: 600 }),
    fitBounds,
  };
  const base = { map, usingFallback: () => false, destroy: vi.fn() } as unknown as BaseMap;
  return { base, setData, fitBounds };
}

describe('MapSceneController (MapLibre simulé)', () => {
  beforeEach(() => {
    FakeMarker.all = [];
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout', 'Date'] });
  });
  afterEach(() => vi.useRealTimers());

  it('rafraîchissement : marqueurs mis à jour en place, livreur animé, tracé rogné, caméra immobile', () => {
    const { base, setData, fitBounds } = fakeMap();
    const clicks: SceneMarker[] = [];
    const ctrl = new MapSceneController({ Marker: FakeMarker } as unknown as Maplibre, base, (m) => clicks.push(m), 1500);
    ctrl.onStyleReady(false);
    ctrl.setScene(buildLiveScene(b2bMapData, 'ALL'));
    const created = FakeMarker.all.length;
    expect(created).toBe(buildLiveScene(b2bMapData, 'ALL').markers.length);
    const issouf = () => FakeMarker.all.find((m) => m.element.getAttribute('aria-label')?.startsWith('Issouf'))!;
    expect(issouf().lngLat).toEqual([-1.5141, 12.3372]);
    const drawnKinds = () => (setData.mock.lastCall?.[0] as { features: Array<{ properties: { kind: string } }> }).features.map((f) => f.properties.kind);
    expect(drawnKinds().sort()).toEqual(['dashed', 'next', 'route']);

    // Nouvelle réponse : Issouf a avancé ; Fatimata passe en livraison.
    const next = structuredClone(b2bMapData);
    next.drivers[0] = { ...next.drivers[0]!, lat: 12.331, lng: -1.5101 };
    next.drivers[2] = { ...next.drivers[2]!, isBusy: true };
    ctrl.setScene(buildLiveScene(next, 'ALL'));
    expect(FakeMarker.all).toHaveLength(created); // aucun marqueur recréé
    expect(issouf().lngLat).toEqual([-1.5141, 12.3372]); // pas de saut : le glissement commence
    vi.advanceTimersByTime(750);
    const mid = issouf().lngLat;
    expect(mid[1]).toBeLessThan(12.3372);
    expect(mid[1]).toBeGreaterThan(12.331);
    vi.advanceTimersByTime(800);
    expect(issouf().lngLat).toEqual([-1.5101, 12.331]);
    const fati = FakeMarker.all.find((m) => m.element.getAttribute('aria-label')?.startsWith('Fatimata'))!;
    expect(fati.element.classList.contains('is-busy')).toBe(true);
    // L'itinéraire est rogné à la position animée : il commence à la position finale du livreur.
    const routeFeature = (setData.mock.lastCall?.[0] as { features: Array<{ properties: { kind: string }; geometry: { coordinates: number[][] } }> }).features.find(
      (f) => f.properties.kind === 'route',
    )!;
    expect(routeFeature.geometry.coordinates[0]![0]).toBeCloseTo(-1.5101, 4);
    expect(routeFeature.geometry.coordinates[0]![1]).toBeCloseTo(12.331, 4);
    expect(fitBounds).not.toHaveBeenCalled();

    // Livraison terminée : sa ligne et son épingle disparaissent.
    const done = { ...next, orders: next.orders.filter((o) => o.id !== 'ord-1003') };
    ctrl.setScene(buildLiveScene(done, 'ALL'));
    expect(FakeMarker.all.filter((m) => m.removed)).toHaveLength(1);
    expect(drawnKinds()).not.toContain('route');

    // Clic sur un livreur : fiche du livreur.
    issouf().element.click();
    expect(clicks.at(-1)).toMatchObject({ driverId: 'drv-issouf' });
    ctrl.fit([{ lat: 12.3, lng: -1.5 }], { top: 10, right: 10, bottom: 10, left: 10 }, 14, false);
    expect(fitBounds).toHaveBeenCalledTimes(1);
    ctrl.destroy();
  });

  it('fond de secours : noms des quartiers ; style distant : aucun', () => {
    const { base } = fakeMap();
    const ctrl = new MapSceneController({ Marker: FakeMarker } as unknown as Maplibre, base, () => undefined, 1500);
    ctrl.onStyleReady(true);
    const labels = FakeMarker.all.filter((m) => m.element.classList.contains('yaar-hood'));
    expect(labels.length).toBe(neighbourhoodLabels().length);
    ctrl.onStyleReady(false);
    expect(labels.every((m) => m.removed)).toBe(true);
    ctrl.destroy();
  });
});
