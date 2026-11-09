import type {
  DriverLocationEvent,
  DriverStatusEvent,
  IncidentDto,
  MapDataDto,
  MapDriverDto,
  VehicleType,
} from '@yaar/shared';

/**
 * Application des événements temps réel à l'instantané de carte (`GET /controller/map`).
 * Fonctions pures : chaque fonction renvoie le nouvel état et indique si un rechargement
 * complet est nécessaire (ex. livreur inconnu qui vient de se connecter).
 */
export interface MapUpdate {
  state: MapDataDto;
  needsRefetch: boolean;
}

export function applyDriverLocation(state: MapDataDto, e: DriverLocationEvent): MapUpdate {
  const idx = state.drivers.findIndex((d) => d.id === e.driverId);
  if (idx === -1) return { state, needsRefetch: true };
  const drivers = state.drivers.slice();
  const prev = drivers[idx] as MapDriverDto;
  drivers[idx] = {
    ...prev,
    lat: e.lat,
    lng: e.lng,
    lastLocationAt: e.at,
    activeOrderId: e.orderId,
    heading: e.heading ?? prev.heading ?? null,
  };
  return { state: { ...state, drivers }, needsRefetch: false };
}

export function applyDriverStatus(state: MapDataDto, e: DriverStatusEvent): MapUpdate {
  const idx = state.drivers.findIndex((d) => d.id === e.driverId);
  if (!e.isOnline) {
    if (idx === -1) return { state, needsRefetch: false };
    return { state: { ...state, drivers: state.drivers.filter((d) => d.id !== e.driverId) }, needsRefetch: false };
  }
  if (idx === -1) return { state, needsRefetch: true };
  const drivers = state.drivers.slice();
  const prev = drivers[idx] as MapDriverDto;
  drivers[idx] = { ...prev, isBusy: e.isBusy };
  return { state: { ...state, drivers }, needsRefetch: false };
}

/** Ajoute ou met à jour une alerte SOS ; une alerte résolue disparaît de la carte. */
export function applyIncident(state: MapDataDto, incident: IncidentDto): MapDataDto {
  if (incident.type !== 'SOS') return state;
  const others = state.openSos.filter((i) => i.id !== incident.id);
  if (incident.status === 'RESOLVED') return { ...state, openSos: others };
  return { ...state, openSos: [incident, ...others] };
}

export type VehicleFilter = 'ALL' | VehicleType;

export function filterDrivers(drivers: readonly MapDriverDto[], filter: VehicleFilter): MapDriverDto[] {
  return filter === 'ALL' ? drivers.slice() : drivers.filter((d) => d.vehicleType === filter);
}
