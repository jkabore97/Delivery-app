import type { StyleProp, ViewStyle } from 'react-native';
import type { VehicleType } from '@yaar/shared';

export interface MapPoint {
  lat: number;
  lng: number;
}

/** pickup = entreprise / retrait (carré orange) ; dropoff = destinataire (épingle verte) ; driver = livreur. */
export type MarkerKind = 'pickup' | 'dropoff' | 'driver';

/** Apparence du fond de carte : claire (défaut partout) ou sombre (offre de course du livreur). */
export type MapTheme = 'light' | 'dark';

export interface SceneMarker extends MapPoint {
  id: string;
  kind: MarkerKind;
  /** Livreur : cap en degrés (0 = nord) ; absent ou null = calculé depuis le déplacement. */
  heading?: number | null;
  /**
   * Livreur : horodatage (ms) du relevé GPS (`lastLocation.at`). Le glissement vers une nouvelle position dure
   * l'écart réel entre deux relevés (2 à 12 s) ; absent = `animationMs`.
   */
  fixAt?: number | null;
  /** Livreur : pictogramme du véhicule. */
  vehicleType?: VehicleType;
  /** Livreur arrivé chez l'entreprise : décalé de quelques pixels pour ne pas cacher son marqueur. */
  nudge?: boolean;
  /** pickup : radar « recherche d'un livreur » ; dropoff : halo pulsé. */
  pulse?: boolean;
  /**
   * pickup / dropoff : épingle « avatar » (initiales dans un disque posé sur une épingle, couleur du type) à la place
   * du pictogramme habituel ; absent = marqueur habituel (carré de l'entreprise, épingle à maison du destinataire).
   * Une ou deux lettres (voir `avatarInitials`). Ignoré pour le livreur.
   */
  initials?: string | null;
  /** Texte d'accessibilité / info-bulle. */
  title?: string;
}

/**
 * Zone approximative (cercle géographique doux, contour en pointillés) : quartier de livraison d'une offre, que le
 * livreur voit AVANT d'accepter, sans jamais la position exacte du destinataire.
 */
export interface SceneZone extends MapPoint {
  id: string;
  /** pickup = zone de retrait (orange) ; dropoff = zone de livraison (vert). */
  kind: 'pickup' | 'dropoff';
  /** Rayon du cercle, en mètres. */
  radiusM: number;
}

/** Décalage à l'écran (px, x vers la droite, y vers le bas) du livreur arrivé chez l'entreprise. */
export const DRIVER_NUDGE_PX: [number, number] = [20, -20];

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
  /** Zones approximatives (cercles) ; aucune par défaut. */
  zones?: SceneZone[];
  /**
   * Fond de carte clair (défaut) ou sombre. Web : style distant OpenFreeMap « positron » ou « dark » (avec son style
   * de secours embarqué) ; Android : style Google Maps clair ou de nuit ; iOS : Apple Plans clair ou sombre.
   */
  theme?: MapTheme;
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
  /**
   * Hauteur de l'interface posée sur le bas de la carte (feuille) : la mention des données (web), le logo Google
   * et le lien « Mentions légales » d'Apple (natif) restent visibles au-dessus.
   */
  bottomInset?: number;
  /**
   * Durée du glissement d'un livreur vers une position SANS horodatage (`fixAt`), en ms (GPS du téléphone du
   * livreur, événements temps réel) ; avec horodatages, l'écart réel entre deux relevés est utilisé.
   */
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
