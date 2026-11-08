import { act, renderHook } from '@testing-library/react-native';
import { useFollowCamera } from '../hooks/useFollowCamera';
import { clampPadding, followReducer, INITIAL_FOLLOW, shouldShowRecenter, withDefaultPadding } from './mapCamera';
import { resolveLines } from './map/lines';

describe('caméra : suivi et « Recentrer »', () => {
  it('suit le livreur, s’arrête au premier geste, « Recentrer » relance le suivi et recadre', () => {
    let s = INITIAL_FOLLOW;
    expect(shouldShowRecenter(s, 2)).toBe(false);
    s = followReducer(s, { type: 'gesture' });
    expect(s).toEqual({ following: false, recenterKey: 0 });
    expect(shouldShowRecenter(s, 2)).toBe(true);
    expect(followReducer(s, { type: 'gesture' })).toBe(s); // gestes suivants : rien ne change
    s = followReducer(s, { type: 'recenter' });
    expect(s).toEqual({ following: true, recenterKey: 1 });
    expect(shouldShowRecenter(s, 2)).toBe(false);
  });

  it('rien à cadrer : pas de bouton', () => {
    expect(shouldShowRecenter({ following: false, recenterKey: 0 }, 0)).toBe(false);
  });

  it('nouvelle étape (colis récupéré) : recadrage et reprise du suivi, même après un geste', async () => {
    const { result, rerender } = await renderHook(({ stage }: { stage: string }) => useFollowCamera(stage, 2), {
      initialProps: { stage: 'ASSIGNED' },
    });
    expect(result.current.follow).toBe(true);
    await act(async () => result.current.onUserGesture());
    expect(result.current.follow).toBe(false);
    expect(result.current.showRecenter).toBe(true);
    await rerender({ stage: 'PICKED_UP' });
    expect(result.current.follow).toBe(true);
    expect(result.current.recenterKey).toBe(1);
    expect(result.current.showRecenter).toBe(false);
    await act(async () => result.current.onUserGesture());
    await act(async () => result.current.recenter());
    expect(result.current).toMatchObject({ follow: true, recenterKey: 2, showRecenter: false });
  });

  it('marges : feuille du bas prise en compte, réduites si elles dépassent la carte', () => {
    expect(withDefaultPadding({ bottom: 400 })).toEqual({ top: 72, right: 48, bottom: 400, left: 48 });
    expect(clampPadding({ top: 80, right: 40, bottom: 300, left: 40 }, 390, 844)).toEqual({ top: 80, right: 40, bottom: 300, left: 40 });
    const c = clampPadding({ top: 100, right: 40, bottom: 700, left: 40 }, 390, 600);
    expect(c.top + c.bottom).toBeLessThanOrEqual(520);
    expect(c.bottom / c.top).toBeCloseTo(7, 0);
  });
});

describe('tracé rogné à la position animée du livreur', () => {
  const points = [
    { lat: 12.3686, lng: -1.5275 },
    { lat: 12.3627, lng: -1.521 },
    { lat: 12.3395, lng: -1.517 },
  ];

  it('itinéraire : la partie parcourue disparaît', () => {
    const drawn = resolveLines([{ id: 'r', kind: 'route', points, trimToMarkerId: 'd' }], () => ({ lat: 12.36, lng: -1.5206 }));
    expect(drawn).toHaveLength(1);
    expect(drawn[0]!.points).toHaveLength(2);
    expect(drawn[0]!.points[1]).toEqual(points[2]);
    expect(drawn[0]!.points[0]!.lat).toBeLessThan(12.3627);
  });

  it('livreur loin du tracé : court pointillé de raccord', () => {
    const drawn = resolveLines([{ id: 'r', kind: 'route', points, trimToMarkerId: 'd' }], () => ({ lat: 12.35, lng: -1.53 }));
    expect(drawn.map((l) => `${l.id}:${l.kind}`)).toEqual(['r-join:dashed', 'r:route']);
  });

  it('ligne droite : part de la position animée ; sans position, inchangée', () => {
    const line = { id: 'x', kind: 'dashed' as const, points: [points[0]!, points[2]!], trimToMarkerId: 'd' };
    expect(resolveLines([line], () => ({ lat: 1, lng: 2 }))[0]!.points[0]).toEqual({ lat: 1, lng: 2 });
    expect(resolveLines([line], () => null)[0]!.points).toEqual(line.points);
  });
});
