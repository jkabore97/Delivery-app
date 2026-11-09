import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import { ANDROID_MAP_STYLE, MAP_PALETTE } from '../../lib/map/style';
import { deltaForZoom, type PickerMapHandle, type PickerMapProps } from './types';

export type { PickerMapHandle, PickerMapProps } from './types';

/**
 * Carte du choix d'adresse « épingle fixe au centre » (Android / iOS : react-native-maps) : style Google Maps Cobalt
 * (Android), Apple Plans clair (iOS).
 */
export const PickerMap = forwardRef<PickerMapHandle, PickerMapProps>(function PickerMap(
  { initial, initialZoom = 15, onCenterChange, onMoveStart, style, testID = 'address-map' },
  ref,
) {
  const mapRef = useRef<MapView>(null);
  const moving = useRef(false);
  const [initialRegion] = useState(() => ({
    latitude: initial.lat,
    longitude: initial.lng,
    latitudeDelta: deltaForZoom(initialZoom),
    longitudeDelta: deltaForZoom(initialZoom),
  }));
  useImperativeHandle(ref, () => ({
    centerOn(lat, lng, zoom) {
      const d = deltaForZoom(zoom ?? 15);
      mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: d, longitudeDelta: d }, 450);
    },
  }));
  const android = Platform.OS === 'android';
  return (
    <View style={[styles.wrap, style]} testID={testID}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={android ? PROVIDER_GOOGLE : undefined}
        customMapStyle={android ? ANDROID_MAP_STYLE : undefined}
        userInterfaceStyle="light"
        mapType="standard"
        initialRegion={initialRegion}
        rotateEnabled={false}
        pitchEnabled={false}
        showsPointsOfInterests={false}
        toolbarEnabled={false}
        onRegionChange={() => {
          if (moving.current) return;
          moving.current = true;
          onMoveStart?.();
        }}
        onRegionChangeComplete={(r) => {
          moving.current = false;
          onCenterChange(r.latitude, r.longitude);
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: MAP_PALETTE.background },
});
