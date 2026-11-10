import { useEffect, useMemo, useRef } from 'react';
import { OUAGADOUGOU_CENTER, type MapDataDto } from '@yaar/shared';
import type { MapPadding } from '../lib/map/controller';
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

/** Marges minimales du cadrage : zoom et « Recentrer » à droite, mention des données en bas. */
const MIN_PADDING: MapPadding = { top: 48, right: 76, bottom: 44, left: 32 };

/**
 * Marges du cadrage d'après ce qui est posé sur la carte, mesuré au moment du cadrage : filtres en haut à gauche,
 * légende en bas à gauche (repliée en pastille, ou ouverte) ; aucun point cadré ne se retrouve dessous.
 */
export function overlayPadding(frame: HTMLElement | null): MapPadding {
  const tile = frame?.closest('.map-tile');
  if (!frame || !tile) return MIN_PADDING;
  const box = frame.getBoundingClientRect();
  const filters = tile.querySelector('.map-filters')?.getBoundingClientRect();
  const legend = tile.querySelector('.map-legend')?.getBoundingClientRect();
  const GAP = 20;
  // Les repères sont ancrés par leur pointe : l'épingle et son étiquette (« SOS · Karim D. ») montent d'environ
  // 56 px au-dessus du point. Sous la barre de filtres, il faut donc réserver cette hauteur en plus.
  const MARKER_RISE = 56;
  return {
    ...MIN_PADDING,
    top:
      filters && filters.height > 0
        ? Math.max(MIN_PADDING.top, Math.round(filters.bottom - box.top) + GAP + MARKER_RISE)
        : MIN_PADDING.top,
    bottom: legend && legend.height > 0 ? Math.max(MIN_PADDING.bottom, Math.round(box.bottom - legend.top) + GAP) : MIN_PADDING.bottom,
  };
}

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
    fit(points, overlayPadding(containerRef.current?.parentElement ?? null), 14, false);
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
          onClick={() => fit(scenePoints(scene), overlayPadding(containerRef.current?.parentElement ?? null), 14, true)}
        >
          <Icon name="recenter" size={20} />
        </button>
      )}
    </MapFrame>
  );
}
