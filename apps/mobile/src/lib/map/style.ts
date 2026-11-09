/**
 * Apparence des cartes (web MapLibre et natif react-native-maps).
 *
 * Web : style vectoriel gratuit OpenFreeMap « positron » (sans clé), remplaçable par EXPO_PUBLIC_MAP_STYLE_URL.
 * La carte s'affiche d'abord avec le style de secours ci-dessous, embarqué dans l'application (fond clair, sans
 * tuiles, mais marqueurs et itinéraires), puis passe au style distant dès qu'il arrive : il est redemandé avec un
 * délai croissant tant qu'il n'est pas chargé, et aussitôt au retour du réseau (voir styleLoader.ts). Natif :
 * Google Maps (Android) avec un style « argenté » discret, Apple Plans en `mutedStandard` (iOS).
 */
export const DEFAULT_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

/** Remplacé au build par Expo (variables EXPO_PUBLIC_*). */
export const MAP_STYLE_URL: string = process.env.EXPO_PUBLIC_MAP_STYLE_URL || DEFAULT_MAP_STYLE_URL;

export const MAP_ATTRIBUTION = '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors';
export const MAP_ATTRIBUTION_URL = 'https://www.openstreetmap.org/copyright';

/** Densité de pixels plafonnée (écrans 3x : 2x suffit et divise le coût du rendu). */
export const MAX_PIXEL_RATIO = 2;

export const MAP_COLORS = {
  route: '#0B7A4B',
  casing: '#FFFFFF',
  shadow: 'rgba(15, 46, 34, 0.22)',
  dashed: '#0B7A4B',
  /** Fond du style de secours et des cartes en cours de chargement. */
  background: '#EEF1EC',
  pickup: '#F28C1B',
  dropoff: '#0B7A4B',
  /** Livreur : disque vert cerclé de blanc, pictogramme blanc (comme la console). */
  driver: '#0B7A4B',
  driverRing: '#FFFFFF',
  driverInk: '#16202A',
} as const;

/** Style MapLibre minimal embarqué (aucune requête réseau). */
export const FALLBACK_STYLE = {
  version: 8 as const,
  name: 'Yaar (secours)',
  sources: {},
  layers: [{ id: 'background', type: 'background' as const, paint: { 'background-color': MAP_COLORS.background } }],
};

/** Google Maps (Android) : style « argenté » discret, points d'intérêt masqués, routes blanches. */
export const ANDROID_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f2f3f0' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b7682' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#e3eadf' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#7b8691' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e1e3e1' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#a0a8b0' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#cfd8dc' }] },
];
