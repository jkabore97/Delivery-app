import { useEffect, useMemo, useRef } from 'react';
import { OUAGADOUGOU_CENTER, type MapDataDto } from '@yaar/shared';
import { buildLiveScene, scenePoints } from '../lib/map/scene';
import type { VehicleFilter } from '../lib/mapState';
import { Icon } from './Icon';
import { MapFrame, useSceneMap } from './map/SceneMap';

export interface LiveMapProps {
  data: MapDataDto;
  filter: VehicleFilter;
  onOrderClick?: (orderId: string) => void;
  onDriverClick?: (driverId: string) => void;
}

/** Marges du cadrage : filtres en haut à gauche, zoom et « Recentrer » à droite, légende en bas à gauche. */
const PADDING = { top: 80, right: 80, bottom: 120, left: 56 };

/**
 * Carte en direct (MapLibre GL, style OpenFreeMap ou fond de secours) : entreprises, destinataires des livraisons
 * en cours, livreurs (libres / en livraison, flèche de cap) qui glissent d'une position à l'autre entre deux
 * rafraîchissements, itinéraire de l'étape en cours, livraisons en attente d'un livreur et SOS pulsés.
 * La carte est créée une fois ; les rafraîchissements ne la recadrent jamais (bouton « Recentrer »).
 */
export function LiveMap({ data, filter, onOrderClick, onDriverClick }: LiveMapProps) {
  const scene = useMemo(() => buildLiveScene(data, filter), [data, filter]);
  const handlers = useRef({ onOrderClick, onDriverClick });
  handlers.current = { onOrderClick, onDriverClick };
  const { containerRef, status, fallback, fit, sceneKey } = useSceneMap(scene, {
    center: data.center ?? OUAGADOUGOU_CENTER,
    zoom: 12.5,
    zoomControl: true,
    onMarkerClick: (m) => {
      if (m.driverId) handlers.current.onDriverClick?.(m.driverId);
      else if (m.orderId) handlers.current.onOrderClick?.(m.orderId);
    },
  });

  // Cadrage initial seulement (premier affichage avec des points), jamais à chaque rafraîchissement.
  const fitted = useRef(false);
  useEffect(() => {
    if (status !== 'ready' || fitted.current) return;
    const points = scenePoints(scene);
    if (points.length === 0) return;
    fit(points, PADDING, 14, false);
    fitted.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, sceneKey]);

  return (
    <MapFrame containerRef={containerRef} status={status} fallback={fallback} className="live-map" label="Carte en direct de Ouagadougou">
      {status === 'ready' && (
        <button
          type="button"
          className="map-recenter"
          aria-label="Recentrer"
          title="Recadrer sur les livreurs, entreprises et livraisons affichés"
          onClick={() => fit(scenePoints(scene), PADDING, 14, true)}
        >
          <Icon name="recenter" size={20} />
        </button>
      )}
    </MapFrame>
  );
}
