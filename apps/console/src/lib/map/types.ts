import type { LatLng, VehicleType } from '@yaar/shared';

/**
 * route = itinéraire routier (cobalt, liseré blanc, chevrons) ; dashed = ligne droite en tirets cobalt (vers la cible
 * sans itinéraire, livraison qui attend un livreur) ; next = trajet retrait → destinataire à venir, encre en pointillés.
 */
export type LineKind = 'route' | 'dashed' | 'next';

/**
 * business = entreprise / point de retrait (carré encre, initiales ou boutique) ; dropoff = destinataire (goutte
 * cobalt) ; driver = livreur (disque blanc, véhicule droit, encoche de cap) ; search = livraison en attente d'un
 * livreur (radar cobalt au retrait) ; sos = alerte SOS (point corail pulsé) ; label = nom de quartier (fond de secours).
 */
export type MarkerKind = 'business' | 'dropoff' | 'driver' | 'search' | 'sos' | 'label';

export interface SceneMarker extends LatLng {
  id: string;
  kind: MarkerKind;
  /** Info-bulle et texte d'accessibilité. */
  title: string;
  /** Livreur : pictogramme du véhicule. */
  vehicleType?: VehicleType;
  /** Livreur : en livraison (véhicule cobalt) ou libre (véhicule encre atténuée, pastille menthe). */
  busy?: boolean;
  /** Livreur : cap en degrés (0 = nord) ; null = inconnu (pas de flèche). */
  heading?: number | null;
  /** Destinataire : halo pulsé (livraison en cours). */
  pulse?: boolean;
  /** Entreprise fermée : marqueur estompé. */
  dimmed?: boolean;
  /** Entreprise : initiales blanches dans le carré (« LV ») ; absent = pictogramme boutique. */
  initials?: string | null;
  /** Texte affiché à côté du marqueur (« #1052 », « SOS · Karim D. », nom de quartier). */
  label?: string;
  /** Clic : fiche de la livraison ou du livreur. */
  orderId?: string;
  driverId?: string;
}

export interface SceneLine {
  id: string;
  kind: LineKind;
  points: LatLng[];
  /**
   * Marqueur livreur qui parcourt la ligne : `route` est rognée au point le plus proche de sa position animée (la
   * partie parcourue disparaît) ; `dashed` part de sa position animée.
   */
  trimToMarkerId?: string;
}

export interface MapScene {
  markers: SceneMarker[];
  lines: SceneLine[];
}
