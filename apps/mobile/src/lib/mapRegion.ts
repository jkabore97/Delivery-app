export interface LatLng {
  lat: number;
  lng: number;
}

export interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export const DEFAULT_DELTA = 0.02;

export function regionFor(lat: number, lng: number, delta = DEFAULT_DELTA): Region {
  return { latitude: lat, longitude: lng, latitudeDelta: delta, longitudeDelta: delta };
}

/** Niveau de zoom Leaflet (web) équivalent à une étendue en degrés (approximation Web Mercator). */
export function zoomForDelta(delta: number = DEFAULT_DELTA): number {
  const z = Math.round(Math.log2(360 / Math.max(delta, 1e-6)));
  return Math.min(18, Math.max(3, z));
}
