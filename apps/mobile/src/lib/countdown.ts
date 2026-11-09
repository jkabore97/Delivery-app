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

/** Dernières secondes d'une offre : l'anneau du compte à rebours passe au rouge. */
export const COUNTDOWN_WARNING_SECONDS = 10;

/** true pendant les `threshold` dernières secondes (et pas après la fin). */
export function isCountdownWarning(secondsLeftValue: number, threshold: number = COUNTDOWN_WARNING_SECONDS): boolean {
  return secondsLeftValue > 0 && secondsLeftValue <= threshold;
}

/** Couleur de l'anneau : `color`, puis `warningColor` pendant les `warningSeconds` dernières secondes. */
export function countdownColor(
  secondsLeftValue: number,
  { color, warningColor, warningSeconds = COUNTDOWN_WARNING_SECONDS }: { color: string; warningColor: string; warningSeconds?: number },
): string {
  return isCountdownWarning(secondsLeftValue, warningSeconds) ? warningColor : color;
}

/**
 * Tracé SVG (`d`) de l'arc restant d'un anneau de compte à rebours : part du haut (midi) et tourne dans le sens des
 * aiguilles d'une montre sur `fraction` du tour (1 = tour complet, 0 = rien). Un arc seul ne peut pas fermer le
 * cercle : au-delà de 99,9 %, deux demi-arcs. Arrondi au centième (tracé compact, identique web / natif).
 */
export function ringArcPath(fraction: number, cx: number, cy: number, r: number): string {
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  if (f <= 0 || r <= 0) return '';
  const n = (v: number) => Math.round(v * 100) / 100;
  const top = `M${n(cx)} ${n(cy - r)}`;
  if (f >= 0.999) {
    return `${top} A${n(r)} ${n(r)} 0 1 1 ${n(cx)} ${n(cy + r)} A${n(r)} ${n(r)} 0 1 1 ${n(cx)} ${n(cy - r)}`;
  }
  const a = f * 2 * Math.PI;
  const x = cx + r * Math.sin(a);
  const y = cy - r * Math.cos(a);
  return `${top} A${n(r)} ${n(r)} 0 ${a > Math.PI ? 1 : 0} 1 ${n(x)} ${n(y)}`;
}
