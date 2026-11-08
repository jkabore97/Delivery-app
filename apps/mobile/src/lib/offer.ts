import type { OfferDto } from '@yaar/shared';

export interface OfferPlaces {
  /** Titre du retrait : nom de l'entreprise (ou de la boutique) ; à défaut, zone approximative. */
  pickupTitle: string;
  /** Adresse de l'entreprise (lieu public) ; null sans entreprise (adresse d'un particulier non communiquée). */
  pickupAddress: string | null;
  /** Zone du retrait (« Secteur Centre-ville »), null si identique au titre. */
  pickupZone: string | null;
  /** Zone approximative de livraison (« Secteur Patte d’Oie »). */
  dropoffZone: string;
}

/**
 * Avant acceptation, l'offre ne contient aucune adresse du destinataire (docs/API.md §7.3) : seulement le nom et
 * l'adresse de l'entreprise (lieu public) pour le retrait, et des zones approximatives. Les adresses exactes
 * arrivent avec la course acceptée (OrderDto).
 */
export function offerPlaces(offer: Pick<OfferDto, 'orderType' | 'pickup' | 'dropoff'>): OfferPlaces {
  const pickupZone = offer.pickup.zone ?? null;
  const business = offer.orderType === 'FOOD' || !!offer.pickup.name;
  const pickupTitle = offer.pickup.name ?? pickupZone ?? offer.pickup.address;
  const pickupAddress =
    business && offer.pickup.address !== pickupTitle && offer.pickup.address !== pickupZone ? offer.pickup.address : null;
  return {
    pickupTitle,
    pickupAddress,
    pickupZone: pickupZone && pickupZone !== pickupTitle && pickupZone !== pickupAddress ? pickupZone : null,
    dropoffZone: offer.dropoff.zone ?? offer.dropoff.address,
  };
}
