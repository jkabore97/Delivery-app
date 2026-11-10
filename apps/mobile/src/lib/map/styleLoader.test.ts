import { ANDROID_MAP_STYLE, DEFAULT_MAP_STYLE_URL, FALLBACK_STYLE, MAP_COLORS, MAP_PALETTE, MAP_STYLE_URL, mapThemeConfig, resolveMapStyleUrl } from './style';
import { COBALT_MAP, rgba } from './palette';
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

describe('fond Cobalt partout (plus de fond sombre) et cache des styles', () => {
  it('style par défaut : le fichier Cobalt servi par la version web, URL absolue par rapport à la page', () => {
    expect(DEFAULT_MAP_STYLE_URL).toBe('/map/cobalt-style.json');
    // Sans EXPO_PUBLIC_MAP_STYLE_URL (tests) : le style Cobalt.
    expect(MAP_STYLE_URL).toBe(DEFAULT_MAP_STYLE_URL);
    expect(resolveMapStyleUrl('/map/cobalt-style.json', 'https://yaar-livraison.vercel.app/suivi/abc')).toBe(
      'https://yaar-livraison.vercel.app/map/cobalt-style.json',
    );
    // URL absolue (variable d'environnement) : inchangée ; sans page (natif, tests) : inchangée.
    expect(resolveMapStyleUrl('https://tiles.openfreemap.org/styles/positron', 'https://a.b/')).toBe('https://tiles.openfreemap.org/styles/positron');
    expect(resolveMapStyleUrl('/map/cobalt-style.json')).toBe('/map/cobalt-style.json');
  });

  it('une seule carte, Cobalt : style, secours et couleurs', () => {
    expect(mapThemeConfig()).toEqual({ styleUrl: MAP_STYLE_URL, fallback: FALLBACK_STYLE, palette: MAP_PALETTE });
  });

  it('style de secours : la terre du fond Cobalt, sans source', () => {
    expect(FALLBACK_STYLE.sources).toEqual({});
    expect(FALLBACK_STYLE.layers).toEqual([{ id: 'background', type: 'background', paint: { 'background-color': '#F3F5F8' } }]);
    expect(MAP_COLORS.background).toBe(COBALT_MAP.land);
    expect(MAP_PALETTE.background).toBe('#F3F5F8');
  });

  it('palette Cobalt : itinéraire cobalt à liseré blanc, tirets cobalt, étape à venir encre 30 %, zones cobalt / encre', () => {
    expect(MAP_PALETTE).toMatchObject({
      route: '#2448FF',
      casing: '#FFFFFF',
      chevron: '#FFFFFF',
      dashed: '#2448FF',
      pending: 'rgba(12, 18, 34, 0.32)',
      overlayText: '#5B6475',
      zoneFill: { dropoff: 'rgba(36, 72, 255, 0.1)', pickup: 'rgba(12, 18, 34, 0.06)' },
    });
    // Clés historiques gardées pour les écrans : fonds pleins aux couleurs du système.
    expect(MAP_COLORS).toMatchObject({ pickup: '#0C1222', dropoff: '#2448FF', driver: '#2448FF', driverDisc: '#FFFFFF', driverGlyph: '#2448FF' });
    expect(rgba('#2448FF', 0.5)).toBe('rgba(36, 72, 255, 0.5)');
  });

  it('Google Maps (Android) : terre, eau, parcs, rues blanches et grands axes jaunes Cobalt, ni points d’intérêt ni transports', () => {
    const rule = (featureType: string | undefined, elementType: string | undefined) =>
      ANDROID_MAP_STYLE.find((r) => (r as { featureType?: string }).featureType === featureType && (r as { elementType?: string }).elementType === elementType)?.stylers;
    expect(rule(undefined, 'geometry')).toEqual([{ color: '#F3F5F8' }]);
    expect(rule('water', 'geometry')).toEqual([{ color: '#A9C9FF' }]);
    expect(rule('poi.park', 'geometry')).toEqual([{ visibility: 'on' }, { color: '#D6EEDC' }]);
    expect(rule('road', 'geometry.fill')).toEqual([{ color: '#FFFFFF' }]);
    expect(rule('road.highway', 'geometry.fill')).toEqual([{ color: '#FFE38A' }]);
    expect(rule('poi', undefined)).toEqual([{ visibility: 'off' }]);
    expect(rule('transit', undefined)).toEqual([{ visibility: 'off' }]);
    // Plus aucune teinte de l'ancien fond sombre.
    expect(JSON.stringify(ANDROID_MAP_STYLE)).not.toMatch(/#1a201e|#0f1b20/i);
  });

  it('style reçu mis en cache par URL : une seule entrée Cobalt, réutilisée quel que soit l’ancien « fond »', () => {
    const cache = new StyleCache();
    const cobalt = { version: 8, sources: {}, layers: [{ id: 'cobalt' }] };
    const url = mapThemeConfig().styleUrl;
    expect(initialMapStyle(url, FALLBACK_STYLE, cache)).toEqual({ style: FALLBACK_STYLE, remote: false });
    cache.set(url, cobalt);
    expect(initialMapStyle(url, FALLBACK_STYLE, cache)).toEqual({ style: cobalt, remote: true });
    // Une autre URL (variable d'environnement) a sa propre entrée.
    expect(initialMapStyle('https://tiles.example.org/autre', FALLBACK_STYLE, cache).remote).toBe(false);
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
