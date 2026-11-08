import { AppState, type AppStateStatus } from 'react-native';

/**
 * Planificateur de rafraîchissements pour le mode « poll » (API sur Vercel, sans Socket.IO).
 * Règles (docs/API.md, « Mode polling (Vercel) ») :
 * - chaque tâche est relancée toutes les `intervalMs` tant que l'application est au premier plan ;
 * - arrière-plan (ou onglet masqué sur le web) : plus aucune requête ; au retour : un rafraîchissement immédiat ;
 * - erreur réseau (tâche rejetée ou qui renvoie `false`) : intervalle doublé, au plus 30 s.
 */

export type PollTask = () => unknown;

/** Source de visibilité (AppState, qui suit document.visibilityState sur le web ; simulable en test). */
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

/** Premier plan = AppState « active » (react-native-web le dérive de document.visibilityState). */
export function appStateVisibility(): VisibilitySource {
  const isActive = (s: AppStateStatus | null | undefined) => (s ?? 'active') === 'active';
  return {
    isVisible: () => isActive(AppState.currentState as AppStateStatus | null),
    subscribe(listener) {
      const sub = AppState.addEventListener('change', (s) => listener(isActive(s)));
      return () => sub.remove();
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
