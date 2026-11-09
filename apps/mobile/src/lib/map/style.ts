/**
 * Apparence des cartes (web MapLibre et natif react-native-maps).
 *
 * Web : style vectoriel gratuit OpenFreeMap « positron » (sans clé), remplaçable par EXPO_PUBLIC_MAP_STYLE_URL.
 * La carte s'affiche d'abord avec le style de secours ci-dessous, embarqué dans l'application (fond clair, sans
 * tuiles, mais marqueurs et itinéraires), puis passe au style distant dès qu'il arrive : il est redemandé avec un
 * délai croissant tant qu'il n'est pas chargé, et aussitôt au retour du réseau (voir styleLoader.ts). Natif :
 * Google Maps (Android) avec un style « argenté » discret, Apple Plans en `mutedStandard` (iOS).
 *
 * Fond sombre (`theme="dark"`, offre de course du livreur) : OpenFreeMap « dark » (EXPO_PUBLIC_MAP_STYLE_DARK_URL),
 * même chargement, style de secours sombre, cache distinct ; Google Maps de nuit (Android), Apple Plans sombre (iOS).
 * Les cartes claires restent la valeur par défaut partout.
 */
import type { MapTheme } from '../../components/map/types';

export const DEFAULT_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
/** Style sombre (offre de course du livreur) : OpenFreeMap « dark », même hôte, mêmes sources que « positron ». */
export const DEFAULT_MAP_STYLE_DARK_URL = 'https://tiles.openfreemap.org/styles/dark';

/** Remplacé au build par Expo (variables EXPO_PUBLIC_*). */
export const MAP_STYLE_URL: string = process.env.EXPO_PUBLIC_MAP_STYLE_URL || DEFAULT_MAP_STYLE_URL;
/** Remplacé au build par Expo (variables EXPO_PUBLIC_*). */
export const MAP_STYLE_DARK_URL: string = process.env.EXPO_PUBLIC_MAP_STYLE_DARK_URL || DEFAULT_MAP_STYLE_DARK_URL;

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

/**
 * Couleurs des tracés et des zones selon le fond de carte. Clair : celles de MAP_COLORS (inchangées). Sombre : vert
 * vif (le vert de marque disparaît sur un fond sombre) et liseré sombre au lieu du blanc.
 */
export interface MapPalette {
  route: string;
  casing: string;
  shadow: string;
  dashed: string;
  /** Fond du style de secours et de la carte en cours de chargement. */
  background: string;
  /** Texte « Chargement de la carte… ». */
  overlayText: string;
  zoneFill: { pickup: string; dropoff: string };
  zoneStroke: { pickup: string; dropoff: string };
}

export const MAP_PALETTES: Record<MapTheme, MapPalette> = {
  light: {
    route: MAP_COLORS.route,
    casing: MAP_COLORS.casing,
    shadow: MAP_COLORS.shadow,
    dashed: MAP_COLORS.dashed,
    background: MAP_COLORS.background,
    overlayText: '#7A8691',
    zoneFill: { pickup: 'rgba(242, 140, 27, 0.14)', dropoff: 'rgba(11, 122, 75, 0.13)' },
    zoneStroke: { pickup: 'rgba(242, 140, 27, 0.75)', dropoff: 'rgba(11, 122, 75, 0.7)' },
  },
  dark: {
    route: '#2FD38A',
    casing: '#08110D',
    shadow: 'rgba(0, 0, 0, 0.45)',
    dashed: '#2FD38A',
    background: '#141A18',
    overlayText: '#8D9A93',
    zoneFill: { pickup: 'rgba(242, 140, 27, 0.18)', dropoff: 'rgba(47, 211, 138, 0.16)' },
    zoneStroke: { pickup: 'rgba(255, 170, 72, 0.85)', dropoff: 'rgba(47, 211, 138, 0.8)' },
  },
};

/** Style MapLibre minimal embarqué (aucune requête réseau). */
export const FALLBACK_STYLE = {
  version: 8 as const,
  name: 'Yaar (secours)',
  sources: {},
  layers: [{ id: 'background', type: 'background' as const, paint: { 'background-color': MAP_COLORS.background } }],
};

/** Style de secours sombre (même principe : fond uni, marqueurs et tracés de l'application par-dessus). */
export const FALLBACK_STYLE_DARK = {
  version: 8 as const,
  name: 'Yaar (secours, sombre)',
  sources: {},
  layers: [{ id: 'background', type: 'background' as const, paint: { 'background-color': MAP_PALETTES.dark.background } }],
};

/**
 * Style distant, style de secours et couleurs d'une carte web selon son fond. Chaque fond a son URL, donc son
 * propre chargement et sa propre entrée dans le cache des styles (styleLoader.ts) : une carte sombre ne change
 * rien aux cartes claires des autres écrans.
 */
export function mapThemeConfig(theme: MapTheme = 'light'): {
  styleUrl: string;
  fallback: typeof FALLBACK_STYLE | typeof FALLBACK_STYLE_DARK;
  palette: MapPalette;
} {
  return theme === 'dark'
    ? { styleUrl: MAP_STYLE_DARK_URL, fallback: FALLBACK_STYLE_DARK, palette: MAP_PALETTES.dark }
    : { styleUrl: MAP_STYLE_URL, fallback: FALLBACK_STYLE, palette: MAP_PALETTES.light };
}

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
