import { createBaseMap, type Maplibre } from './maplibre.web';
import { FALLBACK_STYLE, FALLBACK_STYLE_DARK, MAP_STYLE_DARK_URL, MAP_STYLE_URL } from './style';
import { sessionStyleCache } from './styleLoader';

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
    if (this.throwOnSetStyle && style !== FALLBACK_STYLE && style !== FALLBACK_STYLE_DARK) throw new Error('style refusé');
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
    expect(sessionStyleCache.has(MAP_STYLE_URL)).toBe(false);
    expect(base.usingFallback()).toBe(true);
    map.fire('style.load');
    expect(sessionStyleCache.has(MAP_STYLE_URL)).toBe(true);
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
    const { base, map } = newMap('dark');
    await flush();
    expect(map.styles).toHaveLength(2);
    map.fire('error', { error: new Error('layers.0.type: expected one of […]') });
    await flush();
    expect(map.styles.at(-1)).toBe(FALLBACK_STYLE_DARK);
    expect(sessionStyleCache.has(MAP_STYLE_DARK_URL)).toBe(false);
    expect(base.usingFallback()).toBe(true);
    // Le secours se charge : la carte reste utilisable (calques de l'application réajoutés).
    map.fire('style.load');
    expect(sessionStyleCache.has(MAP_STYLE_DARK_URL)).toBe(false);

    const next = newMap('dark');
    expect(next.map.styles[0]).toBe(FALLBACK_STYLE_DARK);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('style refusé par setStyle (exception) : secours aussitôt, rien en cache', async () => {
    const { base, map } = newMap('light');
    map.throwOnSetStyle = true;
    await flush();
    expect(map.styles.at(-1)).toBe(FALLBACK_STYLE);
    expect(sessionStyleCache.has(MAP_STYLE_URL)).toBe(false);
    expect(base.usingFallback()).toBe(true);
  });
});
