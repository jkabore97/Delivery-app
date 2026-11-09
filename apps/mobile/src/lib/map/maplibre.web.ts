import type { GeoJSONSource, Map as MlMap, StyleSpecification } from 'maplibre-gl';
import type { MapTheme } from '../../components/map/types';
import { CHEVRON_IMAGE_ID, CHEVRON_SPACING_PX, chevronImage } from './chevron';
import { MAP_PALETTE, mapThemeConfig, MAX_PIXEL_RATIO, resolveMapStyleUrl } from './style';
import { initialMapStyle, RemoteStyleLoader, sessionStyleCache, type StyleJson } from './styleLoader';

/**
 * MapLibre GL JS pour la version web (react-native-maps n'a pas de rendu web). Le module (~1 Mo) est chargé
 * à la demande, dans un bloc JS séparé, seulement quand un écran affiche une carte ; la page publique de suivi
 * le précharge dès le HTML (scripts/web-postexport.mjs).
 */
export type Maplibre = typeof import('maplibre-gl');

let loading: Promise<Maplibre> | null = null;

export function loadMaplibre(): Promise<Maplibre> {
  if (!loading) {
    loading = import('maplibre-gl').then((mod) => {
      // Paquet UMD : selon l'interopérabilité du bundler, l'API est l'espace de noms ou son `default`.
      const m = mod as unknown as Maplibre & { default?: Maplibre };
      return m.default && typeof m.default.Map === 'function' ? m.default : m;
    });
    loading.catch(() => {
      loading = null; // nouvel essai au prochain écran
    });
  }
  return loading;
}

/** Commence à télécharger MapLibre sans attendre l'écran de la carte (erreurs ignorées : réessayé à l'affichage). */
export function preloadMaplibre(): void {
  loadMaplibre().catch(() => undefined);
}

/** WebGL indisponible (vieux navigateur, accélération désactivée) : la carte ne peut pas s'afficher. */
export function webglSupported(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    // Contexte d'essai libéré aussitôt (les navigateurs limitent le nombre de contextes WebGL ouverts).
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

/**
 * Règles indispensables de maplibre-gl.css (carte, canevas, gestes tactiles, marqueurs), injectées avec la carte :
 * la feuille complète (70 ko, surtout des contrôles inutilisés) bloquait le premier affichage de chaque page.
 */
const MAPLIBRE_CORE_CSS = `
.maplibregl-map{font:12px/20px Helvetica Neue,Arial,Helvetica,sans-serif;overflow:hidden;position:relative;-webkit-tap-highlight-color:rgb(0 0 0/0)}
.maplibregl-canvas{left:0;position:absolute;top:0}
.maplibregl-canvas-container.maplibregl-interactive{cursor:grab;-webkit-user-select:none;-moz-user-select:none;user-select:none}
.maplibregl-canvas-container.maplibregl-interactive.maplibregl-track-pointer{cursor:pointer}
.maplibregl-canvas-container.maplibregl-interactive:active{cursor:grabbing}
.maplibregl-canvas-container.maplibregl-touch-zoom-rotate,.maplibregl-canvas-container.maplibregl-touch-zoom-rotate .maplibregl-canvas{touch-action:pan-x pan-y}
.maplibregl-canvas-container.maplibregl-touch-drag-pan,.maplibregl-canvas-container.maplibregl-touch-drag-pan .maplibregl-canvas{touch-action:pinch-zoom}
.maplibregl-canvas-container.maplibregl-touch-zoom-rotate.maplibregl-touch-drag-pan,.maplibregl-canvas-container.maplibregl-touch-zoom-rotate.maplibregl-touch-drag-pan .maplibregl-canvas{touch-action:none}
.maplibregl-canvas-container.maplibregl-touch-drag-pan.maplibregl-cooperative-gestures,.maplibregl-canvas-container.maplibregl-touch-drag-pan.maplibregl-cooperative-gestures .maplibregl-canvas{touch-action:pan-x pan-y}
.maplibregl-marker{left:0;position:absolute;top:0;transition:opacity .2s;will-change:transform}
.maplibregl-boxzoom{background:#fff;border:2px dotted #202020;height:0;left:0;opacity:.5;position:absolute;top:0;width:0}
.maplibregl-cooperative-gesture-screen{display:none}
`;

let coreCss = false;

export function ensureMaplibreCoreCss(): void {
  if (coreCss || typeof document === 'undefined') return;
  coreCss = true;
  const style = document.createElement('style');
  style.id = 'yaar-maplibre-core-css';
  style.textContent = MAPLIBRE_CORE_CSS;
  document.head.appendChild(style);
}

export interface BaseMapOptions {
  center: { lat: number; lng: number };
  zoom: number;
  /** Rotation / inclinaison (livreur uniquement). */
  allowRotate?: boolean;
  /** Style prêt (secours au premier affichage, puis distant dès qu'il arrive) : (ré)ajouter les couches de l'application. */
  onStyleReady?: (map: MlMap, fallback: boolean) => void;
  /** @deprecated Plus de fond sombre : accepté, ignoré (fond Cobalt). */
  theme?: MapTheme;
  /** Remplace l'URL du style distant (défaut : style Cobalt, MAP_STYLE_URL). */
  styleUrl?: string;
}

export interface BaseMap {
  map: MlMap;
  usingFallback(): boolean;
  /** @deprecated Plus de fond sombre : sans effet (une seule apparence, Cobalt). */
  setTheme(theme: MapTheme): void;
  destroy(): void;
}

/**
 * Crée une carte MapLibre affichée aussitôt avec le style Cobalt déjà reçu pendant la session, sinon avec le style de
 * secours embarqué ; dans ce cas le style Cobalt (`/map/cobalt-style.json`, ou EXPO_PUBLIC_MAP_STYLE_URL) est demandé
 * en parallèle, redemandé tant qu'il n'est pas arrivé, puis appliqué (setStyle) : la carte n'y renonce jamais. Il n'est
 * gardé en cache (et réutilisé par les cartes suivantes) qu'une fois chargé par MapLibre (« style.load ») ; un style
 * que MapLibre refuse (exception, ou erreur de validation à la place de « style.load ») n'est pas gardé : la carte
 * revient au style de secours, et la suivante redemandera le style distant. Densité de pixels plafonnée à 2 ; rotation
 * et inclinaison désactivées sauf pour le livreur ; taille suivie (ResizeObserver).
 */
export function createBaseMap(ml: Maplibre, container: HTMLElement, opts: BaseMapOptions): BaseMap {
  ensureMaplibreCoreCss();
  const allowRotate = opts.allowRotate === true;
  const config = mapThemeConfig();
  const url = opts.styleUrl ? resolveMapStyleUrl(opts.styleUrl) : config.styleUrl;
  const fallbackStyle = config.fallback as unknown as StyleSpecification;
  const first = initialMapStyle(url, config.fallback, sessionStyleCache);
  const map = new ml.Map({
    container,
    style: first.style as unknown as StyleSpecification,
    center: [opts.center.lng, opts.center.lat],
    zoom: opts.zoom,
    pixelRatio: Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1),
    attributionControl: false,
    dragRotate: allowRotate,
    pitchWithRotate: allowRotate,
    touchPitch: allowRotate,
    maxPitch: allowRotate ? 60 : 0,
    renderWorldCopies: false,
    fadeDuration: 150,
  });
  if (!allowRotate) {
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
  }

  let remote = first.remote;
  let destroyed = false;
  let loader: RemoteStyleLoader | null = null;
  /** Style distant appliqué (setStyle) mais pas encore chargé par MapLibre : mis en cache à son « style.load ». */
  let pending: StyleJson | null = null;
  /** Style distant refusé par MapLibre : rien en cache, retour au style de secours. */
  const rejectRemote = () => {
    pending = null;
    remote = false;
    map.setStyle(fallbackStyle, { diff: false });
  };
  /** Idem, appelé pendant l'émission d'une erreur par MapLibre : le style de secours est appliqué juste après. */
  const rejectRemoteLater = () => {
    pending = null;
    remote = false;
    setTimeout(() => {
      if (!destroyed && !pending && !remote) rejectRemote();
    }, 0);
  };
  map.on('style.load', () => {
    if (pending) {
      // Style distant chargé : gardé pour les cartes suivantes, qui l'affichent aussitôt.
      sessionStyleCache.set(url, pending);
      pending = null;
      remote = true;
    }
    opts.onStyleReady?.(map, !remote);
  });
  map.on('error', () => {
    // Style distant invalide : MapLibre émet « error » (validation) au lieu de « style.load ». Les autres erreurs
    // (tuiles ou sprites indisponibles après le chargement du style) sont ignorées : la carte reste utilisable.
    if (pending && !destroyed) rejectRemoteLater();
  });
  if (!first.remote) {
    // Style distant demandé (et redemandé) jusqu'à son arrivée, puis appliqué.
    loader = new RemoteStyleLoader(url, (style) => {
      if (destroyed) return;
      pending = style;
      try {
        map.setStyle(style as unknown as StyleSpecification, { diff: false });
      } catch {
        rejectRemote();
      }
    });
    loader.start();
  }

  let observer: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => map.resize());
    observer.observe(container);
  }

  return {
    map,
    usingFallback: () => !remote,
    setTheme() {
      /* une seule apparence (Cobalt) : rien à changer */
    },
    destroy() {
      destroyed = true;
      loader?.dispose();
      observer?.disconnect();
      map.remove();
    },
  };
}

/* ------------------------------------------------------------------ */
/* Couches des itinéraires et des zones                                */
/* ------------------------------------------------------------------ */

export const LINES_SOURCE = 'yaar-lines';
/** Zones approximatives (cercles doux de l'offre de course). */
export const ZONES_SOURCE = 'yaar-zones';

export type LineFeature = {
  type: 'Feature';
  properties: { kind: 'route' | 'dashed' | 'pending' };
  geometry: { type: 'LineString'; coordinates: Array<[number, number]> };
};

export type ZoneFeature = {
  type: 'Feature';
  properties: { kind: 'pickup' | 'dropoff' };
  geometry: { type: 'Polygon'; coordinates: Array<Array<[number, number]>> };
};

const EMPTY = { type: 'FeatureCollection' as const, features: [] as LineFeature[] };
const EMPTY_ZONES = { type: 'FeatureCollection' as const, features: [] as ZoneFeature[] };

/** Premier calque de texte du fond de carte (noms des quartiers) : les zones passent dessous, les tracés dessus. */
function firstStyleSymbolLayerId(map: MlMap): string | undefined {
  return map.getStyle().layers?.find((l) => l.type === 'symbol' && !l.id.startsWith('yaar-'))?.id;
}

/** Épaisseur selon le zoom : `at14` px au zoom 14 (vue d'un trajet), un peu moins vue de loin, un peu plus de près. */
const width = (at14: number) => ['interpolate', ['linear'], ['zoom'], 10, at14 * 0.7, 14, at14, 17, at14 * 1.25] as const;

/**
 * Calques Cobalt des zones et des tracés (après chaque changement de style), de bas en haut :
 * - zones approximatives (sous les noms des quartiers) : cercle translucide, bord en tirets (cobalt : livraison ;
 *   encre : retrait) ;
 * - étape à venir (`pending`) : encre à 30 % en pointillés ronds ;
 * - lignes droites (`dashed`) : cobalt en tirets de 2,5 px ;
 * - itinéraire (`route`) : ombre douce, liseré blanc de 2 px, ligne cobalt de 6 px, petits chevrons blancs.
 * `theme` est accepté pour compatibilité et ignoré.
 */
export function ensureLineLayers(map: MlMap, _theme?: MapTheme): void {
  const c = MAP_PALETTE;
  if (!map.getSource(ZONES_SOURCE)) map.addSource(ZONES_SOURCE, { type: 'geojson', data: EMPTY_ZONES });
  if (!map.getSource(LINES_SOURCE)) map.addSource(LINES_SOURCE, { type: 'geojson', data: EMPTY });
  if (!map.hasImage(CHEVRON_IMAGE_ID)) map.addImage(CHEVRON_IMAGE_ID, chevronImage(2), { pixelRatio: 2 });
  const belowLabels = firstStyleSymbolLayerId(map);
  const isKind = (k: LineFeature['properties']['kind']) => ['==', ['get', 'kind'], k] as const;
  const byZone = (v: { pickup: string; dropoff: string }) => ['match', ['get', 'kind'], 'pickup', v.pickup, v.dropoff] as const;
  const zones = [
    {
      id: 'yaar-zone-fill',
      type: 'fill' as const,
      source: ZONES_SOURCE,
      paint: { 'fill-color': byZone(c.zoneFill), 'fill-antialias': true },
    },
    {
      id: 'yaar-zone-line',
      type: 'line' as const,
      source: ZONES_SOURCE,
      layout: { 'line-join': 'round' as const },
      paint: { 'line-color': byZone(c.zoneStroke), 'line-width': 1.5, 'line-dasharray': [3, 2.4] },
    },
  ];
  const lines = [
    {
      id: 'yaar-pending',
      type: 'line' as const,
      source: LINES_SOURCE,
      filter: isKind('pending'),
      // Tirets de longueur nulle à extrémités rondes : des points de 2 px tous les 6 px.
      layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
      paint: { 'line-color': c.pending, 'line-width': 2, 'line-dasharray': [0, 3] },
    },
    {
      id: 'yaar-dashed',
      type: 'line' as const,
      source: LINES_SOURCE,
      filter: isKind('dashed'),
      layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
      paint: { 'line-color': c.dashed, 'line-width': 2.5, 'line-dasharray': [2.4, 2.6] },
    },
    {
      id: 'yaar-route-shadow',
      type: 'line' as const,
      source: LINES_SOURCE,
      filter: isKind('route'),
      layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
      paint: { 'line-color': c.shadow, 'line-width': width(10), 'line-blur': 3, 'line-translate': [0, 1.5] },
    },
    {
      id: 'yaar-route-casing',
      type: 'line' as const,
      source: LINES_SOURCE,
      filter: isKind('route'),
      layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
      paint: { 'line-color': c.casing, 'line-width': width(10) },
    },
    {
      id: 'yaar-route',
      type: 'line' as const,
      source: LINES_SOURCE,
      filter: isKind('route'),
      layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
      paint: { 'line-color': c.route, 'line-width': width(6) },
    },
    {
      id: 'yaar-route-chevrons',
      type: 'symbol' as const,
      source: LINES_SOURCE,
      filter: isKind('route'),
      // Vue de loin, l'itinéraire est trop court pour des chevrons lisibles.
      minzoom: 12,
      layout: {
        'symbol-placement': 'line' as const,
        'symbol-spacing': CHEVRON_SPACING_PX,
        'icon-image': CHEVRON_IMAGE_ID,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.8, 14, 1, 17, 1.2],
        'icon-rotation-alignment': 'map' as const,
        'icon-pitch-alignment': 'map' as const,
        'icon-keep-upright': false,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-padding': 0,
      },
    },
  ];
  // Les types de MapLibre n'acceptent pas les tableaux `as const` des expressions : cast local.
  type AnyLayer = Parameters<MlMap['addLayer']>[0];
  for (const layer of zones) if (!map.getLayer(layer.id)) map.addLayer(layer as unknown as AnyLayer, belowLabels);
  for (const layer of lines) if (!map.getLayer(layer.id)) map.addLayer(layer as unknown as AnyLayer);
}

export function setLineFeatures(map: MlMap, features: LineFeature[]): void {
  const source = map.getSource(LINES_SOURCE) as GeoJSONSource | undefined;
  source?.setData({ type: 'FeatureCollection', features } as unknown as Parameters<GeoJSONSource['setData']>[0]);
}

export function setZoneFeatures(map: MlMap, features: ZoneFeature[]): void {
  const source = map.getSource(ZONES_SOURCE) as GeoJSONSource | undefined;
  source?.setData({ type: 'FeatureCollection', features } as unknown as Parameters<GeoJSONSource['setData']>[0]);
}
