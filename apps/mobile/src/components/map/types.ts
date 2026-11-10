import type { Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { VehicleType } from '@yaar/shared';

export interface MapPoint {
  lat: number;
  lng: number;
}

/**
 * pickup = entreprise / retrait (carré encre arrondi : initiales ou boutique) ; dropoff = destinataire (goutte cobalt :
 * initiales ou maison) ; driver = livreur (disque blanc, véhicule cobalt, encoche de cap).
 */
export type MarkerKind = 'pickup' | 'dropoff' | 'driver';

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
  /**
   * Livreur : `sun` = disque Sun (#FFC93C) à pictogramme encre, pour un livreur en route vers l'entreprise vu par
   * l'entreprise ; absent = disque blanc à pictogramme cobalt.
   */
  tone?: 'sun';
  /** Livreur arrivé chez l'entreprise : décalé de quelques pixels pour ne pas cacher son marqueur. */
  nudge?: boolean;
  /** pickup : radar cobalt « recherche d'un livreur » ; dropoff : halo pulsé sous la pointe. */
  pulse?: boolean;
  /**
   * pickup / dropoff : initiales blanches à la place du pictogramme (carré encre de l'entreprise, goutte cobalt du
   * destinataire) ; absent = pictogramme (boutique, maison). Une ou deux lettres (voir `avatarInitials`). Ignoré pour
   * le livreur.
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
  /** pickup = zone de retrait (encre) ; dropoff = zone de livraison (cobalt). */
  kind: 'pickup' | 'dropoff';
  /** Rayon du cercle, en mètres. */
  radiusM: number;
}

/** Décalage à l'écran (px, x vers la droite, y vers le bas) du livreur arrivé chez l'entreprise. */
export const DRIVER_NUDGE_PX: [number, number] = [20, -20];

export interface SceneLine {
  id: string;
  /**
   * route = itinéraire routier devant le livreur (cobalt 6 px, liseré blanc, chevrons blancs sur le web) ;
   * dashed = ligne droite en tirets cobalt (recherche d'un livreur, pas encore d'itinéraire, aperçu d'une offre) ;
   * pending = étape à venir (retrait → destinataire pendant que le livreur va au retrait), encre à 30 % en pointillés.
   */
  kind: 'route' | 'dashed' | 'pending';
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

/** Commandes impératives d'une carte de suivi (`zoomRef` de LiveMap), web et Android / iOS. */
export interface LiveMapHandle {
  /**
   * Zoom de `delta` niveaux (+1 : deux fois plus près ; −1 : deux fois plus loin), en douceur. Compte comme un geste de
   * l'utilisateur : la caméra cesse de suivre (`onUserGesture`), « Recentrer » la remet.
   */
  zoomBy(delta: number): void;
}

export interface LiveMapProps {
  markers: SceneMarker[];
  lines: SceneLine[];
  /** Zones approximatives (cercles) ; aucune par défaut. */
  zones?: SceneZone[];
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
  /** Commandes impératives (boutons « + » / « − » d'une tuile de carte) : `const zoom = useRef<LiveMapHandle>(null)`. */
  zoomRef?: Ref<LiveMapHandle>;
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
