import { useEffect, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { OUAGADOUGOU_CENTER } from '@yaar/shared';
import { colors, radius } from '../theme';

interface Point {
  lat: number;
  lng: number;
}

/** Carte d'une course : retrait (orange), livraison (vert), livreur (bleu). */
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
  /** Position du livreur lui-même (application livreur). */
  me?: Point | null;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const mapRef = useRef<MapView>(null);
  const points = [pickup, dropoff, driver, me].filter((p): p is Point => !!p);
  const key = points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|');

  useEffect(() => {
    if (points.length === 0) return;
    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(
        points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
        { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: true },
      );
    }, 300);
    return () => clearTimeout(t);
    // Recadre seulement quand l'ensemble des points change sensiblement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const first = points[0] ?? OUAGADOUGOU_CENTER;
  return (
    <View style={[styles.wrap, { height }, style]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: first.lat, longitude: first.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
        toolbarEnabled={false}
      >
        {pickup ? (
          <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} pinColor={colors.orange} title="Récupérer" />
        ) : null}
        {dropoff ? (
          <Marker coordinate={{ latitude: dropoff.lat, longitude: dropoff.lng }} pinColor={colors.green} title="Livrer" />
        ) : null}
        {pickup && dropoff ? (
          <Polyline
            coordinates={[
              { latitude: pickup.lat, longitude: pickup.lng },
              { latitude: dropoff.lat, longitude: dropoff.lng },
            ]}
            strokeColor={colors.green}
            strokeWidth={4}
            lineDashPattern={[8, 6]}
          />
        ) : null}
        {driver ? (
          <Marker coordinate={{ latitude: driver.lat, longitude: driver.lng }} pinColor={colors.blue} title="Livreur" />
        ) : null}
        {me ? <Marker coordinate={{ latitude: me.lat, longitude: me.lng }} pinColor={colors.blue} title="Vous" /> : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#E8ECEF' },
});
