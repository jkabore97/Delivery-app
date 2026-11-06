import { formatCountdown, remainingFraction, secondsLeft } from './countdown';

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
