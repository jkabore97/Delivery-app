import type { GeoJSONSource, Map as MlMap, StyleSpecification } from 'maplibre-gl';
import { FALLBACK_STYLE, MAP_COLORS, MAP_STYLE_URL, MAX_PIXEL_RATIO } from './style';
import { RemoteStyleLoader } from './styleLoader';

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
  styleUrl?: string;
}

export interface BaseMap {
  map: MlMap;
  usingFallback(): boolean;
  destroy(): void;
}

/**
 * Crée une carte MapLibre affichée aussitôt avec le style de secours embarqué ; le style distant (OpenFreeMap
 * « positron » par défaut) est demandé en parallèle, redemandé tant qu'il n'est pas arrivé, puis appliqué
 * (setStyle) : la carte n'y renonce jamais. Densité de pixels plafonnée à 2 ; rotation et inclinaison désactivées
 * sauf pour le livreur ; taille suivie (ResizeObserver).
 */
export function createBaseMap(ml: Maplibre, container: HTMLElement, opts: BaseMapOptions): BaseMap {
  ensureMaplibreCoreCss();
  const allowRotate = opts.allowRotate === true;
  const map = new ml.Map({
    container,
    style: FALLBACK_STYLE as unknown as StyleSpecification,
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

  let remote = false;
  let destroyed = false;
  const loader = new RemoteStyleLoader(opts.styleUrl ?? MAP_STYLE_URL, (style) => {
    if (destroyed) return;
    remote = true;
    try {
      map.setStyle(style as unknown as StyleSpecification, { diff: false });
    } catch {
      remote = false; // style refusé par MapLibre : on garde le secours
    }
  });
  map.on('style.load', () => opts.onStyleReady?.(map, !remote));
  // Tuiles ou sprites indisponibles après le chargement du style : la carte reste utilisable (pas de bruit en console).
  map.on('error', () => undefined);
  loader.start();

  let observer: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => map.resize());
    observer.observe(container);
  }

  return {
    map,
    usingFallback: () => !remote,
    destroy() {
      destroyed = true;
      loader.dispose();
      observer?.disconnect();
      map.remove();
    },
  };
}

/* ------------------------------------------------------------------ */
/* Couches des itinéraires                                             */
/* ------------------------------------------------------------------ */

export const LINES_SOURCE = 'yaar-lines';

export type LineFeature = {
  type: 'Feature';
  properties: { kind: 'route' | 'dashed' };
  geometry: { type: 'LineString'; coordinates: Array<[number, number]> };
};

const EMPTY = { type: 'FeatureCollection' as const, features: [] as LineFeature[] };

/** Premier calque de texte du style : l'itinéraire passe dessous pour garder les noms de rues lisibles. */
function firstSymbolLayerId(map: MlMap): string | undefined {
  return map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
}

/** Ajoute (après chaque changement de style) la source et les calques des itinéraires. */
export function ensureLineLayers(map: MlMap): void {
  if (!map.getSource(LINES_SOURCE)) map.addSource(LINES_SOURCE, { type: 'geojson', data: EMPTY });
  const before = firstSymbolLayerId(map);
  const isRoute = ['==', ['get', 'kind'], 'route'] as const;
  const width = (min: number, max: number) => ['interpolate', ['linear'], ['zoom'], 10, min, 16, max] as const;
  const layers = [
    {
      id: 'yaar-dashed',
      type: 'line' as const,
      source: LINES_SOURCE,
      filter: ['==', ['get', 'kind'], 'dashed'],
      layout: { 'line-cap': 'butt' as const, 'line-join': 'round' as const },
      paint: { 'line-color': MAP_COLORS.dashed, 'line-width': width(2.5, 4), 'line-opacity': 0.8, 'line-dasharray': [2, 1.6] },
    },
    {
      id: 'yaar-route-shadow',
      type: 'line' as const,
      source: LINES_SOURCE,
      filter: isRoute,
      layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
      paint: { 'line-color': MAP_COLORS.shadow, 'line-width': width(9, 15), 'line-blur': 4, 'line-translate': [0, 1.5] },
    },
    {
      id: 'yaar-route-casing',
      type: 'line' as const,
      source: LINES_SOURCE,
      filter: isRoute,
      layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
      paint: { 'line-color': MAP_COLORS.casing, 'line-width': width(7, 12) },
    },
    {
      id: 'yaar-route',
      type: 'line' as const,
      source: LINES_SOURCE,
      filter: isRoute,
      layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
      paint: { 'line-color': MAP_COLORS.route, 'line-width': width(4, 7) },
    },
  ];
  for (const layer of layers) {
    if (!map.getLayer(layer.id)) {
      // Les types de MapLibre n'acceptent pas les tableaux `as const` des expressions : cast local.
      map.addLayer(layer as unknown as Parameters<MlMap['addLayer']>[0], before);
    }
  }
}

export function setLineFeatures(map: MlMap, features: LineFeature[]): void {
  const source = map.getSource(LINES_SOURCE) as GeoJSONSource | undefined;
  source?.setData({ type: 'FeatureCollection', features } as unknown as Parameters<GeoJSONSource['setData']>[0]);
}
