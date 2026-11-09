/**
 * Calcul d'itinéraire routier (tracé, distance, durée) pour la carte de suivi des courses.
 *
 * - `OsrmRoutingProvider` : service OSRM (par défaut les serveurs publics FOSSGIS
 *   https://routing.openstreetmap.de, hébergés en Allemagne : démonstration / pilote uniquement, cf. docs/API.md
 *   « Itinéraires (carte de suivi) »). Seules les deux coordonnées (départ, arrivée) sont transmises : aucun
 *   identifiant, nom, numéro ou adresse. En cas d'échec (délai dépassé, erreur HTTP, JSON invalide, pas
 *   d'itinéraire), ligne droite de secours (`source: 'straight'`) et avertissement dans les logs : jamais d'erreur.
 *   Courtoisie envers le service public : au plus ROUTING_MAX_RPS appels par seconde et par instance (seau à jetons,
 *   1 par défaut : règle FOSSGIS ; un appel attend son tour au plus 1 s, sinon ligne droite) et un User-Agent qui
 *   identifie l'application avec une URL de contact (PUBLIC_APP_URL).
 * - `StraightRoutingProvider` : ligne droite, sans appel externe (ROUTING_PROVIDER=straight ; tests, smoke test).
 */
import { AVERAGE_SPEED_KMH, ROAD_DISTANCE_FACTOR, haversineKm, type LatLng, type VehicleType } from '@yaar/shared';
import { z } from 'zod';
import { DEFAULT_PUBLIC_APP_URL, type AppConfig } from '../config';
import { decodePolyline, downsamplePolyline, round5, type LatLngTuple } from '../lib/geo';

export type RouteSource = 'osrm' | 'straight';

export interface RouteResult {
  /** Tracé [lat, lng] du départ à l'arrivée (≤ MAX_ROUTE_POINTS points, 5 décimales). */
  points: LatLngTuple[];
  /** Longueur du tracé, en mètres (entier). */
  distanceM: number;
  /** Durée estimée, en secondes (entier), déjà ajustée au type de véhicule. */
  durationS: number;
  source: RouteSource;
}

export interface RoutingProvider {
  readonly name: 'osrm' | 'straight';
  /** Ne lève jamais : en cas d'échec, une ligne droite (`source: 'straight'`). */
  route(from: LatLng, to: LatLng, vehicleType: VehicleType): Promise<RouteResult>;
}

/** Nombre maximal de points d'un tracé renvoyé aux applications (contrat RouteDto). */
export const MAX_ROUTE_POINTS = 300;

/**
 * Identification envoyée au service (règles d'usage FOSSGIS : nom de l'application et moyen de contact) : URL publique
 * de l'application, jamais d'adresse e-mail ni de donnée personnelle.
 */
export function routingUserAgent(contactUrl: string = DEFAULT_PUBLIC_APP_URL): string {
  return `YaarLivraison/0.1 (+${contactUrl})`;
}

/** Temps maximal d'attente d'un jeton (appel retardé pour respecter le débit), au-delà : ligne droite. */
export const ROUTING_MAX_QUEUE_WAIT_MS = 1000;

/**
 * Seau à jetons : `ratePerSecond` jetons par seconde, capacité 1 (jamais de rafale : au plus un appel par intervalle).
 * Un appel réserve le prochain jeton disponible s'il l'obtient en moins de `maxWaitMs` (les réservations s'enchaînent :
 * deux appels simultanés partent à une seconde d'intervalle), sinon il est refusé. Horloge et attente injectables (tests).
 */
export class TokenBucket {
  private tokens = 1;
  private last: number;

  constructor(
    private readonly ratePerSecond: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    this.last = now();
  }

  /** Réserve un jeton : délai (ms) avant de pouvoir l'utiliser, ou null si l'attente dépasserait `maxWaitMs`. */
  reserve(maxWaitMs: number): number | null {
    const t = this.now();
    this.tokens = Math.min(1, this.tokens + ((t - this.last) / 1000) * this.ratePerSecond);
    this.last = t;
    const waitMs = this.tokens >= 1 ? 0 : ((1 - this.tokens) / this.ratePerSecond) * 1000;
    if (waitMs > maxWaitMs) return null;
    this.tokens -= 1;
    return waitMs;
  }

  /** Attend son tour au plus `maxWaitMs` : true si l'appel peut partir, false s'il faut y renoncer. */
  async take(maxWaitMs: number): Promise<boolean> {
    const wait = this.reserve(maxWaitMs);
    if (wait === null) return false;
    if (wait > 0) await this.sleep(Math.ceil(wait));
    return true;
  }
}

/** Profil OSRM des serveurs FOSSGIS par type de véhicule (les motos empruntent le réseau routier « voiture »). */
export const OSRM_PROFILE: Record<VehicleType, string> = {
  BIKE: 'routed-bike',
  MOTO: 'routed-car',
  CAR: 'routed-car',
};

/**
 * Facteurs appliqués aux durées OSRM. OSRM calcule à vitesse « fluide » (limites de vitesse, sans trafic, sans
 * arrêts) : environ 15 km/h pour le profil vélo et 35 à 45 km/h de moyenne pour le profil voiture sur un trajet
 * urbain. Les facteurs ramènent ces durées aux vitesses moyennes retenues pour Ouagadougou (celles du devis,
 * `AVERAGE_SPEED_KMH` : vélo 12, moto 22, voiture 20 km/h) :
 * - BIKE × 1,25 (chaleur, voies en latérite, arrêts) ;
 * - MOTO × 1,6 (profil voiture, mais les motos se faufilent : ≈ 25 km/h) ;
 * - CAR × 1,9 (embouteillages, ronds-points, flux de deux-roues : ≈ 21 km/h).
 * À recalibrer avec les durées réelles des courses du pilote (assignedAt → pickedUpAt → deliveredAt).
 */
export const OSRM_DURATION_FACTOR: Record<VehicleType, number> = {
  BIKE: 1.25,
  MOTO: 1.6,
  CAR: 1.9,
};

/** Ligne droite : distance = vol d'oiseau × 1,3 (facteur routier), durée à la vitesse moyenne du véhicule. */
export function straightRoute(from: LatLng, to: LatLng, vehicleType: VehicleType): RouteResult {
  const distanceM = haversineKm(from, to) * ROAD_DISTANCE_FACTOR * 1000;
  const speedMps = (AVERAGE_SPEED_KMH[vehicleType] * 1000) / 3600;
  return {
    points: [
      [round5(from.lat), round5(from.lng)],
      [round5(to.lat), round5(to.lng)],
    ],
    distanceM: Math.round(distanceM),
    durationS: Math.round(distanceM / speedMps),
    source: 'straight',
  };
}

export class StraightRoutingProvider implements RoutingProvider {
  readonly name = 'straight' as const;
  async route(from: LatLng, to: LatLng, vehicleType: VehicleType): Promise<RouteResult> {
    return straightRoute(from, to, vehicleType);
  }
}

/** Réponse OSRM `route/v1` (champs utilisés seulement). */
const osrmResponseSchema = z.object({
  code: z.string(),
  routes: z
    .array(
      z.object({
        geometry: z.string().min(1),
        distance: z.number().nonnegative(),
        duration: z.number().nonnegative(),
      }),
    )
    .optional(),
});

/** Échec d'un appel OSRM (raison courte, sans coordonnées : journalisée telle quelle). */
export class RoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoutingError';
  }
}

export type FetchLike = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>;

export interface OsrmOptions {
  baseUrl: string;
  timeoutMs: number;
  /** User-Agent (défaut : `routingUserAgent()`, URL de contact de l'application). */
  userAgent?: string;
  /** Débit maximal (seau à jetons, par instance) ; absent = sans limite (tests, OSRM auto-hébergé). */
  rateLimiter?: TokenBucket | null;
  /** Injectable (tests : réponses simulées, aucun accès réseau). */
  fetch?: FetchLike;
  /** Avertissement (repli en ligne droite) ; ne reçoit jamais de coordonnées. */
  onWarn?: (message: string) => void;
}

/** Coordonnée envoyée au service : 5 décimales (≈ 1 m), suffisant pour accrocher le réseau routier. */
const coord = (n: number) => n.toFixed(5);

export class OsrmRoutingProvider implements RoutingProvider {
  readonly name = 'osrm' as const;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly userAgent: string;

  constructor(private readonly opts: OsrmOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = opts.fetch ?? ((url, init) => fetch(url, init));
    this.userAgent = opts.userAgent ?? routingUserAgent();
  }

  /** URL de la requête : `${base}/${profil}/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=polyline`. */
  urlFor(from: LatLng, to: LatLng, vehicleType: VehicleType): string {
    return (
      `${this.baseUrl}/${OSRM_PROFILE[vehicleType]}/route/v1/driving/` +
      `${coord(from.lng)},${coord(from.lat)};${coord(to.lng)},${coord(to.lat)}?overview=full&geometries=polyline`
    );
  }

  async route(from: LatLng, to: LatLng, vehicleType: VehicleType): Promise<RouteResult> {
    // Débit maximal du service (règle FOSSGIS : 1 requête/s) : au-delà d'une seconde d'attente, ligne droite.
    if (this.opts.rateLimiter && !(await this.opts.rateLimiter.take(ROUTING_MAX_QUEUE_WAIT_MS))) {
      this.opts.onWarn?.(
        `Itinéraire OSRM non demandé (${OSRM_PROFILE[vehicleType]} : débit maximal du service atteint) : ligne droite utilisée à la place`,
      );
      return straightRoute(from, to, vehicleType);
    }
    try {
      return await this.fetchRoute(from, to, vehicleType);
    } catch (err) {
      const reason = err instanceof RoutingError ? err.message : err instanceof Error ? err.name : 'erreur inconnue';
      this.opts.onWarn?.(
        `Itinéraire OSRM indisponible (${OSRM_PROFILE[vehicleType]} : ${reason}) : ligne droite utilisée à la place`,
      );
      return straightRoute(from, to, vehicleType);
    }
  }

  private async fetchRoute(from: LatLng, to: LatLng, vehicleType: VehicleType): Promise<RouteResult> {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    // Délai garanti même si l'implémentation de fetch ignore le signal d'annulation.
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new RoutingError(`délai de ${this.opts.timeoutMs} ms dépassé`));
      }, this.opts.timeoutMs);
    });
    try {
      const call = (async () => {
        const res = await this.fetchImpl(this.urlFor(from, to, vehicleType), {
          headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!res.ok) throw new RoutingError(`HTTP ${res.status}`);
        const text = await res.text();
        if (text.length > 5_000_000) throw new RoutingError('réponse trop volumineuse');
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          throw new RoutingError('JSON invalide');
        }
        return json;
      })();
      const json = await Promise.race([call, timeout]);
      const parsed = osrmResponseSchema.safeParse(json);
      if (!parsed.success) throw new RoutingError('réponse inattendue');
      const best = parsed.data.routes?.[0];
      if (parsed.data.code !== 'Ok' || !best) throw new RoutingError(`pas d'itinéraire (${parsed.data.code})`);
      let decoded: LatLngTuple[];
      try {
        decoded = decodePolyline(best.geometry, 5);
      } catch {
        throw new RoutingError('tracé invalide');
      }
      if (decoded.length < 2) throw new RoutingError('tracé vide');
      const points = downsamplePolyline(decoded, MAX_ROUTE_POINTS).map(([la, ln]) => [round5(la), round5(ln)] as LatLngTuple);
      return {
        points,
        distanceM: Math.round(best.distance),
        durationS: Math.round(best.duration * OSRM_DURATION_FACTOR[vehicleType]),
        source: 'osrm',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Fournisseur choisi par ROUTING_PROVIDER (osrm par défaut ; straight = aucun appel externe). Un seau à jetons par
 * fournisseur, donc par instance d'API (ROUTING_MAX_RPS, 0 = sans limite) ; User-Agent avec l'URL de PUBLIC_APP_URL.
 */
export function createRoutingProvider(config: AppConfig, onWarn?: (message: string) => void): RoutingProvider {
  if (config.routingProvider === 'straight') return new StraightRoutingProvider();
  return new OsrmRoutingProvider({
    baseUrl: config.routingOsrmUrl,
    timeoutMs: config.routingTimeoutMs,
    userAgent: routingUserAgent(config.publicAppUrl),
    rateLimiter: config.routingMaxRps > 0 ? new TokenBucket(config.routingMaxRps) : null,
    onWarn,
  });
}
