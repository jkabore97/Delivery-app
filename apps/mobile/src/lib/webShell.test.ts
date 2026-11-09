import type { TrackingDto } from '@yaar/shared';
import {
  isFullWidthPath,
  isSlowConnection,
  markPublicFontsCached,
  prefetchPublicTracking,
  PUBLIC_FONTS_KEY,
  publicFontsCached,
  takePrefetchedTracking,
  trackingTokenFromPath,
} from './webShell';

jest.mock('./publicApi', () => ({ publicApi: { trackDelivery: jest.fn() } }));

const data = { number: 1052 } as unknown as TrackingDto;

describe('coquille web : page publique de suivi', () => {
  it('jeton de l’adresse /suivi/<jeton> (décodé), rien ailleurs', () => {
    expect(trackingTokenFromPath('/suivi/tok-abc')).toBe('tok-abc');
    expect(trackingTokenFromPath('/suivi/tok%2Dx/')).toBe('tok-x');
    expect(trackingTokenFromPath('/suivi/')).toBeNull();
    expect(trackingTokenFromPath('/driver')).toBeNull();
    expect(trackingTokenFromPath(null)).toBeNull();
    expect(isFullWidthPath('/suivi/tok')).toBe(true);
    expect(isFullWidthPath('/business')).toBe(false);
  });

  it('requête lancée au démarrage : reprise une seule fois, pour le même jeton et récente seulement', async () => {
    const fetcher = jest.fn(async () => data);
    expect(prefetchPublicTracking('/business', fetcher)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();

    expect(prefetchPublicTracking('/suivi/tok-a', fetcher, 1000)).toBe(true);
    expect(fetcher).toHaveBeenCalledWith('tok-a');
    expect(takePrefetchedTracking('tok-b', 1500)).toBeNull();
    await expect(takePrefetchedTracking('tok-a', 1500)).resolves.toBe(data);
    expect(takePrefetchedTracking('tok-a', 1600)).toBeNull(); // déjà reprise

    prefetchPublicTracking('/suivi/tok-a', fetcher, 1000);
    expect(takePrefetchedTracking('tok-a', 1000 + 16_000)).toBeNull(); // trop ancienne : nouvelle requête
  });

  it('erreur de la requête lancée au démarrage : transmise à l’écran qui la reprend, jamais « non traitée »', async () => {
    const fetcher = jest.fn(() => Promise.reject(new Error('réseau')));
    prefetchPublicTracking('/suivi/tok-e', fetcher, 0);
    await expect(takePrefetchedTracking('tok-e', 10)).rejects.toThrow('réseau');
  });

  it('polices de la page publique : « déjà téléchargées » retenu sur l’appareil, jamais d’erreur si le stockage est bloqué', () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(publicFontsCached(store)).toBe(false);
    markPublicFontsCached(store);
    expect(m.get(PUBLIC_FONTS_KEY)).toBe('1');
    expect(publicFontsCached(store)).toBe(true);
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(publicFontsCached(blocked)).toBe(false);
    expect(() => markPublicFontsCached(blocked)).not.toThrow();
    expect(publicFontsCached(null)).toBe(false);
  });

  it('connexion très lente (2G, économie de données) : même règle que l’écran de démarrage du HTML', () => {
    expect(isSlowConnection({ connection: { effectiveType: 'slow-2g' } })).toBe(true);
    expect(isSlowConnection({ connection: { effectiveType: '2g' } })).toBe(true);
    expect(isSlowConnection({ connection: { saveData: true, effectiveType: '4g' } })).toBe(true);
    expect(isSlowConnection({ connection: { effectiveType: '3g' } })).toBe(false);
    expect(isSlowConnection({})).toBe(false);
  });
});
