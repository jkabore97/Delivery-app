import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { distanceM, type LatLng } from '@yaar/shared';
import { JUMP_M, SmoothMover } from '../src/lib/map/motion';
import { DRIVER_ANIMATION_MS } from '../src/lib/map/style';

const A: LatLng = { lat: 12.37, lng: -1.52 };
/** ≈ 1,1 km à l'est de A. */
const B: LatLng = { lat: 12.37, lng: -1.51 };

function setup(durationMs = DRIVER_ANIMATION_MS) {
  const moves: Array<{ id: string; pos: LatLng; heading: number | null }> = [];
  const frames: boolean[] = [];
  const mover = new SmoothMover({
    durationMs,
    onMove: (id, pos, heading) => moves.push({ id, pos, heading }),
    onFrame: (animating) => frames.push(animating),
  });
  return { mover, moves, frames, last: () => moves.at(-1)! };
}

beforeEach(() => {
  // requestAnimationFrame (≈ 16 ms) et performance.now() suivent l'horloge simulée.
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout', 'Date'] });
});
afterEach(() => vi.useRealTimers());

describe('SmoothMover (glissement des livreurs entre deux rafraîchissements)', () => {
  it('l’animation dure ~1,5 s', () => {
    expect(DRIVER_ANIMATION_MS).toBe(1500);
  });

  it('première position : placée tout de suite, sans image demandée', () => {
    const { mover, moves } = setup();
    mover.moveTo('d', A, 90);
    expect(moves).toEqual([{ id: 'd', pos: A, heading: 90 }]);
    expect(mover.animating).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('nouvelle position : part de la position affichée, mi-chemin à 750 ms, arrivée exacte à 1,5 s puis plus aucune image', () => {
    const { mover, moves, frames, last } = setup();
    mover.moveTo('d', A, 90);
    mover.moveTo('d', B, 90);
    expect(mover.animating).toBe(true);
    expect(mover.position('d')).toEqual(A); // rien ne saute avant la première image
    vi.advanceTimersByTime(100);
    const early = last().pos;
    expect(early.lng).toBeGreaterThan(A.lng);
    expect(early.lng - A.lng).toBeLessThan((B.lng - A.lng) * 0.05); // départ en douceur
    vi.advanceTimersByTime(650); // t = 750 ms
    expect(last().pos.lng).toBeCloseTo((A.lng + B.lng) / 2, 3);
    vi.advanceTimersByTime(760); // t > 1,5 s
    expect(last().pos).toEqual(B);
    expect(mover.position('d')).toEqual(B);
    expect(mover.animating).toBe(false);
    expect(frames.at(-1)).toBe(false); // dernière image signalée (tracé rafraîchi une dernière fois)
    const count = moves.length;
    vi.advanceTimersByTime(5000);
    expect(moves.length).toBe(count);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cap : interpolé par le plus court chemin (350° → 10° passe par 0°)', () => {
    const { mover, last } = setup();
    mover.moveTo('d', A, 350);
    mover.moveTo('d', B, 10);
    vi.advanceTimersByTime(750);
    const h = last().heading!;
    expect(Math.min(h, 360 - h)).toBeLessThan(1);
    vi.advanceTimersByTime(800);
    expect(last().heading).toBe(10);
  });

  it('cap inconnu : déduit du déplacement ; aucun cap ni mouvement : pas de flèche', () => {
    const { mover, last } = setup();
    mover.moveTo('d', A, null);
    expect(last().heading).toBeNull();
    mover.moveTo('d', B, null);
    vi.advanceTimersByTime(1600);
    expect(last().heading).toBeCloseTo(90, 0); // vers l'est
  });

  it('saut de plus de 2,5 km (données anciennes) : placement immédiat', () => {
    const { mover, last } = setup();
    mover.moveTo('d', A, 0);
    const far = { lat: A.lat + 0.05, lng: A.lng };
    expect(distanceM(A, far)).toBeGreaterThan(JUMP_M);
    mover.moveTo('d', far, 0);
    expect(last().pos).toEqual(far);
    expect(mover.animating).toBe(false);
  });

  it('nouvelle position en plein glissement : repart de la position affichée, sans retour en arrière', () => {
    const { mover, last } = setup();
    mover.moveTo('d', A, 90);
    mover.moveTo('d', B, 90);
    vi.advanceTimersByTime(750);
    const shown = last().pos;
    const C = { lat: 12.37, lng: -1.505 };
    mover.moveTo('d', C, 90);
    vi.advanceTimersByTime(16);
    expect(last().pos.lng).toBeGreaterThanOrEqual(shown.lng);
    vi.advanceTimersByTime(1600);
    expect(last().pos).toEqual(C);
  });

  it('même position (bruit < 0,3 m) et même cap : rien à animer ; dispose annule l’image en attente', () => {
    const { mover, moves } = setup();
    mover.moveTo('d', A, 45);
    mover.moveTo('d', { lat: A.lat + 0.000001, lng: A.lng }, 45);
    expect(mover.animating).toBe(false);
    expect(moves).toHaveLength(1);
    mover.moveTo('d', B, 45);
    expect(vi.getTimerCount()).toBe(1);
    mover.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(mover.has('d')).toBe(false);
  });

  it('plusieurs livreurs dans la même image ; retrait d’une piste', () => {
    const { mover, moves } = setup();
    mover.moveTo('a', A, 0);
    mover.moveTo('b', B, 0);
    mover.moveTo('a', { lat: A.lat + 0.002, lng: A.lng }, 0);
    mover.moveTo('b', { lat: B.lat + 0.002, lng: B.lng }, 0);
    vi.advanceTimersByTime(1600);
    expect(new Set(moves.slice(2).map((m) => m.id))).toEqual(new Set(['a', 'b']));
    mover.remove('a');
    expect(mover.position('a')).toBeUndefined();
    expect(mover.position('b')).toEqual({ lat: B.lat + 0.002, lng: B.lng });
  });
});
