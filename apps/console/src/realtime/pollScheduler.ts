/**
 * Planificateur de rafraîchissements pour le mode « poll » (API sur Vercel, sans Socket.IO).
 * Règles (docs/API.md, « Mode polling (Vercel) ») :
 * - chaque tâche est relancée toutes les `intervalMs` tant que l'onglet est visible ;
 * - onglet masqué : plus aucune requête ; de nouveau visible : un rafraîchissement immédiat ;
 * - erreur réseau (tâche rejetée ou qui renvoie `false`) : intervalle doublé, au plus 30 s.
 */

export type PollTask = () => unknown;

/** Source de visibilité (document.visibilityState dans le navigateur, simulable en test). */
export interface VisibilitySource {
  isVisible(): boolean;
  subscribe(listener: (visible: boolean) => void): () => void;
}

export const MAX_POLL_BACKOFF_MS = 30_000;

interface Entry {
  fn: PollTask;
  intervalMs: number;
  delayMs: number;
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  removed: boolean;
}

export function documentVisibility(doc: Document = document): VisibilitySource {
  return {
    isVisible: () => doc.visibilityState !== 'hidden',
    subscribe(listener) {
      const h = () => listener(doc.visibilityState !== 'hidden');
      doc.addEventListener('visibilitychange', h);
      return () => doc.removeEventListener('visibilitychange', h);
    },
  };
}

export class PollScheduler {
  private readonly entries = new Set<Entry>();
  private visible: boolean;
  private readonly unsubscribe: () => void;

  constructor(
    visibility: VisibilitySource,
    private readonly maxBackoffMs = MAX_POLL_BACKOFF_MS,
  ) {
    this.visible = visibility.isVisible();
    this.unsubscribe = visibility.subscribe((v) => this.setVisible(v));
  }

  /** Ajoute une tâche périodique (premier appel après `intervalMs`) ; renvoie la fonction de retrait. */
  add(fn: PollTask, intervalMs: number): () => void {
    const entry: Entry = { fn, intervalMs, delayMs: intervalMs, timer: null, running: false, removed: false };
    this.entries.add(entry);
    this.schedule(entry);
    return () => {
      entry.removed = true;
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = null;
      this.entries.delete(entry);
    };
  }

  get size(): number {
    return this.entries.size;
  }

  get isVisible(): boolean {
    return this.visible;
  }

  dispose(): void {
    this.unsubscribe();
    for (const e of this.entries) {
      e.removed = true;
      if (e.timer) clearTimeout(e.timer);
    }
    this.entries.clear();
  }

  private setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    for (const e of this.entries) {
      if (e.timer) clearTimeout(e.timer);
      e.timer = null;
      // Retour au premier plan : rattrapage immédiat, puis rythme normal.
      if (visible) void this.run(e);
    }
  }

  private schedule(e: Entry): void {
    if (e.timer) clearTimeout(e.timer);
    e.timer = null;
    if (!this.visible || e.removed) return;
    e.timer = setTimeout(() => {
      e.timer = null;
      void this.run(e);
    }, e.delayMs);
  }

  private async run(e: Entry): Promise<void> {
    if (e.running || e.removed) return;
    e.running = true;
    let ok = true;
    try {
      ok = (await e.fn()) !== false;
    } catch {
      ok = false;
    }
    e.running = false;
    if (e.removed) return;
    e.delayMs = ok ? e.intervalMs : Math.min(e.delayMs * 2, Math.max(this.maxBackoffMs, e.intervalMs));
    this.schedule(e);
  }
}
