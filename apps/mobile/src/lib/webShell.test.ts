import type { TrackingDto } from '@yaar/shared';
import {
  isFullWidthPath,
  isSlowConnection,
  isWideAppPath,
  prefetchPublicTracking,
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

  it('espace entreprise sur ordinateur (≥ 1024 px) : toute la fenêtre ; colonne « téléphone » ailleurs ou plus étroit', () => {
    expect(isWideAppPath('/business', 1024)).toBe(true);
    expect(isWideAppPath('/business/livraison/o1', 1440)).toBe(true);
    expect(isWideAppPath('/business/nouvelle', 1280)).toBe(true);
    expect(isWideAppPath('/business', 1023)).toBe(false);
    expect(isWideAppPath('/businessman', 1440)).toBe(false);
    expect(isWideAppPath('/driver', 1440)).toBe(false);
    expect(isWideAppPath('/suivi/tok', 1440)).toBe(false); // la page publique a sa règle (isFullWidthPath)
    expect(isWideAppPath(null, 1440)).toBe(false);
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

  it('connexion très lente (2G, économie de données) : même règle que l’écran de démarrage du HTML', () => {
    expect(isSlowConnection({ connection: { effectiveType: 'slow-2g' } })).toBe(true);
    expect(isSlowConnection({ connection: { effectiveType: '2g' } })).toBe(true);
    expect(isSlowConnection({ connection: { saveData: true, effectiveType: '4g' } })).toBe(true);
    expect(isSlowConnection({ connection: { effectiveType: '3g' } })).toBe(false);
    expect(isSlowConnection({})).toBe(false);
  });
});
