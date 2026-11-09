import { COUNTDOWN_WARNING_SECONDS, countdownColor, formatCountdown, isCountdownWarning, remainingFraction, ringArcPath, secondsLeft } from './countdown';

describe('compte à rebours des offres', () => {
  const offeredAt = '2026-11-06T09:43:00.000Z';
  const expiresAt = '2026-11-06T09:43:30.000Z';
  const t0 = Date.parse(offeredAt);

  it('calcule les secondes restantes sans passer sous zéro', () => {
    expect(secondsLeft(expiresAt, t0)).toBe(30);
    expect(secondsLeft(expiresAt, t0 + 15_500)).toBe(15);
    expect(secondsLeft(expiresAt, t0 + 60_000)).toBe(0);
    expect(secondsLeft('pas une date', t0)).toBe(0);
  });

  it('formate 0:14', () => {
    expect(formatCountdown(14)).toBe('0:14');
    expect(formatCountdown(75)).toBe('1:15');
    expect(formatCountdown(-3)).toBe('0:00');
  });

  it('donne la fraction restante', () => {
    expect(remainingFraction(offeredAt, expiresAt, t0)).toBe(1);
    expect(remainingFraction(offeredAt, expiresAt, t0 + 15_000)).toBeCloseTo(0.5);
    expect(remainingFraction(offeredAt, expiresAt, t0 + 40_000)).toBe(0);
  });
});

describe('anneau du compte à rebours (offre)', () => {
  const offeredAt = '2026-11-06T09:43:00.000Z';
  const expiresAt = '2026-11-06T09:43:30.000Z';
  const t0 = Date.parse(offeredAt);

  it('fraction de l’anneau : pleine à l’offre, moitié à 15 s, vide à l’échéance', () => {
    expect(remainingFraction(offeredAt, expiresAt, t0)).toBe(1);
    expect(remainingFraction(offeredAt, expiresAt, t0 + 22_500)).toBeCloseTo(0.25);
    expect(remainingFraction(offeredAt, expiresAt, t0 + 30_000)).toBe(0);
    // Délai invalide (expire avant d'être offerte) : anneau vide, jamais négatif.
    expect(remainingFraction(expiresAt, offeredAt, t0)).toBe(0);
  });

  it('rouge pendant les 10 dernières secondes seulement', () => {
    expect(COUNTDOWN_WARNING_SECONDS).toBe(10);
    expect([30, 11, 10, 1, 0].map((s) => isCountdownWarning(s))).toEqual([false, false, true, true, false]);
    const colors = { color: 'vert', warningColor: 'rouge' };
    expect(countdownColor(secondsLeft(expiresAt, t0 + 19_500), colors)).toBe('vert'); // 11 s
    expect(countdownColor(secondsLeft(expiresAt, t0 + 20_500), colors)).toBe('rouge'); // 10 s
    expect(countdownColor(3, { ...colors, warningSeconds: 2 })).toBe('vert');
  });

  it('tracé de l’arc : part du haut, sens horaire, cercle complet en deux demi-arcs', () => {
    expect(ringArcPath(0, 50, 50, 40)).toBe('');
    // Quart de tour : du haut (50, 10) vers la droite (90, 50), petit arc.
    expect(ringArcPath(0.25, 50, 50, 40)).toBe('M50 10 A40 40 0 0 1 90 50');
    // Trois quarts : grand arc jusqu'à la gauche (10, 50).
    expect(ringArcPath(0.75, 50, 50, 40)).toBe('M50 10 A40 40 0 1 1 10 50');
    expect(ringArcPath(1, 50, 50, 40)).toBe('M50 10 A40 40 0 1 1 50 90 A40 40 0 1 1 50 10');
    expect(ringArcPath(Number.NaN, 50, 50, 40)).toBe('');
  });
});
