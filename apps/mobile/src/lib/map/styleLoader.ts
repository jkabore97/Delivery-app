/**
 * Chargement du style distant des cartes web (OpenFreeMap) sans jamais y renoncer pendant la session : la carte
 * s'affiche tout de suite avec le style de secours embarqué (fond clair, itinéraires et marqueurs), puis le style
 * distant est demandé, et redemandé avec un délai croissant (2 s, 4 s, 8 s… 60 s au plus) tant qu'il n'est pas
 * arrivé, et aussitôt quand le navigateur repasse en ligne. Dès qu'il arrive, la carte l'applique (setStyle) et
 * l'application y rajoute ses calques. Sur une 3G lente, le style arrive donc tard au lieu de ne jamais arriver.
 */

/** Délais entre deux essais (ms) ; le dernier est répété. */
export const STYLE_RETRY_BACKOFF_MS = [2000, 4000, 8000, 16_000, 30_000, 60_000] as const;
/** Temps maximal d'un essai (un style de ~30 ko sur une 3G lente : quelques secondes). */
export const STYLE_ATTEMPT_TIMEOUT_MS = 20_000;

export type StyleJson = { version: number; sources?: Record<string, unknown>; sprite?: unknown; glyphs?: unknown; layers?: unknown[] } & Record<
  string,
  unknown
>;

export interface StyleLoaderEnv {
  fetch: typeof fetch;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  /** Abonnement à l'événement « online » du navigateur ; renvoie le désabonnement. */
  onOnline?: (fn: () => void) => () => void;
}

export function browserStyleLoaderEnv(): StyleLoaderEnv {
  return {
    fetch: (...a) => fetch(...a),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    onOnline:
      typeof window !== 'undefined' && typeof window.addEventListener === 'function'
        ? (fn) => {
            window.addEventListener('online', fn);
            return () => window.removeEventListener('online', fn);
          }
        : undefined,
  };
}

/** Délai avant l'essai suivant après `failures` échecs consécutifs (1 = premier échec). */
export function styleRetryDelayMs(failures: number): number {
  const i = Math.min(Math.max(0, failures - 1), STYLE_RETRY_BACKOFF_MS.length - 1);
  return STYLE_RETRY_BACKOFF_MS[i]!;
}

const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * URL d'une ressource du style (sprite, polices, TileJSON, tuiles) résolue par rapport à l'URL du style. Les
 * gabarits ({z}, {fontstack}…) sont conservés tels quels (pas d'encodage des accolades).
 */
export function resolveStyleUrl(value: string, styleUrl: string): string {
  if (!value || ABSOLUTE.test(value)) return value;
  const m = /^([a-z][a-z0-9+.-]*:\/\/[^/?#]*)([^?#]*)/i.exec(styleUrl);
  if (!m) return value;
  const origin = m[1]!;
  if (value.startsWith('/')) return `${origin}${value}`;
  const dir = (m[2] ?? '/').replace(/[^/]*$/, '') || '/';
  return `${origin}${dir}${value}`;
}

/** Style JSON appliqué avec setStyle(objet) : ses URL relatives sont résolues comme si MapLibre l'avait chargé. */
export function absolutizeStyle(style: StyleJson, styleUrl: string): StyleJson {
  const out: StyleJson = { ...style };
  if (typeof style.sprite === 'string') out.sprite = resolveStyleUrl(style.sprite, styleUrl);
  else if (Array.isArray(style.sprite)) {
    out.sprite = style.sprite.map((s: unknown) =>
      s && typeof s === 'object' && typeof (s as { url?: unknown }).url === 'string'
        ? { ...(s as object), url: resolveStyleUrl((s as { url: string }).url, styleUrl) }
        : s,
    );
  }
  if (typeof style.glyphs === 'string') out.glyphs = resolveStyleUrl(style.glyphs, styleUrl);
  if (style.sources && typeof style.sources === 'object') {
    const sources: Record<string, unknown> = {};
    for (const [id, src] of Object.entries(style.sources)) {
      if (!src || typeof src !== 'object') {
        sources[id] = src;
        continue;
      }
      const s = { ...(src as Record<string, unknown>) };
      if (typeof s.url === 'string') s.url = resolveStyleUrl(s.url, styleUrl);
      if (Array.isArray(s.tiles)) s.tiles = s.tiles.map((t) => (typeof t === 'string' ? resolveStyleUrl(t, styleUrl) : t));
      sources[id] = s;
    }
    out.sources = sources;
  }
  return out;
}

function isStyleJson(v: unknown): v is StyleJson {
  return !!v && typeof v === 'object' && typeof (v as { version?: unknown }).version === 'number' && Array.isArray((v as { layers?: unknown }).layers);
}

/**
 * Demande le style distant jusqu'à l'obtenir (ou `dispose`). `onStyle` est appelé une seule fois, avec le style
 * aux URL résolues.
 */
export class RemoteStyleLoader {
  private timer: unknown = null;
  private failures = 0;
  private inFlight: AbortController | null = null;
  private done = false;
  private disposed = false;
  private offOnline: (() => void) | null = null;
  /** Nombre d'essais lancés (diagnostic, tests). */
  attempts = 0;

  constructor(
    private readonly url: string,
    private readonly onStyle: (style: StyleJson) => void,
    private readonly env: StyleLoaderEnv = browserStyleLoaderEnv(),
    private readonly attemptTimeoutMs = STYLE_ATTEMPT_TIMEOUT_MS,
  ) {}

  start(): void {
    if (this.disposed || this.done) return;
    this.offOnline = this.env.onOnline?.(() => this.retryNow()) ?? null;
    void this.attempt();
  }

  /** Nouvel essai immédiat (retour en ligne), si aucun n'est en cours. */
  retryNow(): void {
    if (this.disposed || this.done || this.inFlight) return;
    if (this.timer !== null) this.env.clearTimeout(this.timer);
    this.timer = null;
    void this.attempt();
  }

  get loaded(): boolean {
    return this.done;
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) this.env.clearTimeout(this.timer);
    this.timer = null;
    this.inFlight?.abort();
    this.inFlight = null;
    this.offOnline?.();
    this.offOnline = null;
  }

  private async attempt(): Promise<void> {
    if (this.disposed || this.done || this.inFlight) return;
    this.attempts++;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    this.inFlight = ctrl ?? ({ abort: () => undefined } as unknown as AbortController);
    const timeout = this.env.setTimeout(() => this.inFlight?.abort(), this.attemptTimeoutMs);
    let style: StyleJson | null = null;
    try {
      const res = await this.env.fetch(this.url, { signal: ctrl?.signal, headers: { Accept: 'application/json' } });
      if (res.ok) {
        const json: unknown = await res.json();
        if (isStyleJson(json)) style = absolutizeStyle(json, this.url);
      }
    } catch {
      style = null; // réseau, délai dépassé, JSON invalide : nouvel essai plus tard
    } finally {
      this.env.clearTimeout(timeout);
      this.inFlight = null;
    }
    if (this.disposed) return;
    if (style) {
      this.done = true;
      this.offOnline?.();
      this.offOnline = null;
      this.onStyle(style);
      return;
    }
    this.failures++;
    this.timer = this.env.setTimeout(() => {
      this.timer = null;
      void this.attempt();
    }, styleRetryDelayMs(this.failures));
  }
}
