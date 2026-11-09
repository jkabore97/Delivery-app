import type { GeoJSONSource, Map as MlMap, StyleSpecification } from 'maplibre-gl';
import type { LatLng } from '@yaar/shared';
import { FALLBACK_STYLE, MAP_COLORS, MAP_STYLE_URL, MAX_PIXEL_RATIO, STYLE_TIMEOUT_MS } from './style';

/**
 * Socle MapLibre des cartes de la console (carte en direct, fiche de livraison), repris de l'application mobile
 * (apps/mobile/src/lib/map/maplibre.web.ts) : chargement à la demande, style distant avec bascule vers le style
 * de secours, calques des itinéraires (vert à liseré blanc, pointillés).
 */
export type Maplibre = typeof import('maplibre-gl');

let loading: Promise<Maplibre> | null = null;

/** Charge MapLibre (bloc séparé) une seule fois ; nouvel essai au prochain affichage en cas d'échec. */
export function loadMaplibre(): Promise<Maplibre> {
  if (!loading) {
    loading = import('./maplibreModule').then((m) => m.ml);
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

let webgl: boolean | null = null;

/**
 * WebGL indisponible (vieux navigateur, accélération désactivée, tests jsdom) : pas de carte. Testé une fois ; le
 * contexte d'essai est libéré aussitôt (les navigateurs limitent le nombre de contextes WebGL ouverts).
 */
export function webglSupported(): boolean {
  if (webgl !== null) return webgl;
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  // jsdom n'a pas WebGL : on évite d'appeler getContext (non implémenté, message d'erreur dans la console).
  if (typeof window.WebGLRenderingContext === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    webgl = !!gl;
  } catch {
    webgl = false;
  }
  return webgl;
}

export interface BaseMapOptions {
  center: LatLng;
  zoom: number;
  /** Style prêt (distant ou de secours) : (ré)ajouter les calques de l'application. */
  onStyleReady?: (map: MlMap, fallback: boolean) => void;
  styleUrl?: string;
  timeoutMs?: number;
  /** Boutons de zoom (carte en direct). */
  zoomControl?: boolean;
}

export interface BaseMap {
  map: MlMap;
  usingFallback(): boolean;
  destroy(): void;
}

/**
 * Crée une carte : style distant (OpenFreeMap « positron » par défaut) avec bascule vers le style de secours
 * embarqué s'il échoue ou n'est pas chargé après `timeoutMs` ; pas de rotation ni d'inclinaison ; densité de
 * pixels plafonnée à 2 ; mention des données affichée par la console (attributionControl désactivé) ; taille suivie.
 */
export function createBaseMap(ml: Maplibre, container: HTMLElement, opts: BaseMapOptions): BaseMap {
  const map = new ml.Map({
    container,
    style: opts.styleUrl ?? MAP_STYLE_URL,
    center: [opts.center.lng, opts.center.lat],
    zoom: opts.zoom,
    pixelRatio: Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1),
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    maxPitch: 0,
    renderWorldCopies: false,
    fadeDuration: 150,
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  if (opts.zoomControl) map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');

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
/* Calques des itinéraires                                             */
/* ------------------------------------------------------------------ */

export const LINES_SOURCE = 'yaar-lines';

/** route = itinéraire routier ; dashed = ligne droite vers la cible ; next = étape suivante (retrait → destinataire). */
export type LineKind = 'route' | 'dashed' | 'next';

export type LineFeature = {
  type: 'Feature';
  properties: { kind: LineKind };
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
  const isKind = (k: LineKind) => ['==', ['get', 'kind'], k] as const;
  const width = (min: number, max: number) => ['interpolate', ['linear'], ['zoom'], 10, min, 16, max] as const;
  const layers = [
    {
      id: 'yaar-next',
      type: 'line' as const,
      source: LINES_SOURCE,
      filter: isKind('next'),
      layout: { 'line-cap': 'butt' as const, 'line-join': 'round' as const },
      paint: { 'line-color': MAP_COLORS.next, 'line-width': width(1.5, 2.5), 'line-opacity': 0.55, 'line-dasharray': [1.5, 2] },
    },
    {
      id: 'yaar-dashed',
      type: 'line' as const,
      source: LINES_SOURCE,
      filter: isKind('dashed'),
      layout: { 'line-cap': 'butt' as const, 'line-join': 'round' as const },
      paint: { 'line-color': MAP_COLORS.dashed, 'line-width': width(2.5, 4), 'line-opacity': 0.85, 'line-dasharray': [2, 1.6] },
    },
    {
      id: 'yaar-route-shadow',
      type: 'line' as const,
      source: LINES_SOURCE,
      filter: isKind('route'),
      layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
      paint: { 'line-color': MAP_COLORS.shadow, 'line-width': width(9, 15), 'line-blur': 4, 'line-translate': [0, 1.5] },
    },
    {
      id: 'yaar-route-casing',
      type: 'line' as const,
      source: LINES_SOURCE,
      filter: isKind('route'),
      layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
      paint: { 'line-color': MAP_COLORS.casing, 'line-width': width(7, 12) },
    },
    {
      id: 'yaar-route',
      type: 'line' as const,
      source: LINES_SOURCE,
      filter: isKind('route'),
      layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
      paint: { 'line-color': MAP_COLORS.route, 'line-width': width(4, 7) },
    },
  ];
  for (const layer of layers) {
    if (!map.getLayer(layer.id)) {
      // Les types de MapLibre n'acceptent pas les tableaux `as const` des expressions : conversion locale.
      map.addLayer(layer as unknown as Parameters<MlMap['addLayer']>[0], before);
    }
  }
}

export function setLineFeatures(map: MlMap, features: LineFeature[]): void {
  const source = map.getSource(LINES_SOURCE) as GeoJSONSource | undefined;
  source?.setData({ type: 'FeatureCollection', features } as unknown as Parameters<GeoJSONSource['setData']>[0]);
}
