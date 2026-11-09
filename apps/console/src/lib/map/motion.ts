import { bearingDeg, distanceM, easeInOutCubic, interpolateBearing, interpolateLatLng, type LatLng } from '@yaar/shared';

/**
 * Déplacement fluide des livreurs entre deux rafraîchissements de la carte (toutes les 10 s en mode poll) : chaque
 * nouvelle position est atteinte en `durationMs` (≈ 1,5 s, courbe douce) à partir de la position affichée, image par
 * image (requestAnimationFrame) ; le cap suit le plus court chemin (350° → 10° passe par 0°). Première position, ou
 * saut de plus de `jumpM` (données anciennes, autre bout de la ville) : placement immédiat, sans glissement.
 * Aucune image n'est demandée quand rien ne bouge.
 */
export const JUMP_M = 2500;
/** En dessous, une « nouvelle » position est considérée comme identique (bruit GPS, arrondis). */
const SAME_POSITION_M = 0.3;
/** Déplacement minimal pour déduire un cap du mouvement quand l'API n'en donne pas. */
const HEADING_FROM_MOVE_M = 3;

interface Track {
  /** Position affichée. */
  pos: LatLng;
  from: LatLng;
  to: LatLng;
  start: number;
  /** 0 = immobile. */
  duration: number;
  heading: number | null;
  headingFrom: number | null;
  headingTo: number | null;
}

export interface SmoothMoverOptions {
  durationMs: number;
  /** Position (et cap) à afficher pour une piste : appelé à chaque image et à chaque placement immédiat. */
  onMove: (id: string, pos: LatLng, heading: number | null) => void;
  /** Après les déplacements de chaque image ; `animating` = false à la dernière image d'une animation. */
  onFrame?: (animating: boolean) => void;
  jumpM?: number;
  now?: () => number;
  requestFrame?: (cb: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
}

export class SmoothMover {
  private readonly tracks = new Map<string, Track>();
  private frame: number | null = null;
  private readonly now: () => number;
  private readonly requestFrame: (cb: FrameRequestCallback) => number;
  private readonly cancelFrame: (handle: number) => void;

  constructor(private readonly opts: SmoothMoverOptions) {
    this.now = opts.now ?? (() => performance.now());
    this.requestFrame = opts.requestFrame ?? ((cb) => requestAnimationFrame(cb));
    this.cancelFrame = opts.cancelFrame ?? ((h) => cancelAnimationFrame(h));
  }

  /** Position affichée (animée) d'une piste. */
  position(id: string): LatLng | undefined {
    return this.tracks.get(id)?.pos;
  }

  heading(id: string): number | null | undefined {
    return this.tracks.get(id)?.heading;
  }

  has(id: string): boolean {
    return this.tracks.has(id);
  }

  /** Une animation est en cours (une image est demandée). */
  get animating(): boolean {
    return this.frame !== null;
  }

  /**
   * Nouvelle position reçue. `heading` : cap de l'API ; null / absent = déduit du déplacement (sinon le cap
   * précédent est gardé).
   */
  moveTo(id: string, target: LatLng, heading?: number | null): void {
    const to = { lat: target.lat, lng: target.lng };
    const t = this.tracks.get(id);
    if (!t) {
      const h = heading ?? null;
      this.tracks.set(id, { pos: to, from: to, to, start: this.now(), duration: 0, heading: h, headingFrom: h, headingTo: h });
      this.opts.onMove(id, to, h);
      return;
    }
    const moved = distanceM(t.to, to);
    const headingTo = heading ?? (moved > HEADING_FROM_MOVE_M ? bearingDeg(t.to, to) : t.headingTo);
    if (moved < SAME_POSITION_M && headingTo === t.headingTo) return;
    if (distanceM(t.pos, to) > (this.opts.jumpM ?? JUMP_M) || this.opts.durationMs <= 0) {
      Object.assign(t, { pos: to, from: to, to, duration: 0, heading: headingTo, headingFrom: headingTo, headingTo });
      this.opts.onMove(id, to, headingTo);
      return;
    }
    t.from = t.pos;
    t.to = to;
    t.start = this.now();
    t.duration = this.opts.durationMs;
    t.headingFrom = t.heading ?? headingTo;
    t.headingTo = headingTo;
    this.schedule();
  }

  remove(id: string): void {
    this.tracks.delete(id);
  }

  dispose(): void {
    if (this.frame !== null) this.cancelFrame(this.frame);
    this.frame = null;
    this.tracks.clear();
  }

  private schedule(): void {
    if (this.frame === null) this.frame = this.requestFrame(this.tick);
  }

  private readonly tick = (): void => {
    this.frame = null;
    const now = this.now();
    let animating = false;
    for (const [id, t] of this.tracks) {
      if (t.duration <= 0) continue;
      const k = Math.min(1, Math.max(0, (now - t.start) / t.duration));
      const e = easeInOutCubic(k);
      t.pos = k >= 1 ? t.to : interpolateLatLng(t.from, t.to, e);
      t.heading =
        t.headingTo === null ? null : t.headingFrom === null || k >= 1 ? t.headingTo : interpolateBearing(t.headingFrom, t.headingTo, e);
      if (k >= 1) t.duration = 0;
      else animating = true;
      this.opts.onMove(id, t.pos, t.heading);
    }
    this.opts.onFrame?.(animating);
    if (animating) this.schedule();
  };
}
