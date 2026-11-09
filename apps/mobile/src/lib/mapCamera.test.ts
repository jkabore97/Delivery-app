import { act, renderHook } from '@testing-library/react-native';
import { useFollowCamera } from '../hooks/useFollowCamera';
import {
  clampPadding,
  followReducer,
  INITIAL_FOLLOW,
  clampBasePadding,
  nativeEdgePadding,
  nativeFitPadding,
  shouldShowRecenter,
  trackingPadding,
  withDefaultPadding,
} from './mapCamera';
import { activeLegPoints, resolveLines } from './map/lines';

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

  it('cadrage : étape en cours dessinée depuis la position affichée du livreur (pendant son glissement)', () => {
    const shown = { lat: 12.36, lng: -1.5206 };
    const pts = activeLegPoints(
      [
        { id: 'r', kind: 'route', points, trimToMarkerId: 'd' },
        { id: 'next', kind: 'dashed', points: [points[0]!, points[2]!] },
      ],
      () => shown,
    );
    expect(pts).toContainEqual(shown);
    expect(pts).toContainEqual(points[2]);
    // L'étape suivante (sans livreur) n'est pas ajoutée au cadrage.
    expect(pts).not.toContainEqual(points[0]);
    expect(activeLegPoints([{ id: 'r', kind: 'route', points, trimToMarkerId: 'd' }], () => null)).toEqual(points);
  });

  it('ligne droite : part de la position animée ; sans position, inchangée', () => {
    const line = { id: 'x', kind: 'dashed' as const, points: [points[0]!, points[2]!], trimToMarkerId: 'd' };
    expect(resolveLines([line], () => ({ lat: 1, lng: 2 }))[0]!.points[0]).toEqual({ lat: 1, lng: 2 });
    expect(resolveLines([line], () => null)[0]!.points).toEqual(line.points);
  });
});

describe('marges des cartes de suivi (feuille en bas)', () => {
  it('en bas : feuille + 90 px ; côtés : au moins 60 px ; en haut : boutons flottants + une épingle', () => {
    const p = trackingPadding(380, 47, 390);
    expect(p.bottom).toBe(470);
    expect(p.left).toBeGreaterThanOrEqual(60);
    expect(p.right).toBeGreaterThanOrEqual(60);
    expect(p.top).toBe(47 + 104);
    expect(trackingPadding(0, 0, 1024).left).toBeGreaterThan(64);
  });

  it('feuille dépliée sur un petit téléphone : marges bornées à la taille de la carte (web et natif)', () => {
    const p = trackingPadding(550, 24, 360);
    const c = clampPadding(p, 360, 640);
    expect(c.top + c.bottom).toBeLessThanOrEqual(640 - 80);
    expect(c.left + c.right).toBeLessThanOrEqual(360 - 80);
    expect(c.bottom).toBeGreaterThan(c.top);
  });

  it('natif : Android additionne la marge de base (logo Google au-dessus de la feuille), iOS non', () => {
    const pad = { top: 150, right: 64, bottom: 470, left: 64 };
    const base = { top: 0, right: 0, bottom: 380, left: 0 };
    expect(nativeEdgePadding(pad, base, 'android')).toEqual({ top: 150, right: 64, bottom: 90, left: 64 });
    expect(nativeEdgePadding(pad, base, 'ios')).toEqual(pad);
    // Jamais de marge négative.
    expect(nativeEdgePadding({ ...pad, bottom: 100 }, base, 'android').bottom).toBe(0);
  });

  it('natif, feuille dépliée (86 %) sur 360 × 640 : marge de base + cadrage tiennent toujours dans la carte', () => {
    const base = clampBasePadding({ top: 0, right: 0, bottom: 550, left: 0 }, 360, 640);
    expect(base.bottom).toBeLessThanOrEqual(640 - 80);
    const pad = trackingPadding(550, 24, 360);
    for (const platform of ['android', 'ios']) {
      const e = nativeFitPadding(pad, base, platform, 360, 640);
      const totalV = e.top + e.bottom + (platform === 'android' ? base.top + base.bottom : 0);
      expect(totalV).toBeLessThanOrEqual(640 - 80);
      expect(e.left + e.right).toBeLessThanOrEqual(360 - 80);
      expect(Math.min(e.top, e.bottom, e.left, e.right)).toBeGreaterThanOrEqual(0);
    }
    // Feuille repliée : Android ne garde que les 90 px au-dessus de la feuille, iOS la marge complète.
    const folded = { top: 0, right: 0, bottom: 300, left: 0 };
    expect(nativeFitPadding(trackingPadding(300, 24, 390), folded, 'android', 390, 844).bottom).toBe(90);
    expect(nativeFitPadding(trackingPadding(300, 24, 390), folded, 'ios', 390, 844).bottom).toBe(390);
  });
});
