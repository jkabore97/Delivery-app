/** Secondes restantes avant `expiresAt` (jamais négatif, arrondi au supérieur). */
export function secondsLeft(expiresAt: string, now: number): number {
  const ms = Date.parse(expiresAt) - now;
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, Math.ceil(ms / 1000));
}

/** « 0:14 » */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Fraction restante (1 → 0) pour la barre de progression d'une offre. */
export function remainingFraction(offeredAt: string, expiresAt: string, now: number): number {
  const total = Date.parse(expiresAt) - Date.parse(offeredAt);
  if (!(total > 0)) return 0;
  return Math.min(1, Math.max(0, (Date.parse(expiresAt) - now) / total));
}
