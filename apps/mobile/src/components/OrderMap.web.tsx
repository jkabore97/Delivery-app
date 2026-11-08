import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { OUAGADOUGOU_CENTER } from '@yaar/shared';
import { createLeafletMap, L, watchMapSize } from '../lib/leafletWeb';
import { colors, radius } from '../theme';

interface Point {
  lat: number;
  lng: number;
}

/** Version web de la carte d'une course (Leaflet + OpenStreetMap) : mêmes props que OrderMap.tsx. */
export function OrderMap({
  pickup,
  dropoff,
  driver,
  me,
  height = 260,
  style,
}: {
  pickup?: Point | null;
  dropoff?: Point | null;
  driver?: Point | null;
  me?: Point | null;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const points = [pickup, dropoff, driver, me].filter((p): p is Point => !!p);
  const key = points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|');
  const markersKey = [pickup, dropoff, driver, me].map((p) => (p ? `${p.lat.toFixed(5)},${p.lng.toFixed(5)}` : '-')).join('|');

  useEffect(() => {
    if (!el.current) return;
    const first = points[0] ?? OUAGADOUGOU_CENTER;
    const map = createLeafletMap(el.current, first, 13);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const stop = watchMapSize(map, el.current);
    return () => {
      stop();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // Carte créée une seule fois ; les marqueurs sont mis à jour ci-dessous.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marqueurs : retrait (orange), livraison (vert), livreur / moi (bleu), trajet en pointillés.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const dot = (p: Point, color: string, label: string) =>
      L.circleMarker([p.lat, p.lng], { radius: 9, color: '#fff', weight: 3, fillColor: color, fillOpacity: 1 })
        .bindTooltip(label)
        .addTo(layer);
    if (pickup && dropoff) {
      L.polyline(
        [
          [pickup.lat, pickup.lng],
          [dropoff.lat, dropoff.lng],
        ],
        { color: colors.green, weight: 4, dashArray: '8 6' },
      ).addTo(layer);
    }
    if (pickup) dot(pickup, colors.orange, 'Récupérer');
    if (dropoff) dot(dropoff, colors.green, 'Livrer');
    if (driver) dot(driver, colors.blue, 'Livreur');
    if (me) dot(me, colors.blue, 'Vous');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markersKey]);

  // Recadre seulement quand l'ensemble des points change sensiblement (comme la version native).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || points.length === 0) return;
    if (points.length === 1) map.setView([points[0]!.lat, points[0]!.lng], 15);
    else map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [40, 40] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <View style={[styles.wrap, { height }, style]}>
      <div ref={el} data-testid="order-map" style={{ position: 'absolute', inset: 0, zIndex: 0 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#E8ECEF' },
});
