import { ROAD_DISTANCE_FACTOR } from './constants';

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371.0088;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Distance orthodromique (à vol d'oiseau) en kilomètres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Distance routière estimée (km), arrondie à 0,1 km.
 * Lot 1 : approximation haversine × 1,3 (un moteur de routage OSRM pourra la remplacer).
 */
export function roadDistanceKm(a: LatLng, b: LatLng): number {
  return Math.round(haversineKm(a, b) * ROAD_DISTANCE_FACTOR * 10) / 10;
}

/** Quartiers de Ouagadougou (centroïdes approximatifs) utilisés pour décrire une zone sans adresse exacte. */
export const OUAGADOUGOU_NEIGHBOURHOODS: ReadonlyArray<{ name: string } & LatLng> = [
  { name: 'Centre-ville', lat: 12.3686, lng: -1.5275 },
  { name: 'Patte d’Oie', lat: 12.3395, lng: -1.517 },
  { name: 'Zogona', lat: 12.3805, lng: -1.4975 },
  { name: 'Ouaga 2000', lat: 12.3226, lng: -1.4977 },
  { name: 'Gounghin', lat: 12.364, lng: -1.556 },
  { name: 'Tampouy', lat: 12.4045, lng: -1.5555 },
  { name: 'Pissy', lat: 12.3345, lng: -1.5735 },
  { name: 'Dassasgho', lat: 12.373, lng: -1.4745 },
  { name: 'Tanghin', lat: 12.4005, lng: -1.5185 },
  { name: 'Cissin', lat: 12.3365, lng: -1.5405 },
  { name: 'Wemtenga', lat: 12.3765, lng: -1.4855 },
  { name: 'Kossodo', lat: 12.4235, lng: -1.4875 },
  { name: 'Somgandé', lat: 12.4115, lng: -1.5035 },
  { name: 'Karpala', lat: 12.3355, lng: -1.4625 },
];

/**
 * Zone approximative d'un point (quartier le plus proche), sans révéler l'adresse exacte.
 * Utilisé dans les offres de course envoyées aux livreurs avant acceptation.
 */
export function approximateZone(p: LatLng): string {
  let best: { name: string; d: number } | null = null;
  for (const n of OUAGADOUGOU_NEIGHBOURHOODS) {
    const d = haversineKm(p, n);
    if (!best || d < best.d) best = { name: n.name, d };
  }
  if (!best || best.d > 6) return 'Hors des quartiers connus';
  return `Secteur ${best.name}`;
}
