import 'leaflet/dist/leaflet.css';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type L from 'leaflet';
import { createLeafletMap, watchMapSize } from '../lib/leafletWeb';
import { zoomForDelta } from '../lib/mapRegion';
import type { AddressMapHandle, AddressMapProps } from './AddressMap';

export type { AddressMapHandle, AddressMapProps } from './AddressMap';

/** Version web de la carte « épingle fixe au centre » : Leaflet + OpenStreetMap. */
export const AddressMap = forwardRef<AddressMapHandle, AddressMapProps>(function AddressMap({ initial, onCenterChange }, ref) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const onChangeRef = useRef(onCenterChange);
  onChangeRef.current = onCenterChange;
  const initialRef = useRef(initial);

  useEffect(() => {
    if (!el.current) return;
    const map = createLeafletMap(el.current, initialRef.current, zoomForDelta());
    map.on('moveend', () => {
      const c = map.getCenter();
      onChangeRef.current(c.lat, c.lng);
    });
    mapRef.current = map;
    const stopWatching = watchMapSize(map, el.current);
    return () => {
      stopWatching();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    centerOn(lat, lng, delta) {
      mapRef.current?.setView([lat, lng], zoomForDelta(delta));
    },
  }));

  // zIndex 0 : contexte d'empilement propre, pour que l'épingle centrale (superposée) reste visible.
  return <div ref={el} data-testid="address-map" style={{ position: 'absolute', inset: 0, zIndex: 0 }} />;
});
