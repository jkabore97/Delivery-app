import type { OfferDto } from '@yaar/shared';

export interface OfferPlaces {
  /** Titre du retrait : nom de la boutique (FOOD) ou zone approximative (colis). */
  pickupTitle: string;
  /** Adresse publique de la boutique (FOOD) ; null pour un colis (adresse du client non communiquée). */
  pickupAddress: string | null;
  /** Zone du retrait (« Secteur Centre-ville »), null si identique au titre. */
  pickupZone: string | null;
  /** Zone approximative de livraison (« Secteur Patte d’Oie »). */
  dropoffZone: string;
}

/**
 * Avant acceptation, l'offre ne contient aucune adresse du client (docs/API.md §7.3) : seulement l'adresse
 * de la boutique pour un repas et des zones approximatives. Les adresses exactes arrivent avec la course
 * acceptée (OrderDto).
 */
export function offerPlaces(offer: Pick<OfferDto, 'orderType' | 'pickup' | 'dropoff'>): OfferPlaces {
  const pickupZone = offer.pickup.zone ?? null;
  const isFood = offer.orderType === 'FOOD';
  const pickupTitle = offer.pickup.name ?? pickupZone ?? offer.pickup.address;
  const pickupAddress = isFood && offer.pickup.address !== pickupTitle ? offer.pickup.address : null;
  return {
    pickupTitle,
    pickupAddress,
    pickupZone: pickupZone && pickupZone !== pickupTitle && pickupZone !== pickupAddress ? pickupZone : null,
    dropoffZone: offer.dropoff.zone ?? offer.dropoff.address,
  };
}
