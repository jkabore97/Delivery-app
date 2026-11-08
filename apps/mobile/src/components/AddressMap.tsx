import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import MapView from 'react-native-maps';
import { regionFor, type LatLng } from '../lib/mapRegion';

/** Carte « épingle fixe au centre » du choix d'adresse (Android / iOS : react-native-maps). */
export interface AddressMapHandle {
  /** Recentre la carte (delta : étendue en degrés, plus petit = plus zoomé). */
  centerOn(lat: number, lng: number, delta?: number): void;
}

export interface AddressMapProps {
  initial: LatLng;
  /** Centre de la carte après un déplacement de l'utilisateur. */
  onCenterChange: (lat: number, lng: number) => void;
}

export const AddressMap = forwardRef<AddressMapHandle, AddressMapProps>(function AddressMap({ initial, onCenterChange }, ref) {
  const mapRef = useRef<MapView>(null);
  const [initialRegion] = useState(() => regionFor(initial.lat, initial.lng));
  useImperativeHandle(ref, () => ({
    centerOn(lat, lng, delta) {
      mapRef.current?.animateToRegion(regionFor(lat, lng, delta), 400);
    },
  }));
  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      initialRegion={initialRegion}
      onRegionChangeComplete={(r) => onCenterChange(r.latitude, r.longitude)}
      toolbarEnabled={false}
    />
  );
});
