/**
 * Apparence des cartes (web MapLibre et natif react-native-maps) : le fond « Cobalt » partout.
 *
 * Web : style vectoriel « Cobalt » (OpenFreeMap « positron » recoloré : terre #F3F5F8, eau #A9C9FF, parcs #D6EEDC,
 * rues blanches, grands axes jaunes, noms des quartiers seulement), fichier statique servi par l'application
 * elle-même (`public/map/cobalt-style.json` → `/map/cobalt-style.json`), remplaçable par EXPO_PUBLIC_MAP_STYLE_URL.
 * Ses tuiles, polices et sprites viennent de tiles.openfreemap.org (gratuit, sans clé). La carte s'affiche d'abord
 * avec le style de secours embarqué ci-dessous (fond Cobalt uni, sans tuiles, mais marqueurs et itinéraires), puis
 * passe au style Cobalt dès qu'il arrive : il est redemandé avec un délai croissant tant qu'il n'est pas chargé, et
 * aussitôt au retour du réseau (voir styleLoader.ts). Natif : Google Maps (Android) avec un style Cobalt
 * (`ANDROID_MAP_STYLE`), Apple Plans clair (iOS).
 *
 * Pas de fond sombre : l'offre de course du livreur a aussi le fond Cobalt.
 */
import { COBALT_MAP, rgba } from './palette';

/** Style Cobalt servi par la version web elle-même (copie de public/map/cobalt-style.json). */
export const DEFAULT_MAP_STYLE_URL = '/map/cobalt-style.json';

/** Remplacé au build par Expo (variables EXPO_PUBLIC_*). */
export const MAP_STYLE_URL: string = process.env.EXPO_PUBLIC_MAP_STYLE_URL || DEFAULT_MAP_STYLE_URL;

export const MAP_ATTRIBUTION = '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors';
export const MAP_ATTRIBUTION_URL = 'https://www.openstreetmap.org/copyright';

/** Densité de pixels plafonnée (écrans 3x : 2x suffit et divise le coût du rendu). */
export const MAX_PIXEL_RATIO = 2;

const ABSOLUTE_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * URL absolue d'un style : une URL relative (le style Cobalt par défaut, `/map/cobalt-style.json`) est résolue par
 * rapport à la page, pour que les ressources relatives du style soient résolues à leur tour (styleLoader.ts) et que
 * le cache des styles ait une seule clé par style. Sans page (tests, natif) : inchangée.
 */
export function resolveMapStyleUrl(url: string, base?: string): string {
  if (!url || ABSOLUTE_URL.test(url)) return url;
  const page = base ?? (typeof location !== 'undefined' && typeof location.href === 'string' ? location.href : undefined);
  if (!page) return url;
  try {
    return new URL(url, page).href;
  } catch {
    return url;
  }
}

/**
 * Couleurs des cartes. Les clés historiques sont gardées (des écrans les importent) avec des valeurs Cobalt :
 * `driver` reste un fond plein (pastilles du livreur avec un pictogramme blanc), `pickup` est l'encre de l'entreprise,
 * `dropoff` le cobalt du destinataire.
 */
export const MAP_COLORS = {
  /** Itinéraire devant le livreur : cobalt 6 px… */
  route: COBALT_MAP.cobalt,
  /** …sur un liseré blanc de 2 px… */
  casing: COBALT_MAP.white,
  /** …avec une ombre douce dessous. */
  shadow: rgba(COBALT_MAP.ink, 0.22),
  /** Petits chevrons blancs le long de l'itinéraire (web). */
  chevron: COBALT_MAP.white,
  /** Lignes droites (recherche d'un livreur, pas encore d'itinéraire) : cobalt en tirets. */
  dashed: COBALT_MAP.cobalt,
  /** Étape à venir (retrait → destinataire pendant le retrait) : encre à 30 % en pointillés. */
  pending: rgba(COBALT_MAP.ink, 0.32),
  /** Fond du style de secours et des cartes en cours de chargement (terre du fond Cobalt). */
  background: COBALT_MAP.land,
  /** Entreprise / retrait : carré encre arrondi. */
  pickup: COBALT_MAP.ink,
  /** Destinataire : goutte cobalt. */
  dropoff: COBALT_MAP.cobalt,
  /** Fond plein des pastilles « livreur » hors carte (pictogramme blanc dessus) et pictogramme du marqueur. */
  driver: COBALT_MAP.cobalt,
  /** Marqueur du livreur sur la carte : disque blanc… */
  driverDisc: COBALT_MAP.white,
  /** …pictogramme cobalt… */
  driverGlyph: COBALT_MAP.cobalt,
  /** …contour blanc des formes posées sur la carte (épingles, carré, encoche de cap). */
  driverRing: COBALT_MAP.white,
  driverInk: COBALT_MAP.ink,
  /** Variante Sun (livreur en route vers l'entreprise, vue de l'entreprise) : disque, pictogramme, encoche. */
  driverSun: COBALT_MAP.sun,
  driverSunInk: COBALT_MAP.ink,
  driverSunNotch: COBALT_MAP.sunDeep,
} as const;

/** Couleurs des tracés et des zones d'une carte. */
export interface MapPalette {
  route: string;
  casing: string;
  shadow: string;
  /** Chevrons de direction posés sur l'itinéraire (web). */
  chevron: string;
  dashed: string;
  /** Étape à venir en pointillés discrets (`SceneLine.kind = 'pending'`). */
  pending: string;
  /** Fond du style de secours et de la carte en cours de chargement. */
  background: string;
  /** Texte « Chargement de la carte… » (encre atténuée : 5,5:1 sur le fond). */
  overlayText: string;
  /** Zones approximatives : retrait (encre) et livraison (cobalt), cercle translucide à bord en tirets. */
  zoneFill: { pickup: string; dropoff: string };
  zoneStroke: { pickup: string; dropoff: string };
}

/** Palette Cobalt des cartes (la seule). */
export const MAP_PALETTE: MapPalette = {
  route: MAP_COLORS.route,
  casing: MAP_COLORS.casing,
  shadow: MAP_COLORS.shadow,
  chevron: MAP_COLORS.chevron,
  dashed: MAP_COLORS.dashed,
  pending: MAP_COLORS.pending,
  background: MAP_COLORS.background,
  overlayText: COBALT_MAP.inkMuted,
  zoneFill: { pickup: rgba(COBALT_MAP.ink, 0.06), dropoff: rgba(COBALT_MAP.cobalt, 0.1) },
  zoneStroke: { pickup: rgba(COBALT_MAP.ink, 0.42), dropoff: rgba(COBALT_MAP.cobalt, 0.62) },
};

/** Style MapLibre minimal embarqué (aucune requête réseau) : la terre du fond Cobalt. */
export const FALLBACK_STYLE = {
  version: 8 as const,
  name: 'Yaar Cobalt (secours)',
  sources: {},
  layers: [{ id: 'background', type: 'background' as const, paint: { 'background-color': COBALT_MAP.land } }],
};

/** Style distant, style de secours et couleurs d'une carte web (fond Cobalt partout : une entrée dans le cache des styles). */
export function mapThemeConfig(): {
  styleUrl: string;
  fallback: typeof FALLBACK_STYLE;
  palette: MapPalette;
} {
  return { styleUrl: resolveMapStyleUrl(MAP_STYLE_URL), fallback: FALLBACK_STYLE, palette: MAP_PALETTE };
}

/**
 * Google Maps (Android), fond Cobalt : terre #F3F5F8, eau #A9C9FF, parcs #D6EEDC, rues blanches, grands axes jaunes
 * (#FFE38A, bord #F0C85A), aucun point d'intérêt ni transport en commun, noms des quartiers seulement.
 */
export const ANDROID_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: COBALT_MAP.land }] },
  { elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text', stylers: [{ visibility: 'on' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: COBALT_MAP.label }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.stroke', stylers: [{ color: COBALT_MAP.land }, { weight: 3 }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: COBALT_MAP.landuse }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: COBALT_MAP.park }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: COBALT_MAP.road }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: COBALT_MAP.roadCasing }] },
  { featureType: 'road.arterial', elementType: 'geometry.stroke', stylers: [{ color: COBALT_MAP.arterialCasing }] },
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: COBALT_MAP.trunk }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: COBALT_MAP.trunkCasing }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: COBALT_MAP.water }] },
];
