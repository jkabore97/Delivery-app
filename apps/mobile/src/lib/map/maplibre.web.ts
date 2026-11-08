import 'maplibre-gl/dist/maplibre-gl.css';
import type { GeoJSONSource, Map as MlMap, StyleSpecification } from 'maplibre-gl';
import { FALLBACK_STYLE, MAP_COLORS, MAP_STYLE_URL, MAX_PIXEL_RATIO, STYLE_TIMEOUT_MS } from './style';

/**
 * MapLibre GL JS pour la version web (react-native-maps n'a pas de rendu web). Le module (~1 Mo) est chargé
 * à la demande, dans un bloc JS séparé, seulement quand un écran affiche une carte.
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

/** WebGL indisponible (vieux navigateur, accélération désactivée) : la carte ne peut pas s'afficher. */
export function webglSupported(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export interface BaseMapOptions {
  center: { lat: number; lng: number };
  zoom: number;
  /** Rotation / inclinaison (livreur uniquement). */
  allowRotate?: boolean;
  /** Style prêt (distant ou de secours) : (ré)ajouter les couches de l'application. */
  onStyleReady?: (map: MlMap, fallback: boolean) => void;
  styleUrl?: string;
  timeoutMs?: number;
}

export interface BaseMap {
  map: MlMap;
  usingFallback(): boolean;
  destroy(): void;
}

/**
 * Crée une carte MapLibre : style distant (OpenFreeMap « positron » par défaut) avec bascule vers le style
 * de secours embarqué s'il échoue ou n'est pas chargé après `timeoutMs` ; densité de pixels plafonnée à 2 ;
 * rotation et inclinaison désactivées sauf pour le livreur ; taille suivie (ResizeObserver).
 */
export function createBaseMap(ml: Maplibre, container: HTMLElement, opts: BaseMapOptions): BaseMap {
  const allowRotate = opts.allowRotate === true;
  const map = new ml.Map({
    container,
    style: opts.styleUrl ?? MAP_STYLE_URL,
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

  let styleLoaded = false;
  let fallback = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const useFallback = () => {
    if (fallback) return;
    fallback = true;
    if (timer) clearTimeout(timer);
    map.setStyle(FALLBACK_STYLE as unknown as StyleSpecification, { diff: false });
  };
  timer = setTimeout(() => {
    if (!styleLoaded) useFallback();
  }, opts.timeoutMs ?? STYLE_TIMEOUT_MS);
  map.on('style.load', () => {
    styleLoaded = true;
    if (timer) clearTimeout(timer);
    opts.onStyleReady?.(map, fallback);
  });
  // Erreur avant le chargement du style (hôte injoignable, JSON invalide) : style de secours. Les erreurs de
  // tuiles après le chargement du style sont ignorées (la carte reste utilisable).
  map.on('error', () => {
    if (!styleLoaded) useFallback();
  });

  let observer: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => map.resize());
    observer.observe(container);
  }

  return {
    map,
    usingFallback: () => fallback,
    destroy() {
      if (timer) clearTimeout(timer);
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
