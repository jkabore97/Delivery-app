import {
  DEFAULT_MAP_STYLE_DARK_URL,
  FALLBACK_STYLE,
  FALLBACK_STYLE_DARK,
  MAP_COLORS,
  MAP_PALETTES,
  MAP_STYLE_DARK_URL,
  MAP_STYLE_URL,
  mapThemeConfig,
} from './style';
import {
  absolutizeStyle,
  initialMapStyle,
  RemoteStyleLoader,
  resolveStyleUrl,
  StyleCache,
  styleRetryDelayMs,
  type StyleLoaderEnv,
} from './styleLoader';

const URL_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const STYLE = { version: 8, sources: { openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } }, layers: [] };

function env() {
  const onlineListeners = new Set<() => void>();
  const e: StyleLoaderEnv & { fire: () => void; responses: Array<'fail' | 'ok' | 'bad'> } = {
    responses: [],
    fetch: jest.fn(async () => {
      const r = e.responses.shift() ?? 'fail';
      if (r === 'fail') throw new TypeError('Failed to fetch');
      return { ok: true, json: async () => (r === 'ok' ? STYLE : { nope: true }) } as unknown as Response;
    }),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    onOnline: (fn) => {
      onlineListeners.add(fn);
      return () => onlineListeners.delete(fn);
    },
    fire: () => onlineListeners.forEach((l) => l()),
  };
  return e;
}

describe('style distant : jamais abandonné pendant la session', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('nouveaux essais avec un délai croissant jusqu’à ce que le style arrive, puis plus rien', async () => {
    const e = env();
    e.responses = ['fail', 'fail', 'bad', 'ok'];
    const onStyle = jest.fn();
    const loader = new RemoteStyleLoader(URL_STYLE, onStyle, e);
    loader.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(e.fetch).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1999);
    expect(e.fetch).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1); // 2 s après le 1er échec
    expect(e.fetch).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(4000); // 4 s après le 2e
    expect(e.fetch).toHaveBeenCalledTimes(3);
    expect(onStyle).not.toHaveBeenCalled(); // JSON qui n'est pas un style : refusé
    await jest.advanceTimersByTimeAsync(8000); // 8 s après le 3e
    expect(e.fetch).toHaveBeenCalledTimes(4);
    expect(onStyle).toHaveBeenCalledTimes(1);
    expect(loader.loaded).toBe(true);
    await jest.advanceTimersByTimeAsync(600_000);
    expect(e.fetch).toHaveBeenCalledTimes(4);
  });

  it('un style arrivé tard (après 8 s, 3G lente) est quand même appliqué', async () => {
    const e = env();
    e.responses = ['fail', 'fail', 'fail', 'ok'];
    const onStyle = jest.fn();
    new RemoteStyleLoader(URL_STYLE, onStyle, e).start();
    await jest.advanceTimersByTimeAsync(2000 + 4000 + 8000);
    expect(onStyle).toHaveBeenCalledWith(expect.objectContaining({ version: 8 }));
  });

  it('retour du réseau (événement « online ») : nouvel essai immédiat', async () => {
    const e = env();
    e.responses = ['fail', 'fail', 'fail', 'fail', 'ok'];
    const onStyle = jest.fn();
    new RemoteStyleLoader(URL_STYLE, onStyle, e).start();
    await jest.advanceTimersByTimeAsync(2000 + 4000 + 8000); // 4 échecs, prochain essai dans 16 s
    expect(e.fetch).toHaveBeenCalledTimes(4);
    e.fire();
    await jest.advanceTimersByTimeAsync(0);
    expect(e.fetch).toHaveBeenCalledTimes(5);
    expect(onStyle).toHaveBeenCalledTimes(1);
  });

  it('délai plafonné à 60 s ; arrêt à la fermeture de la carte', async () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(styleRetryDelayMs)).toEqual([2000, 4000, 8000, 16_000, 30_000, 60_000, 60_000, 60_000]);
    const e = env();
    const loader = new RemoteStyleLoader(URL_STYLE, jest.fn(), e);
    loader.start();
    await jest.advanceTimersByTimeAsync(0);
    loader.dispose();
    await jest.advanceTimersByTimeAsync(600_000);
    expect(e.fetch).toHaveBeenCalledTimes(1);
    e.fire();
    expect(e.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('URL du style', () => {
  it('ressources relatives résolues par rapport au style, gabarits conservés', () => {
    const base = 'https://tiles.example.org/styles/positron/style.json';
    expect(resolveStyleUrl('https://cdn.example.org/s', base)).toBe('https://cdn.example.org/s');
    expect(resolveStyleUrl('/fonts/{fontstack}/{range}.pbf', base)).toBe('https://tiles.example.org/fonts/{fontstack}/{range}.pbf');
    expect(resolveStyleUrl('sprites/positron', base)).toBe('https://tiles.example.org/styles/positron/sprites/positron');
    const s = absolutizeStyle(
      {
        version: 8,
        sprite: [{ id: 'default', url: 'sprite' }],
        glyphs: '../fonts/{fontstack}/{range}.pbf',
        sources: { a: { type: 'vector', tiles: ['/t/{z}/{x}/{y}.pbf'] }, b: { type: 'vector', url: 'https://x.org/tiles.json' } },
        layers: [],
      },
      base,
    );
    expect(s.sprite).toEqual([{ id: 'default', url: 'https://tiles.example.org/styles/positron/sprite' }]);
    expect(s.glyphs).toBe('https://tiles.example.org/styles/positron/../fonts/{fontstack}/{range}.pbf');
    expect((s.sources as Record<string, { tiles?: string[]; url?: string }>).a?.tiles).toEqual(['https://tiles.example.org/t/{z}/{x}/{y}.pbf']);
    expect((s.sources as Record<string, { url?: string }>).b?.url).toBe('https://x.org/tiles.json');
  });
});

describe('fond sombre et cache des styles par fond', () => {
  it('fond clair par défaut (positron), fond sombre : OpenFreeMap « dark » et son style de secours', () => {
    expect(mapThemeConfig().styleUrl).toBe(MAP_STYLE_URL);
    expect(mapThemeConfig('light')).toEqual({ styleUrl: MAP_STYLE_URL, fallback: FALLBACK_STYLE, palette: MAP_PALETTES.light });
    const darkCfg = mapThemeConfig('dark');
    expect(DEFAULT_MAP_STYLE_DARK_URL).toBe('https://tiles.openfreemap.org/styles/dark');
    expect(darkCfg.styleUrl).toBe(MAP_STYLE_DARK_URL);
    expect(darkCfg.styleUrl).not.toBe(MAP_STYLE_URL);
    expect(darkCfg.fallback).toBe(FALLBACK_STYLE_DARK);
    expect(FALLBACK_STYLE_DARK.layers[0]?.paint['background-color']).toBe(MAP_PALETTES.dark.background);
    // Le fond clair garde exactement les couleurs d'origine des tracés.
    expect(MAP_PALETTES.light).toEqual(
      expect.objectContaining({ route: MAP_COLORS.route, casing: MAP_COLORS.casing, dashed: MAP_COLORS.dashed, background: MAP_COLORS.background }),
    );
    expect(MAP_PALETTES.dark.route).not.toBe(MAP_COLORS.route);
  });

  it('style reçu mis en cache par URL : une carte sombre ne remplace jamais le style clair', () => {
    const cache = new StyleCache();
    const light = { version: 8, sources: {}, layers: [{ id: 'clair' }] };
    const darkStyle = { version: 8, sources: {}, layers: [{ id: 'sombre' }] };
    expect(initialMapStyle(MAP_STYLE_URL, FALLBACK_STYLE, cache)).toEqual({ style: FALLBACK_STYLE, remote: false });
    cache.set(MAP_STYLE_URL, light);
    expect(initialMapStyle(MAP_STYLE_URL, FALLBACK_STYLE, cache)).toEqual({ style: light, remote: true });
    // Fond sombre pas encore reçu : son propre secours, le style clair n'est pas réutilisé.
    expect(initialMapStyle(MAP_STYLE_DARK_URL, FALLBACK_STYLE_DARK, cache)).toEqual({ style: FALLBACK_STYLE_DARK, remote: false });
    cache.set(MAP_STYLE_DARK_URL, darkStyle);
    expect(initialMapStyle(MAP_STYLE_DARK_URL, FALLBACK_STYLE_DARK, cache).style).toEqual(darkStyle);
    expect(initialMapStyle(MAP_STYLE_URL, FALLBACK_STYLE, cache).style).toEqual(light);
  });

  it('le cache rend des copies (MapLibre ne peut pas modifier le style gardé)', () => {
    const cache = new StyleCache();
    cache.set('u', { version: 8, layers: [{ id: 'a' }] });
    const first = cache.get('u')!;
    (first.layers as Array<{ id: string }>)[0]!.id = 'modifié';
    expect((cache.get('u')!.layers as Array<{ id: string }>)[0]!.id).toBe('a');
    expect(cache.has('u')).toBe(true);
    cache.clear();
    expect(cache.get('u')).toBeNull();
  });
});
