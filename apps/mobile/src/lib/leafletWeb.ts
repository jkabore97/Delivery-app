import L from 'leaflet';

/**
 * Leaflet + OpenStreetMap pour la version web (react-native-maps n'a pas de rendu web).
 * Utilisé uniquement par les composants `*.web.tsx`.
 */
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export function createLeafletMap(el: HTMLElement, center: { lat: number; lng: number }, zoom: number): L.Map {
  const map = L.map(el, { zoomControl: true, attributionControl: true }).setView([center.lat, center.lng], zoom);
  L.tileLayer(OSM_TILE_URL, { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(map);
  return map;
}

/** Leaflet calcule sa taille au montage : on la recalcule quand le conteneur change de taille. */
export function watchMapSize(map: L.Map, el: HTMLElement): () => void {
  const t = setTimeout(() => map.invalidateSize(), 50);
  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
  }
  return () => {
    clearTimeout(t);
    ro?.disconnect();
  };
}

export { L };
