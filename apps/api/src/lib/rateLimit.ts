import type { Clock } from './clock';
import { AppError } from './errors';

/**
 * Limiteur à fenêtre fixe, en mémoire (une seule instance d'API en Lot 1).
 * `limit = 0` désactive la limite.
 */
export class FixedWindowLimiter {
  private readonly hits = new Map<string, { windowStart: number; count: number }>();

  constructor(
    private readonly clock: Clock,
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Compte une requête pour `key` ; lève 429 RATE_LIMITED au-delà de la limite. */
  hit(key: string): void {
    if (this.limit <= 0) return;
    const now = this.clock.now().getTime();
    const cur = this.hits.get(key);
    if (!cur || now - cur.windowStart >= this.windowMs) {
      this.hits.set(key, { windowStart: now, count: 1 });
      if (this.hits.size > 10_000) this.prune(now);
      return;
    }
    cur.count++;
    if (cur.count > this.limit)
      throw new AppError(429, 'RATE_LIMITED', 'Trop de requêtes depuis cette adresse. Réessayez dans quelques minutes.');
  }

  private prune(now: number): void {
    for (const [k, v] of this.hits) if (now - v.windowStart >= this.windowMs) this.hits.delete(k);
  }
}
