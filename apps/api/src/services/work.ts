import type { PrismaClient } from '@prisma/client';
import { waitUntil as vercelWaitUntil } from '@vercel/functions';
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
 * Prolonge la fonction jusqu'à la fin d'une promesse lancée pendant la requête : `waitUntil` de
 * @vercel/functions sur Vercel (sinon l'instance peut être gelée dès la réponse envoyée, cycle à moitié
 * fait et bail tenu) ; sans effet ailleurs (pas de contexte de requête Vercel : développement, tests).
 */
export type KeepAlive = (promise: Promise<unknown>) => void;
export const vercelKeepAlive: KeepAlive = (promise) => {
  vercelWaitUntil(promise);
};

/**
 * Attend `run` au plus `budgetMs` ; au-delà (ou budget nul), la promesse est confiée à `keepAlive`
 * (`waitUntil` sur Vercel) et l'appelant reprend la main sans attendre.
 */
export async function waitWithin(run: Promise<unknown>, budgetMs: number, keepAlive: KeepAlive): Promise<void> {
  if (budgetMs <= 0) {
    keepAlive(run);
    return;
  }
  let timer: NodeJS.Timeout | undefined;
  let budgetExpired = false;
  const budget = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      budgetExpired = true;
      resolve();
    }, budgetMs);
  });
  await Promise.race([run, budget]);
  clearTimeout(timer);
  if (budgetExpired) keepAlive(run);
}

/**
 * Tâches de fond sans processus permanent (mode poll / Vercel) : expiration des offres (30 s),
 * relance des commandes en attente, mise hors ligne des livreurs silencieux.
 *
 * `runDueWork()` est sûr entre plusieurs instances : un bail en base (`JobLease`, pris par un
 * INSERT … ON CONFLICT DO UPDATE … WHERE conditionnel) garantit qu'une seule instance exécute le cycle
 * à la fois et au plus une fois par `throttleMs`. Les opérations du cycle restent elles-mêmes idempotentes (mises à jour
 * conditionnelles, index uniques partiels sur les offres ouvertes).
 * Il est déclenché paresseusement par les requêtes utiles (`kick()`) et par le cron quotidien.
 * En mode socket (serveur persistant), `server.ts` garde l'appel périodique de `dispatch.tick()`.
 */
export class BackgroundWork {
  private lastLocalAttempt = Number.NEGATIVE_INFINITY;
  private inFlight: Promise<DueWorkResult> | null = null;
  /** Tâches lancées par `defer()` et pas encore terminées (`settled()`). */
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: Clock,
    private readonly dispatch: DispatchService,
    private readonly cfg: WorkConfig,
    private readonly onError: (err: unknown) => void = () => {},
    private readonly keepAlive: KeepAlive = vercelKeepAlive,
  ) {}

  /**
   * Prend le bail `name` s'il est libre et que le dernier cycle date d'au moins `throttleMs`, en une seule
   * requête atomique : la ligne est créée au premier appel (base vide, après un TRUNCATE…), sinon mise à
   * jour seulement si elle est due. Aucune ligne renvoyée = cycle tenu par une autre instance ou trop récent
   * (pas d'erreur d'unicité, donc pas de « ERROR » dans les journaux PostgreSQL).
   * Les dates sont écrites comme Prisma les écrit (TIMESTAMP(3) sans fuseau, en UTC).
   */
  private async claim(name: string, now: Date): Promise<boolean> {
    const at = now.toISOString();
    const lockedUntil = new Date(now.getTime() + this.cfg.leaseMs).toISOString();
    const dueBefore = new Date(now.getTime() - this.cfg.throttleMs).toISOString();
    const rows = await this.prisma.$queryRaw<Array<{ name: string }>>`
      INSERT INTO "JobLease" ("name", "lastStartedAt", "lockedUntil")
      VALUES (${name}, CAST(${at} AS TIMESTAMP(3)), CAST(${lockedUntil} AS TIMESTAMP(3)))
      ON CONFLICT ("name") DO UPDATE
        SET "lastStartedAt" = EXCLUDED."lastStartedAt", "lockedUntil" = EXCLUDED."lockedUntil"
        WHERE "JobLease"."lockedUntil" <= CAST(${at} AS TIMESTAMP(3))
          AND "JobLease"."lastStartedAt" <= CAST(${dueBefore} AS TIMESTAMP(3))
      RETURNING "name"`;
    return rows.length === 1;
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
   * instance est trop récent ; sinon lance `runDueWork()` et l'attend au plus `budgetMs`. Au-delà, la
   * requête répond sans attendre et le cycle continue en arrière-plan, maintenu en vie par `keepAlive`
   * (`waitUntil` sur Vercel).
   */
  async kick(): Promise<void> {
    const now = this.clock.now().getTime();
    if (now - this.lastLocalAttempt < this.cfg.throttleMs) return;
    this.lastLocalAttempt = now;
    const run = this.runDueWork().catch((err: unknown) => {
      this.onError(err);
      return null;
    });
    await waitWithin(run, this.cfg.budgetMs, this.keepAlive);
  }

  /**
   * Tâche de fond déclenchée par une requête (calcul d'itinéraire, message au destinataire…), avec le même
   * mécanisme que `kick()` : la requête l'attend au plus `budgetMs` (0 = pas du tout), puis la tâche continue
   * maintenue en vie par `keepAlive` (`waitUntil` sur Vercel). Ne lève jamais : les erreurs vont à `onError`.
   */
  async defer(task: () => Promise<unknown>, budgetMs = 0, onError: (err: unknown) => void = this.onError): Promise<void> {
    const run: Promise<void> = Promise.resolve()
      .then(task)
      .then(
        () => undefined,
        (err: unknown) => {
          try {
            onError(err);
          } catch {
            // Journalisation impossible : la tâche de fond ne doit jamais faire échouer la requête.
          }
        },
      )
      .finally(() => {
        this.pending.delete(run);
      });
    this.pending.add(run);
    await waitWithin(run, budgetMs, this.keepAlive);
  }

  /** Attend la fin des tâches lancées par `defer()` (tests, arrêt propre). */
  async settled(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
  }
}
