import { bearingDeg, distanceM, interpolateBearing, interpolateLatLng, type LatLng } from '@yaar/shared';

/**
 * Déplacement continu d'un livreur entre deux positions GPS (comme Uber / DoorDash) : chaque nouvelle position est
 * atteinte en glissant à vitesse constante pendant l'écart RÉEL entre les deux relevés (`lastLocation.at`), borné
 * à 2–12 s. Le livreur envoie une position toutes les ~8 s : le glissement dure ~8 s et se termine quand la
 * suivante arrive, il roule donc sans à-coups (au lieu de « 4 s en mouvement, 4 s à l'arrêt » quand l'animation
 * suivait l'intervalle de rafraîchissement). Une même position relue (même `at`) ne relance rien.
 *
 * Le pictogramme du véhicule reste droit ; seul un petit chevron indique le cap, masqué quand le cap est inconnu,
 * que le livreur est à l'arrêt (deux relevés à moins de STOPPED_M) ou qu'aucun relevé n'est arrivé depuis STALE_MS.
 * Fonctions pures et horloge injectée : partagées par la carte web (MapLibre) et native (react-native-maps).
 */

/** Durée minimale / maximale d'un glissement calculé à partir des horodatages des relevés. */
export const GLIDE_MIN_MS = 2000;
export const GLIDE_MAX_MS = 12_000;
/** Au-delà, le livreur « saute » sans animation (première position, données anciennes, autre bout de la ville). */
export const JUMP_M = 2500;
/** En dessous, une « nouvelle » position sans horodatage est considérée comme identique (bruit GPS, arrondis). */
export const SAME_POSITION_M = 0.3;
/** Déplacement minimal pour déduire un cap du mouvement quand l'API n'en donne pas. */
export const HEADING_FROM_MOVE_M = 3;
/** Deux relevés successifs plus proches que cela : le livreur est arrêté (feu, embouteillage, retrait). */
export const STOPPED_M = 4;
/** Sans nouveau relevé depuis ce délai, le chevron de cap disparaît (livreur arrêté ou position plus transmise). */
export const STALE_MS = 30_000;
/** Durée de rotation du chevron vers un nouveau cap. */
export const TURN_MS = 700;

/** Horodatage (ms) d'un relevé : ISO de l'API, nombre (GPS du téléphone), sinon null. */
export function fixTime(at: string | number | null | undefined): number | null {
  if (typeof at === 'number') return Number.isFinite(at) ? at : null;
  if (typeof at !== 'string' || !at) return null;
  const t = Date.parse(at);
  return Number.isFinite(t) ? t : null;
}

/**
 * Durée du glissement vers un nouveau relevé : l'écart réel entre les deux horodatages, borné à
 * [GLIDE_MIN_MS, GLIDE_MAX_MS] ; sans horodatages exploitables (ou relevés dans le désordre), `fallbackMs`.
 */
export function glideDurationMs(prevAt: number | null | undefined, nextAt: number | null | undefined, fallbackMs: number): number {
  if (prevAt === null || prevAt === undefined || nextAt === null || nextAt === undefined) return Math.max(0, fallbackMs);
  const gap = nextAt - prevAt;
  if (!Number.isFinite(gap) || gap <= 0) return Math.max(0, fallbackMs);
  return Math.min(GLIDE_MAX_MS, Math.max(GLIDE_MIN_MS, gap));
}

/** Chevron de cap visible : cap connu, livreur en mouvement, relevé récent. */
export function chevronVisible(s: { heading: number | null; moving: boolean; staleSince?: number | null }, now?: number): boolean {
  if (s.heading === null || !Number.isFinite(s.heading) || !s.moving) return false;
  if (now !== undefined && s.staleSince !== null && s.staleSince !== undefined && now - s.staleSince >= STALE_MS) return false;
  return true;
}

export interface MotionFix extends LatLng {
  /** Cap de l'API / du téléphone (0 = nord) ; null ou absent = déduit du déplacement. */
  heading?: number | null;
  /** Horodatage du relevé (ms) ; absent = position locale sans horodatage (durée `fallbackMs`). */
  at?: number | null;
}

export type MotionUpdate = 'none' | 'placed' | 'jump' | 'glide';

export interface MotionSample {
  pos: LatLng;
  /** Cap affiché (interpolé), null = inconnu. */
  heading: number | null;
  /** Glissement ou rotation encore en cours. */
  animating: boolean;
}

/** Piste d'un livreur : position affichée, glissement en cours, cap et état « en mouvement ». */
export class DriverMotion {
  private pos: LatLng | null = null;
  private from: LatLng | null = null;
  private to: LatLng | null = null;
  private start = 0;
  private duration = 0;
  private headingFrom: number | null = null;
  private headingTo: number | null = null;
  private turnStart = 0;
  private lastFixAt: number | null = null;
  /** Heure locale (horloge `now`) du dernier relevé nouveau. */
  private receivedAt: number | null = null;
  private isMoving = false;

  constructor(private readonly opts: { jumpM?: number } = {}) {}

  /** Position cible (dernier relevé), null avant le premier. */
  get target(): LatLng | null {
    return this.to;
  }

  get moving(): boolean {
    return this.isMoving;
  }

  /** Cap visé (dernier connu), null = inconnu. */
  get heading(): number | null {
    return this.headingTo;
  }

  /** Durée du glissement en cours (ms), 0 = immobile. */
  get glideMs(): number {
    return this.duration;
  }

  /**
   * Nouvelle donnée (éventuellement identique à la précédente). `now` : horloge de l'animation ;
   * `fallbackMs` : durée du glissement quand les relevés n'ont pas d'horodatage.
   */
  update(fix: MotionFix, now: number, fallbackMs: number): MotionUpdate {
    const target = { lat: fix.lat, lng: fix.lng };
    const at = fix.at ?? null;
    if (!this.to || !this.pos) {
      this.pos = target;
      this.from = target;
      this.to = target;
      this.start = now;
      this.duration = 0;
      const h = finiteOrNull(fix.heading);
      this.headingFrom = h;
      this.headingTo = h;
      this.turnStart = now;
      this.lastFixAt = at;
      this.receivedAt = now;
      // Cap fourni par le téléphone : il n'est connu qu'en mouvement.
      this.isMoving = h !== null;
      return 'placed';
    }
    // Relevé déjà reçu (le rafraîchissement relit la même position) : rien ne change.
    if (at !== null && this.lastFixAt !== null && at <= this.lastFixAt) return 'none';
    const moved = distanceM(this.to, target);
    const apiHeading = finiteOrNull(fix.heading);
    if (at === null && moved < SAME_POSITION_M && (apiHeading === null || apiHeading === this.headingTo)) return 'none';

    const headingTo = apiHeading ?? (moved > HEADING_FROM_MOVE_M ? bearingDeg(this.to, target) : this.headingTo);
    const current = this.sample(now);
    this.headingFrom = current.heading ?? headingTo;
    this.headingTo = headingTo;
    this.turnStart = now;
    this.isMoving = moved >= STOPPED_M;
    const duration = at !== null ? glideDurationMs(this.lastFixAt, at, fallbackMs) : Math.max(0, fallbackMs);
    this.lastFixAt = at ?? this.lastFixAt;
    this.receivedAt = now;
    if (distanceM(current.pos, target) > (this.opts.jumpM ?? JUMP_M) || duration <= 0) {
      this.pos = target;
      this.from = target;
      this.to = target;
      this.start = now;
      this.duration = 0;
      this.headingFrom = headingTo;
      return 'jump';
    }
    this.from = current.pos;
    this.to = target;
    this.pos = current.pos;
    this.start = now;
    this.duration = duration;
    return 'glide';
  }

  /** Position et cap affichés à l'instant `now` (vitesse constante, cap par le plus court chemin). */
  sample(now: number): MotionSample {
    if (!this.to || !this.from || !this.pos) return { pos: { lat: 0, lng: 0 }, heading: null, animating: false };
    const k = this.duration > 0 ? Math.min(1, Math.max(0, (now - this.start) / this.duration)) : 1;
    this.pos = k >= 1 ? this.to : interpolateLatLng(this.from, this.to, k);
    const turn = Math.min(TURN_MS, this.duration > 0 ? this.duration : TURN_MS);
    const kt = Math.min(1, Math.max(0, (now - this.turnStart) / Math.max(1, turn)));
    const heading =
      this.headingTo === null
        ? null
        : this.headingFrom === null || kt >= 1
          ? this.headingTo
          : interpolateBearing(this.headingFrom, this.headingTo, kt);
    return { pos: this.pos, heading, animating: k < 1 || kt < 1 };
  }

  /** Chevron de cap visible à l'instant `now`. */
  chevronVisible(now: number): boolean {
    return chevronVisible({ heading: this.headingTo, moving: this.isMoving, staleSince: this.receivedAt }, now);
  }
}

function finiteOrNull(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Rotation à l'écran du chevron (degrés) : cap du livreur moins l'orientation de la carte (carte tournée par le
 * livreur), pour qu'il pointe toujours dans le sens de la marche sur la carte.
 */
export function screenHeading(heading: number, mapBearing: number): number {
  const d = (heading - (Number.isFinite(mapBearing) ? mapBearing : 0)) % 360;
  return d < 0 ? d + 360 : d;
}
