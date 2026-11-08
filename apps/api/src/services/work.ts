import { Prisma, type PrismaClient } from '@prisma/client';
import type { Clock } from '../lib/clock';
import type { DispatchService, TickResult } from './dispatch';

export interface WorkConfig {
  /** Au plus un cycle par fenêtre, toutes instances confondues. */
  throttleMs: number;
  /** Temps maximal d'attente du cycle par la requête qui le déclenche (le reste continue en arrière-plan). */
  budgetMs: number;
  /** Durée du bail : si l'instance qui le tient disparaît, une autre le reprend après ce délai. */
  leaseMs: number;
}

export type DueWorkResult =
  | { ran: true; tick: TickResult }
  | { ran: false; reason: 'not_due' };

export const DISPATCH_JOB = 'dispatch';

/**
 * Tâches de fond sans processus permanent (mode poll / Vercel) : expiration des offres (30 s),
 * relance des commandes en attente, mise hors ligne des livreurs silencieux.
 *
 * `runDueWork()` est sûr entre plusieurs instances : un bail en base (`JobLease`, pris par une mise à
 * jour conditionnelle) garantit qu'une seule instance exécute le cycle à la fois et au plus une fois
 * par `throttleMs`. Les opérations du cycle restent elles-mêmes idempotentes (mises à jour
 * conditionnelles, index uniques partiels sur les offres ouvertes).
 * Il est déclenché paresseusement par les requêtes utiles (`kick()`) et par le cron quotidien.
 * En mode socket (serveur persistant), `server.ts` garde l'appel périodique de `dispatch.tick()`.
 */
export class BackgroundWork {
  private lastLocalAttempt = Number.NEGATIVE_INFINITY;
  private inFlight: Promise<DueWorkResult> | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: Clock,
    private readonly dispatch: DispatchService,
    private readonly cfg: WorkConfig,
    private readonly onError: (err: unknown) => void = () => {},
  ) {}

  /** Prend le bail `name` s'il est libre et que le dernier cycle date d'au moins `throttleMs`. */
  private async claim(name: string, now: Date): Promise<boolean> {
    const lockedUntil = new Date(now.getTime() + this.cfg.leaseMs);
    const r = await this.prisma.jobLease.updateMany({
      where: {
        name,
        lockedUntil: { lte: now },
        lastStartedAt: { lte: new Date(now.getTime() - this.cfg.throttleMs) },
      },
      data: { lastStartedAt: now, lockedUntil },
    });
    if (r.count === 1) return true;
    try {
      await this.prisma.jobLease.create({ data: { name, lastStartedAt: now, lockedUntil } });
      return true;
    } catch (err) {
      // Le bail existe déjà (tenu par une autre instance ou cycle trop récent).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
      throw err;
    }
  }

  private async release(name: string, startedAt: Date): Promise<void> {
    await this.prisma.jobLease.updateMany({
      where: { name, lastStartedAt: startedAt },
      data: { lockedUntil: this.clock.now() },
    });
  }

  /** Exécute le cycle d'affectation s'il est dû et que personne d'autre ne l'exécute. */
  runDueWork(): Promise<DueWorkResult> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.runUnlocked().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async runUnlocked(): Promise<DueWorkResult> {
    const startedAt = this.clock.now();
    if (!(await this.claim(DISPATCH_JOB, startedAt))) return { ran: false, reason: 'not_due' };
    try {
      return { ran: true, tick: await this.dispatch.tick() };
    } finally {
      await this.release(DISPATCH_JOB, startedAt);
    }
  }

  /**
   * Déclenchement paresseux par une requête : sans requête en base si le dernier essai de cette
   * instance est trop récent ; sinon lance `runDueWork()` et l'attend au plus `budgetMs`.
   */
  async kick(): Promise<void> {
    const now = this.clock.now().getTime();
    if (now - this.lastLocalAttempt < this.cfg.throttleMs) return;
    this.lastLocalAttempt = now;
    const run = this.runDueWork().catch((err: unknown) => {
      this.onError(err);
      return null;
    });
    if (this.cfg.budgetMs <= 0) return;
    let timer: NodeJS.Timeout | undefined;
    const budget = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, this.cfg.budgetMs);
    });
    await Promise.race([run, budget]);
    clearTimeout(timer);
  }
}
