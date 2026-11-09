import { useEffect, useMemo, useRef } from 'react';
import { OUAGADOUGOU_CENTER, type OrderDto } from '@yaar/shared';
import { buildDeliveryScene } from '../lib/map/scene';
import { MapFrame, useSceneMap } from './map/SceneMap';

/** Marges du cadrage : bouton « Recentrer » en haut, mention des données (et du fond de secours) en bas. */
const PADDING = { top: 52, right: 40, bottom: 64, left: 40 };

/**
 * Petite carte de la fiche de livraison : retrait (entreprise), destinataire, livreur animé entre deux
 * rafraîchissements et itinéraire de l'étape en cours (vert, rogné à sa position ; pointillés sans itinéraire).
 * Cadrée au premier affichage et à chaque changement d'étape, pas à chaque rafraîchissement.
 */
export function DeliveryMap({ order }: { order: OrderDto }) {
  const scene = useMemo(() => buildDeliveryScene(order), [order]);
  const first = scene.fitPoints[0] ?? OUAGADOUGOU_CENTER;
  const { containerRef, status, fallback, fit } = useSceneMap(scene, { center: first, zoom: 13 });

  const fittedStage = useRef<string | null>(null);
  useEffect(() => {
    if (status !== 'ready' || scene.fitPoints.length === 0 || fittedStage.current === scene.stage) return;
    fit(scene.fitPoints, PADDING, 16, fittedStage.current !== null);
    fittedStage.current = scene.stage;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, scene.stage]);

  return (
    <MapFrame
      containerRef={containerRef}
      status={status}
      fallback={fallback}
      className="delivery-map"
      label={`Carte de la livraison #${order.number}`}
    >
      {status === 'ready' && scene.fitPoints.length > 0 && (
        <button type="button" className="map-recenter" onClick={() => fit(scene.fitPoints, PADDING, 16, true)}>
          Recentrer
        </button>
      )}
    </MapFrame>
  );
}
