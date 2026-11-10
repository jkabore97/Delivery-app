import { OUAGADOUGOU_CENTER, type AddressDto, type LatLng } from '@yaar/shared';

/** Tolérance (~10 m) pour reconnaître l'épingle laissée sur le centre par défaut de la carte. */
const DEFAULT_PIN_TOLERANCE = 1e-4;

export const PIN_NOT_PLACED_MESSAGE = 'Placez l’épingle sur le lieu exact (déplacez la carte ou « Ma position »).';

/**
 * Vrai si l'épingle n'a pas quitté le centre par défaut (Ouagadougou centre) : l'utilisateur a saisi
 * un texte sans placer l'épingle, la commande serait sinon tarifée et livrée au centre-ville.
 */
export function isPinAtDefault(p: LatLng | null | undefined): boolean {
  if (!p) return true;
  return (
    Math.abs(p.lat - OUAGADOUGOU_CENTER.lat) < DEFAULT_PIN_TOLERANCE &&
    Math.abs(p.lng - OUAGADOUGOU_CENTER.lng) < DEFAULT_PIN_TOLERANCE
  );
}

/** Une adresse est utilisable quand le texte est renseigné et l'épingle placée (coordonnées de l'épingle). */
export function isAddressComplete(a: AddressDto | null | undefined): a is AddressDto {
  return (
    !!a &&
    a.address.trim().length > 0 &&
    Number.isFinite(a.lat) &&
    Number.isFinite(a.lng) &&
    !isPinAtDefault(a)
  );
}

/** Corps d'adresse pour l'API (texte nettoyé, coordonnées arrondies à ~1 m). */
export function toAddressInput(a: AddressDto): AddressDto {
  return {
    lat: Math.round(a.lat * 1e6) / 1e6,
    lng: Math.round(a.lng * 1e6) / 1e6,
    address: a.address.trim(),
    landmark: a.landmark.trim(),
  };
}

export function addressLine(a: Pick<AddressDto, 'address' | 'landmark'>): string {
  return a.landmark.trim() ? `${a.address} · Repère : ${a.landmark}` : a.address;
}
