import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { distanceM } from '@yaar/shared';
import { CHEVRON_IMAGE_ID, chevronImage } from '../src/lib/map/chevron';
import { MapSceneController } from '../src/lib/map/controller';
import { ensureLineLayers, type BaseMap, type Maplibre } from '../src/lib/map/engine';
import { markerInitials } from '../src/lib/map/initials';
import {
  COBALT_MAP_CLASS,
  MARKER_Z,
  createMarkerElement,
  ensureCobaltMapCss,
  markerAnchor,
  markerOffset,
  setDriverHeading,
  updateMarkerElement,
} from '../src/lib/map/markers';
import { COBALT_MAP } from '../src/lib/map/palette';
import { DEFAULT_MAP_STYLE_URL, FALLBACK_STYLE, MAP_COLORS, MAP_STYLE_URL, resolveMapStyleUrl } from '../src/lib/map/style';
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

  it('entreprises en carrés encre à leurs initiales (fermée : estompée), destinataires des livraisons en cours en gouttes', () => {
    expect(scene.markers.filter((m) => m.kind === 'business').map((m) => m.id)).toEqual([
      'business:st-verdoyant',
      'business:st-tech',
      'business:st-mode',
      'business:st-pissy',
    ]);
    expect(byId(scene, 'business:st-pissy')).toMatchObject({ dimmed: true, title: 'Grillades de Pissy (fermée)', initials: 'GP' });
    expect(byId(scene, 'business:st-verdoyant')?.initials).toBe('LV');
    expect(byId(scene, 'business:st-tech')?.dimmed).toBe(false);
    expect(scene.markers.filter((m) => m.kind === 'dropoff').map((m) => m.id)).toEqual([
      'dropoff:ord-1003',
      'dropoff:ord-1004',
      'dropoff:ord-1005',
    ]);
    expect(byId(scene, 'dropoff:ord-1004')).toMatchObject({ lat: 12.375, lng: -1.47, orderId: 'ord-1004' });
  });

  it('livraison en attente : radar au retrait, numéro cliquable et ligne droite en tirets cobalt vers le destinataire', () => {
    expect(scene.markers.filter((m) => m.kind === 'search')).toEqual([
      expect.objectContaining({ id: 'search:ord-1005', lat: 12.3805, lng: -1.4975, orderId: 'ord-1005' }),
    ]);
    // L'étiquette « #1005 » est un marqueur à part, au-dessus des gouttes et des carrés (jamais cachée dessous).
    expect(scene.markers.filter((m) => m.kind === 'tag')).toEqual([
      expect.objectContaining({ id: 'tag:ord-1005', lat: 12.3805, lng: -1.4975, label: '#1005', orderId: 'ord-1005' }),
    ]);
    expect(MARKER_Z.tag).toBeGreaterThan(Math.max(MARKER_Z.dropoff, MARKER_Z.business, MARKER_Z.driver));
    expect(MARKER_Z.sos).toBeGreaterThan(MARKER_Z.tag);
    expect(lineById(scene, 'next:ord-1005')).toEqual({
      id: 'next:ord-1005',
      kind: 'dashed',
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

  it('étape en cours : itinéraire routier cobalt rogné au livreur ; ligne droite de secours en tirets', () => {
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
    // Les étiquettes « #1005 » sont à la même place que leur radar : pas de point de plus.
    expect(scenePoints(scene)).toHaveLength(scene.markers.filter((m) => m.kind !== 'tag').length);
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

  it('itinéraire routier de l’étape : cobalt ; ligne droite de secours : tirets', () => {
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

  it('recherche d’un livreur : radar au retrait, pas de livreur, trajet en tirets cobalt ; colis récupéré sans itinéraire : tirets', () => {
    const searching = buildDeliveryScene(businessOrder({ status: 'SEARCHING_DRIVER', driver: null, route: null }));
    expect(searching.markers.map((m) => m.kind)).toEqual(['business', 'search', 'dropoff']);
    expect(searching.lines.map((l) => [l.id, l.kind])).toEqual([['next', 'dashed']]);
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

  it('livreur : disque blanc, véhicule droit, libre (pastille menthe) / en livraison, encoche de cap séparée', () => {
    const el = createMarkerElement(driver);
    expect(el.className).toContain('yaar-driver');
    expect(el.classList.contains('is-free')).toBe(true);
    expect(el.querySelector('.ycm-available')).not.toBeNull();
    expect(el.dataset.vehicle).toBe('MOTO');
    expect(el.getAttribute('role')).toBe('button');
    expect(el.getAttribute('aria-label')).toBe('Karim D. · Moto · libre');
    expect(el.querySelector('.ycm-disc svg')).not.toBeNull();
    setDriverHeading(el, null);
    expect(el.classList.contains('no-heading')).toBe(true);
    setDriverHeading(el, 135);
    expect(el.classList.contains('no-heading')).toBe(false);
    expect((el.querySelector('.ycm-heading') as HTMLElement).style.transform).toBe('rotate(135deg)');
    // Le véhicule ne tourne pas.
    expect((el.querySelector('.ycm-disc') as HTMLElement).style.transform).toBe('');
    updateMarkerElement(el, { ...driver, busy: true });
    expect(el.classList.contains('is-busy')).toBe(true);
    expect(el.classList.contains('is-free')).toBe(false);
  });

  it('entreprise estompée à ses initiales (texte, jamais du HTML), recherche avec numéro, SOS avec nom, quartiers', () => {
    const biz = createMarkerElement({ id: 'b', kind: 'business', lat: 0, lng: 0, title: 'Kaya Market', dimmed: true, initials: 'KM' });
    expect(biz.classList.contains('is-dimmed')).toBe(true);
    expect(biz.getAttribute('role')).toBe('img');
    expect(biz.querySelector('.ycm-initials')?.textContent).toBe('KM');
    const injected = createMarkerElement({ id: 'x', kind: 'business', lat: 0, lng: 0, title: 'x', initials: '<b>' });
    expect(injected.querySelector('b')).toBeNull();
    expect(injected.querySelector('.ycm-initials')?.textContent).toBe('<b>');
    // Sans initiales : pictogramme boutique.
    expect(createMarkerElement({ id: 'y', kind: 'business', lat: 0, lng: 0, title: 'y' }).querySelector('.ycm-square svg')).not.toBeNull();
    const search = createMarkerElement({ id: 's', kind: 'search', lat: 0, lng: 0, title: 't', orderId: 'o' });
    expect(search.querySelectorAll('.ycm-radar')).toHaveLength(3);
    expect(search.getAttribute('role')).toBe('button');
    // Étiquette : cliquable à la souris, sans arrêt de tabulation ni lecture en double (le radar est le bouton).
    const tag = createMarkerElement({ id: 't', kind: 'tag', lat: 0, lng: 0, title: 't', label: '#1005', orderId: 'o' });
    expect(tag.textContent).toBe('#1005');
    expect(tag.classList.contains('is-clickable')).toBe(true);
    expect(tag.getAttribute('aria-hidden')).toBe('true');
    expect(tag.tabIndex).toBe(-1);
    expect(markerAnchor('tag')).toBe('left');
    // Goutte d'un destinataire situé à une entreprise : posée sur le haut du carré.
    expect(markerOffset({ kind: 'dropoff', onBusiness: true })).toEqual([0, -16]);
    expect(markerOffset({ kind: 'dropoff' })).toEqual([0, 0]);
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
    hasImage: () => false,
    addImage: vi.fn(),
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
    expect(drawnKinds().sort()).toEqual(['dashed', 'dashed', 'route']);

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

/* ------------------------------------------------------------------ */
/* Apparence Cobalt                                                     */
/* ------------------------------------------------------------------ */

describe('Fond de carte Cobalt', () => {
  it('style servi par la console (/map/cobalt-style.json), URL absolue par rapport à la page ; secours à la couleur de la terre', () => {
    expect(DEFAULT_MAP_STYLE_URL).toBe('/map/cobalt-style.json');
    expect(MAP_STYLE_URL).toBe(DEFAULT_MAP_STYLE_URL);
    expect(resolveMapStyleUrl('/map/cobalt-style.json', 'https://yaar-console.vercel.app/courses/1')).toBe(
      'https://yaar-console.vercel.app/map/cobalt-style.json',
    );
    // Une URL absolue (VITE_MAP_STYLE_URL) est gardée telle quelle.
    expect(resolveMapStyleUrl('https://tiles.example.org/styles/x', 'https://a.b/')).toBe('https://tiles.example.org/styles/x');
    expect(FALLBACK_STYLE.layers).toEqual([{ id: 'background', type: 'background', paint: { 'background-color': '#F3F5F8' } }]);
    expect(MAP_COLORS.background).toBe(COBALT_MAP.land);
  });

  it('couleurs du système : cobalt pour l’itinéraire et le destinataire, encre pour l’entreprise, corail pour le SOS', () => {
    expect(MAP_COLORS).toMatchObject({
      route: '#2448FF',
      casing: '#FFFFFF',
      dashed: '#2448FF',
      next: 'rgba(12, 18, 34, 0.32)',
      business: '#0C1222',
      dropoff: '#2448FF',
      driverBusy: '#2448FF',
      sos: '#FF5A4E',
      sosFill: '#D92D20',
    });
  });

  it('calques des tracés : pointillés encre, tirets cobalt, itinéraire (ombre, liseré blanc, cobalt 6 px) et chevrons, au-dessus du fond', () => {
    const layers: Array<{ id: string; type: string; paint?: Record<string, unknown>; layout?: Record<string, unknown> }> = [];
    const before: unknown[] = [];
    const images = new Map<string, unknown>();
    const map = {
      getSource: () => undefined,
      addSource: vi.fn(),
      getLayer: () => undefined,
      addLayer: (l: (typeof layers)[number], b?: unknown) => {
        layers.push(l);
        before.push(b);
      },
      hasImage: (id: string) => images.has(id),
      addImage: (id: string, img: unknown) => images.set(id, img),
      getStyle: () => ({ layers: [{ id: 'label_other', type: 'symbol' }] }),
    };
    ensureLineLayers(map as unknown as Parameters<typeof ensureLineLayers>[0]);
    expect(layers.map((l) => l.id)).toEqual(['yaar-next', 'yaar-dashed', 'yaar-route-shadow', 'yaar-route-casing', 'yaar-route', 'yaar-route-chevrons']);
    expect(before.every((b) => b === undefined)).toBe(true);
    const byLayer = (id: string) => layers.find((l) => l.id === id)!;
    expect(byLayer('yaar-route').paint?.['line-color']).toBe('#2448FF');
    expect(byLayer('yaar-route-casing').paint?.['line-color']).toBe('#FFFFFF');
    expect(byLayer('yaar-next').paint).toMatchObject({ 'line-color': 'rgba(12, 18, 34, 0.32)', 'line-dasharray': [0, 3] });
    expect(byLayer('yaar-next').layout?.['line-cap']).toBe('round');
    expect(byLayer('yaar-dashed').paint).toMatchObject({ 'line-color': '#2448FF', 'line-width': 2.5 });
    expect(byLayer('yaar-route-chevrons')).toMatchObject({ type: 'symbol', layout: { 'symbol-placement': 'line', 'icon-image': CHEVRON_IMAGE_ID } });
    expect(images.has(CHEVRON_IMAGE_ID)).toBe(true);
  });

  it('chevron : image blanche anticrénelée, pointe vers la droite (sens du tracé)', () => {
    const img = chevronImage(2);
    expect([img.width, img.height, img.data.length]).toEqual([16, 16, 16 * 16 * 4]);
    const alpha = (x: number, y: number) => img.data[(y * img.width + x) * 4 + 3]!;
    // Pointe à droite du centre, branches à gauche ; le centre gauche est vide.
    expect(alpha(10, 7) + alpha(10, 8)).toBeGreaterThan(300);
    expect(alpha(5, 3) + alpha(5, 12)).toBeGreaterThan(300);
    expect(alpha(5, 7)).toBe(0);
    expect(alpha(0, 0)).toBe(0);
    expect(img.data[0]).toBe(255);
  });

  it('initiales des entreprises : comme l’application mobile', () => {
    expect(markerInitials('Le Verdoyant')).toBe('LV');
    expect(markerInitials('Grillades de Pissy')).toBe('GP');
    expect(markerInitials('L’Escale')).toBe('E');
    expect(markerInitials('  ')).toBeNull();
    expect(markerInitials(null)).toBeNull();
  });

  it('styles des marqueurs injectés une fois, limités aux cartes', () => {
    ensureCobaltMapCss();
    ensureCobaltMapCss();
    const styles = document.querySelectorAll('#yaar-cobalt-map-css');
    expect(styles).toHaveLength(1);
    expect(styles[0]!.textContent).toContain(`.${COBALT_MAP_CLASS} .yaar-driver`);
    expect(styles[0]!.textContent).toContain('#2448FF');
  });
});
