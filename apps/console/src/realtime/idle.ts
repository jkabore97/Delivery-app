/**
 * Détection d'inactivité de la console (mode poll) : sans interaction pendant `idleMs`, `onIdleChange(true)` ;
 * à la première interaction suivante, `onIdleChange(false)`. Une console oubliée sur un écran ne consomme
 * ainsi plus le quota d'appels de fonction Vercel.
 * Interactions : pointeur (clic, déplacement réel), clavier, toucher, molette, changement de visibilité de l'onglet.
 */

export const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;

export class IdleMonitor {
  private lastActivity: number;
  private idle = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly onActivity = () => this.activity();
  private lastPointer: { x: number; y: number } | null = null;
  /**
   * Déplacement du pointeur : seulement s'il a vraiment bougé. Le navigateur peut émettre des mouvements
   * « simulés » sans déplacement (mise à jour du survol quand la page change sous une souris immobile) :
   * ils ne doivent pas empêcher la pause.
   */
  private readonly onPointerMove = (ev: Event) => {
    const { clientX, clientY } = ev as MouseEvent;
    if (typeof clientX === 'number' && typeof clientY === 'number') {
      if (this.lastPointer && this.lastPointer.x === clientX && this.lastPointer.y === clientY) return;
      this.lastPointer = { x: clientX, y: clientY };
    }
    this.activity();
  };
  private disposed = false;

  constructor(
    private readonly idleMs: number,
    private readonly onIdleChange: (idle: boolean) => void,
    private readonly target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
    private readonly doc: Pick<Document, 'addEventListener' | 'removeEventListener'> = document,
  ) {
    this.lastActivity = Date.now();
    for (const e of ACTIVITY_EVENTS) this.target.addEventListener(e, this.onActivity, { passive: true });
    this.target.addEventListener('pointermove', this.onPointerMove, { passive: true });
    this.doc.addEventListener('visibilitychange', this.onActivity);
    this.arm(idleMs);
  }

  get isIdle(): boolean {
    return this.idle;
  }

  /** Interaction de l'utilisateur (ou reprise explicite) : sortie de l'état inactif, minuterie relancée. */
  activity(): void {
    if (this.disposed) return;
    this.lastActivity = Date.now();
    if (this.idle) {
      this.idle = false;
      this.arm(this.idleMs);
      this.onIdleChange(false);
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const e of ACTIVITY_EVENTS) this.target.removeEventListener(e, this.onActivity);
    this.target.removeEventListener('pointermove', this.onPointerMove);
    this.doc.removeEventListener('visibilitychange', this.onActivity);
  }

  /** Une seule minuterie : à l'échéance, on vérifie la dernière activité (pas de relance à chaque mouvement). */
  private arm(delayMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.disposed || this.idle) return;
      const remaining = this.lastActivity + this.idleMs - Date.now();
      if (remaining > 0) {
        this.arm(remaining);
        return;
      }
      this.idle = true;
      this.onIdleChange(true);
    }, delayMs);
  }
}
