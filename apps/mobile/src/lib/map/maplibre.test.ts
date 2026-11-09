import { CHEVRON_IMAGE_ID, CHEVRON_SPACING_PX, chevronImage } from './chevron';
import { createBaseMap, ensureLineLayers, type Maplibre } from './maplibre.web';
import { FALLBACK_STYLE, mapThemeConfig } from './style';
import { sessionStyleCache } from './styleLoader';

/** Clé du style Cobalt dans le cache (URL résolue). */
const STYLE_KEY = mapThemeConfig().styleUrl;

/** Carte MapLibre simulée : styles reçus (constructeur puis setStyle) et événements déclenchés à la main. */
class FakeMap {
  static instances: FakeMap[] = [];
  styles: unknown[] = [];
  handlers: Record<string, Array<(e?: unknown) => void>> = {};
  throwOnSetStyle = false;
  touchZoomRotate = { disableRotation: () => undefined };
  keyboard = { disableRotation: () => undefined };
  constructor(opts: { style: unknown }) {
    this.styles.push(opts.style);
    FakeMap.instances.push(this);
  }
  on(event: string, fn: (e?: unknown) => void) {
    (this.handlers[event] ??= []).push(fn);
    return this;
  }
  fire(event: string, e?: unknown) {
    for (const fn of this.handlers[event] ?? []) fn(e);
  }
  setStyle(style: unknown) {
    if (this.throwOnSetStyle && style !== FALLBACK_STYLE) throw new Error('style refusé');
    this.styles.push(style);
  }
  resize() {}
  remove() {}
}
const ml = { Map: FakeMap } as unknown as Maplibre;

const REMOTE = { version: 8, sources: {}, layers: [{ id: 'fond', type: 'background' }] };
const fetchMock = jest.fn(async () => ({ ok: true, json: async () => REMOTE }) as unknown as Response);
const realFetch = global.fetch;

/** Laisse le chargement du style distant (fetch, json) aller au bout. */
const flush = () => new Promise((r) => setTimeout(r, 0));

function newMap(theme: 'light' | 'dark' = 'light', onStyleReady?: (map: unknown, fallback: boolean) => void) {
  const base = createBaseMap(ml, {} as HTMLElement, { center: { lat: 12.37, lng: -1.52 }, zoom: 13, theme, ...(onStyleReady ? { onStyleReady } : {}) });
  return { base, map: FakeMap.instances.at(-1)! };
}

describe('carte web : style distant mis en cache seulement une fois chargé par MapLibre', () => {
  beforeAll(() => {
    (global as { window?: unknown }).window ??= global;
  });
  beforeEach(() => {
    sessionStyleCache.clear();
    FakeMap.instances = [];
    fetchMock.mockClear();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = realFetch;
  });

  it('style accepté : appliqué, mis en cache à « style.load », puis réutilisé aussitôt par la carte suivante', async () => {
    const ready = jest.fn();
    const { base, map } = newMap('light', ready);
    expect(map.styles[0]).toBe(FALLBACK_STYLE);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(map.styles.at(-1)).toMatchObject({ layers: [{ id: 'fond' }] });
    // Appliqué mais pas encore chargé : rien en cache, la carte est toujours sur le secours.
    expect(sessionStyleCache.has(STYLE_KEY)).toBe(false);
    expect(base.usingFallback()).toBe(true);
    map.fire('style.load');
    expect(sessionStyleCache.has(STYLE_KEY)).toBe(true);
    expect(base.usingFallback()).toBe(false);
    expect(ready).toHaveBeenLastCalledWith(map, false);
    // Erreurs de tuiles ou de sprites après le chargement : sans effet.
    map.fire('error', { error: new Error('tuile indisponible') });
    await flush();
    expect(base.usingFallback()).toBe(false);

    const second = newMap('light');
    expect(second.map.styles[0]).toMatchObject({ layers: [{ id: 'fond' }] });
    expect(second.base.usingFallback()).toBe(false);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('style refusé à la validation (« error » au lieu de « style.load ») : secours, rien en cache, nouvel essai à la carte suivante', async () => {
    // L'ancien fond sombre est accepté et donne la même carte Cobalt.
    const { base, map } = newMap('dark');
    await flush();
    expect(map.styles).toHaveLength(2);
    map.fire('error', { error: new Error('layers.0.type: expected one of […]') });
    await flush();
    expect(map.styles.at(-1)).toBe(FALLBACK_STYLE);
    expect(sessionStyleCache.has(STYLE_KEY)).toBe(false);
    expect(base.usingFallback()).toBe(true);
    // Le secours se charge : la carte reste utilisable (calques de l'application réajoutés).
    map.fire('style.load');
    expect(sessionStyleCache.has(STYLE_KEY)).toBe(false);

    const next = newMap('dark');
    expect(next.map.styles[0]).toBe(FALLBACK_STYLE);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('style refusé par setStyle (exception) : secours aussitôt, rien en cache', async () => {
    const { base, map } = newMap('light');
    map.throwOnSetStyle = true;
    await flush();
    expect(map.styles.at(-1)).toBe(FALLBACK_STYLE);
    expect(sessionStyleCache.has(STYLE_KEY)).toBe(false);
    expect(base.usingFallback()).toBe(true);
  });
});

describe('fond Cobalt : une seule apparence', () => {
  beforeAll(() => {
    (global as { window?: unknown }).window ??= global;
  });
  beforeEach(() => {
    sessionStyleCache.clear();
    FakeMap.instances = [];
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = realFetch;
  });

  it('style Cobalt demandé pour toutes les cartes ; setTheme (ancien fond sombre) ne change rien', async () => {
    fetchMock.mockClear();
    const { base, map } = newMap('dark');
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(STYLE_KEY, expect.anything());
    const count = map.styles.length;
    base.setTheme('light');
    base.setTheme('dark');
    expect(map.styles).toHaveLength(count);
  });
});

/** Carte simulée pour les calques : sources, calques (et calque de référence), images. */
function layerMap(styleLayers: Array<{ id: string; type: string }> = [{ id: 'label_other', type: 'symbol' }]) {
  const layers: Array<{ id: string; type: string; paint?: Record<string, unknown>; layout?: Record<string, unknown>; before?: string }> = [];
  const sources = new Set<string>();
  const images = new Map<string, { width: number; height: number }>();
  const map = {
    getSource: (id: string) => (sources.has(id) ? {} : undefined),
    addSource: (id: string) => sources.add(id),
    getLayer: (id: string) => layers.find((l) => l.id === id),
    addLayer: (l: (typeof layers)[number], before?: string) => layers.push({ ...l, before }),
    hasImage: (id: string) => images.has(id),
    addImage: (id: string, img: { width: number; height: number }) => images.set(id, img),
    getStyle: () => ({ layers: [...styleLayers, ...layers] }),
  };
  return { map: map as unknown as Parameters<typeof ensureLineLayers>[0], layers, images };
}

describe('calques Cobalt des tracés (web)', () => {
  it('zones sous les noms des quartiers ; étape à venir, tirets et itinéraire au-dessus, chevrons en dernier', () => {
    const { map, layers, images } = layerMap();
    ensureLineLayers(map);
    expect(layers.map((l) => l.id)).toEqual([
      'yaar-zone-fill',
      'yaar-zone-line',
      'yaar-pending',
      'yaar-dashed',
      'yaar-route-shadow',
      'yaar-route-casing',
      'yaar-route',
      'yaar-route-chevrons',
    ]);
    expect(layers.filter((l) => l.id.startsWith('yaar-zone')).every((l) => l.before === 'label_other')).toBe(true);
    expect(layers.filter((l) => !l.id.startsWith('yaar-zone')).every((l) => l.before === undefined)).toBe(true);
    expect(images.get(CHEVRON_IMAGE_ID)).toMatchObject({ width: 16, height: 16 });
    // Deuxième appel (nouveau style chargé, calques encore là) : rien en double.
    ensureLineLayers(map);
    expect(layers).toHaveLength(8);
  });

  it('itinéraire cobalt 6 px sur liseré blanc de 10 px (2 px de chaque côté), tirets cobalt 2,5 px, pointillés encre', () => {
    const { map, layers } = layerMap();
    ensureLineLayers(map);
    const at14 = (l: { paint?: Record<string, unknown> }) => {
      const w = l.paint?.['line-width'] as unknown[];
      return w[w.indexOf(14) + 1];
    };
    const byId = (id: string) => layers.find((l) => l.id === id)!;
    expect(byId('yaar-route').paint?.['line-color']).toBe('#2448FF');
    expect(at14(byId('yaar-route'))).toBe(6);
    expect(byId('yaar-route-casing').paint?.['line-color']).toBe('#FFFFFF');
    expect(at14(byId('yaar-route-casing'))).toBe(10);
    expect(byId('yaar-dashed').paint).toMatchObject({ 'line-color': '#2448FF', 'line-width': 2.5 });
    expect(byId('yaar-pending').paint).toMatchObject({ 'line-color': 'rgba(12, 18, 34, 0.32)', 'line-dasharray': [0, 3] });
    expect(byId('yaar-pending').layout?.['line-cap']).toBe('round');
    expect(byId('yaar-route-chevrons').layout).toMatchObject({
      'symbol-placement': 'line',
      'symbol-spacing': CHEVRON_SPACING_PX,
      'icon-image': CHEVRON_IMAGE_ID,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    });
    expect(CHEVRON_SPACING_PX).toBeGreaterThanOrEqual(60);
    expect(CHEVRON_SPACING_PX).toBeLessThanOrEqual(80);
    expect(byId('yaar-zone-line').paint?.['line-dasharray']).toEqual([3, 2.4]);
  });

  it('style sans calque de texte (secours) : zones et tracés posés tout en haut', () => {
    const { map, layers } = layerMap([{ id: 'background', type: 'background' }]);
    ensureLineLayers(map);
    expect(layers.every((l) => l.before === undefined)).toBe(true);
  });

  it('chevron : blanc, anticrénelé, pointe vers la droite (sens du tracé), à la densité demandée', () => {
    const img = chevronImage(2);
    expect([img.width, img.height]).toEqual([16, 16]);
    const alpha = (x: number, y: number) => img.data[(y * img.width + x) * 4 + 3]!;
    expect(alpha(10, 7) + alpha(10, 8)).toBeGreaterThan(300);
    expect(alpha(5, 7)).toBe(0);
    const values = new Set(Array.from({ length: img.width * img.height }, (_, i) => img.data[i * 4 + 3]));
    // Bords adoucis : des valeurs intermédiaires entre 0 et 255.
    expect([...values].some((v) => v! > 0 && v! < 255)).toBe(true);
    expect(chevronImage(3).width).toBe(24);
  });
});
