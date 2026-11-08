import type { StyleProp, ViewStyle } from 'react-native';
import type { VehicleType } from '@yaar/shared';

export interface MapPoint {
  lat: number;
  lng: number;
}

/** pickup = entreprise / retrait (carré orange) ; dropoff = destinataire (épingle verte) ; driver = livreur. */
export type MarkerKind = 'pickup' | 'dropoff' | 'driver';

export interface SceneMarker extends MapPoint {
  id: string;
  kind: MarkerKind;
  /** Livreur : cap en degrés (0 = nord) ; absent ou null = calculé depuis le déplacement. */
  heading?: number | null;
  /** Livreur : pictogramme du véhicule. */
  vehicleType?: VehicleType;
  /** pickup : radar « recherche d'un livreur » ; dropoff : halo pulsé. */
  pulse?: boolean;
  /** Texte d'accessibilité / info-bulle. */
  title?: string;
}

export interface SceneLine {
  id: string;
  /** route = itinéraire routier (vert, liseré blanc) ; dashed = ligne droite en pointillés (pas encore d'itinéraire). */
  kind: 'route' | 'dashed';
  points: MapPoint[];
  /**
   * Identifiant du marqueur livreur qui parcourt cette ligne : `route` est rognée au point le plus proche de sa
   * position animée (la partie parcourue disparaît) ; `dashed` part de sa position animée.
   */
  trimToMarkerId?: string;
}

export interface MapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LiveMapProps {
  markers: SceneMarker[];
  lines: SceneLine[];
  /** Points à garder visibles (livreur + cible en cours, ou retrait + livraison). */
  fitPoints: MapPoint[];
  /** La caméra suit (recadre à chaque nouvelle position) ; false après un geste de l'utilisateur. */
  follow: boolean;
  /** Incrémenté pour forcer un recadrage (bouton « Recentrer », changement d'étape). */
  recenterKey?: number;
  /** Déplacement ou zoom fait par l'utilisateur (la caméra arrête de suivre). */
  onUserGesture?: () => void;
  /** Marges de cadrage (ex. hauteur de la feuille du bas). */
  padding?: Partial<MapPadding>;
  /** Hauteur de l'interface posée sur le bas de la carte (feuille) : la mention des données reste visible au-dessus. */
  bottomInset?: number;
  /** Durée de l'animation d'un livreur entre deux positions (≈ intervalle de rafraîchissement), en ms. */
  animationMs?: number;
  /** Rotation et inclinaison de la carte (livreur uniquement). */
  allowRotate?: boolean;
  maxZoom?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export interface PickerMapHandle {
  /** Recentre la carte (zoom MapLibre : 15 ≈ un quartier). */
  centerOn(lat: number, lng: number, zoom?: number): void;
}

export interface PickerMapProps {
  initial: MapPoint;
  initialZoom?: number;
  /** Centre de la carte une fois le déplacement terminé. */
  onCenterChange: (lat: number, lng: number) => void;
  /** Début d'un déplacement (l'épingle se soulève). */
  onMoveStart?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Zoom MapLibre ↔ étendue react-native-maps (degrés). */
export function deltaForZoom(zoom: number): number {
  return 360 / 2 ** Math.max(1, Math.min(20, zoom));
}
