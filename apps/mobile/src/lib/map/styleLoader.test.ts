import { absolutizeStyle, RemoteStyleLoader, resolveStyleUrl, styleRetryDelayMs, type StyleLoaderEnv } from './styleLoader';

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
