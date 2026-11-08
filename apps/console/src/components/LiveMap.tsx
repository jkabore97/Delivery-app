import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { LABELS, OUAGADOUGOU_CENTER, type MapDataDto } from '@yaar/shared';
import { driverColor, filterDrivers, type VehicleFilter } from '../lib/mapState';

const STORE_COLOR = '#F28C1B';
const WAITING_COLOR = '#DC2626';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

export interface LiveMapProps {
  data: MapDataDto;
  filter: VehicleFilter;
  onOrderClick?: (orderId: string) => void;
  onDriverClick?: (driverId: string) => void;
}

/** Carte Leaflet / OpenStreetMap : livreurs (libre / en course), vendeurs, commandes en attente, SOS. */
export function LiveMap({ data, filter, onOrderClick, onDriverClick }: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const handlers = useRef({ onOrderClick, onDriverClick });
  handlers.current = { onOrderClick, onDriverClick };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    const center = data.center ?? OUAGADOUGOU_CENTER;
    const map = L.map(containerRef.current, { zoomControl: true }).setView([center.lat, center.lng], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; contributeurs <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // La carte n'est créée qu'une fois ; les données sont redessinées par l'effet suivant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();

    for (const s of data.stores) {
      L.circleMarker([s.lat, s.lng], {
        radius: 6,
        color: '#ffffff',
        weight: 1.5,
        fillColor: STORE_COLOR,
        fillOpacity: s.isOpen ? 1 : 0.35,
      })
        .bindTooltip(`${escapeHtml(s.name)}${s.isOpen ? '' : ' (fermé)'}`)
        .addTo(layer);
    }

    const ordersById = new Map(data.orders.map((o) => [o.id, o]));

    for (const o of data.orders) {
      if (o.status !== 'SEARCHING_DRIVER') continue;
      if (filter !== 'ALL' && o.vehicleType !== filter) continue;
      L.circleMarker([o.pickup.lat, o.pickup.lng], {
        radius: 14,
        stroke: false,
        fillColor: WAITING_COLOR,
        fillOpacity: 0.18,
        interactive: false,
      }).addTo(layer);
      L.circleMarker([o.pickup.lat, o.pickup.lng], {
        radius: 8,
        color: '#ffffff',
        weight: 2,
        fillColor: WAITING_COLOR,
        fillOpacity: 1,
      })
        .bindTooltip(
          `#${o.number} · ${escapeHtml(LABELS.vehicleType[o.vehicleType])}<br>${escapeHtml(o.pickup.address)} → ${escapeHtml(o.dropoff.address)}`,
        )
        .on('click', () => handlers.current.onOrderClick?.(o.id))
        .addTo(layer);
    }

    for (const d of filterDrivers(data.drivers, filter)) {
      const order = d.activeOrderId ? ordersById.get(d.activeOrderId) : undefined;
      if (order) {
        const target = order.status === 'ASSIGNED' ? order.pickup : order.dropoff;
        L.polyline(
          [
            [d.lat, d.lng],
            [target.lat, target.lng],
          ],
          { color: '#2563EB', weight: 2, dashArray: '4 6', opacity: 0.7, interactive: false },
        ).addTo(layer);
      }
      L.circleMarker([d.lat, d.lng], {
        radius: 7,
        color: '#ffffff',
        weight: 2,
        fillColor: driverColor(d),
        fillOpacity: 1,
      })
        .bindTooltip(
          `${escapeHtml(d.name ?? 'Livreur')} · ${escapeHtml(LABELS.vehicleType[d.vehicleType])}${
            order ? `<br>Course #${order.number}` : '<br>Libre'
          }`,
        )
        .on('click', () => handlers.current.onDriverClick?.(d.id))
        .addTo(layer);
    }

    for (const sos of data.openSos) {
      if (sos.lat === null || sos.lng === null) continue;
      const icon = L.divIcon({
        className: 'sos-marker',
        html: `<span class="sos-dot"></span><span class="sos-label">SOS · ${escapeHtml(sos.reporter.name ?? 'Livreur')}</span>`,
        iconSize: [0, 0],
      });
      L.marker([sos.lat, sos.lng], { icon, zIndexOffset: 1000, keyboard: false }).addTo(layer);
    }
  }, [data, filter]);

  return <div ref={containerRef} className="live-map" role="region" aria-label="Carte en direct de Ouagadougou" />;
}
