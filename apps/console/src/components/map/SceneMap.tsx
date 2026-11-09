import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { LatLng } from '@yaar/shared';
import { MapSceneController, type MapPadding } from '../../lib/map/controller';
import { createBaseMap, loadMaplibre, webglSupported } from '../../lib/map/engine';
import { sceneKey } from '../../lib/map/scene';
import { DRIVER_ANIMATION_MS, MAP_ATTRIBUTION, MAP_ATTRIBUTION_URL } from '../../lib/map/style';
import type { MapScene, SceneMarker } from '../../lib/map/types';

export type MapStatus = 'loading' | 'ready' | 'unsupported';

export interface SceneMapOptions {
  center: LatLng;
  zoom: number;
  zoomControl?: boolean;
  onMarkerClick?: (m: SceneMarker) => void;
  animationMs?: number;
}

/**
 * Crée la carte MapLibre une seule fois (module chargé à la demande), puis applique chaque nouvelle scène en place,
 * comparée par valeur : un rafraîchissement identique ne touche pas la carte, la caméra ne bouge jamais d'elle-même.
 */
export function useSceneMap(scene: MapScene, opts: SceneMapOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ctrlRef = useRef<MapSceneController | null>(null);
  const [status, setStatus] = useState<MapStatus>('loading');
  const [fallback, setFallback] = useState(false);
  const clickRef = useRef(opts.onMarkerClick);
  clickRef.current = opts.onMarkerClick;
  const initial = useRef(opts);

  useEffect(() => {
    let cancelled = false;
    if (!webglSupported()) {
      setStatus('unsupported');
      return undefined;
    }
    loadMaplibre()
      .then((ml) => {
        const el = containerRef.current;
        if (cancelled || !el) return;
        const o = initial.current;
        let ctrl: MapSceneController | null = null;
        const base = createBaseMap(ml, el, {
          center: o.center,
          zoom: o.zoom,
          zoomControl: o.zoomControl,
          onStyleReady: (_map, fb) => {
            ctrl?.onStyleReady(fb);
            setFallback(fb);
          },
        });
        ctrl = new MapSceneController(ml, base, (m) => clickRef.current?.(m), o.animationMs ?? DRIVER_ANIMATION_MS);
        ctrlRef.current = ctrl;
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('unsupported');
      });
    return () => {
      cancelled = true;
      ctrlRef.current?.destroy();
      ctrlRef.current = null;
    };
  }, []);

  const key = sceneKey(scene);
  useEffect(() => {
    if (status === 'ready') ctrlRef.current?.setScene(scene);
    // La scène est comparée par valeur (key), pas par référence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, key]);

  const fit = (points: LatLng[], padding: MapPadding, maxZoom: number, animate: boolean) =>
    ctrlRef.current?.fit(points, padding, maxZoom, animate);

  return { containerRef, status, fallback, fit, sceneKey: key };
}

/** Cadre de carte : conteneur MapLibre, état de chargement, mention des données (toujours visible). */
export function MapFrame({
  containerRef,
  status,
  fallback,
  className,
  label,
  children,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  status: MapStatus;
  fallback: boolean;
  className: string;
  label: string;
  children?: ReactNode;
}) {
  return (
    <div className={`map-frame ${className}`}>
      {/* Position en style en ligne : `.maplibregl-map { position: relative }` (chargé plus tard) ne doit pas la remplacer. */}
      <div ref={containerRef} className="map-canvas" style={{ position: 'absolute', inset: 0 }} role="region" aria-label={label} />
      {status !== 'ready' && (
        <div className="map-status" aria-live="polite">
          {status === 'loading' ? 'Chargement de la carte…' : 'Carte indisponible sur ce navigateur (WebGL désactivé).'}
        </div>
      )}
      {status === 'ready' && fallback && (
        <div className="map-fallback-note" role="note">
          Fond de carte indisponible : affichage simplifié
        </div>
      )}
      {children}
      <a className="map-attribution" href={MAP_ATTRIBUTION_URL} target="_blank" rel="noopener noreferrer">
        {MAP_ATTRIBUTION}
      </a>
    </div>
  );
}
