import { DocumentType, VehicleType } from './enums';

/** Centre de carte par défaut : Ouagadougou. */
export const OUAGADOUGOU_CENTER = { lat: 12.3714, lng: -1.5197 } as const;

/** Facteur appliqué à la distance à vol d'oiseau pour estimer la distance routière. */
export const ROAD_DISTANCE_FACTOR = 1.3;

/** Les prix sont arrondis au multiple supérieur de cette valeur (FCFA). */
export const PRICE_ROUNDING_FCFA = 50;

/** Délai d'une offre de course avant de passer au livreur suivant. */
export const DEFAULT_OFFER_TIMEOUT_SECONDS = 30;
/** Rayon de recherche des livreurs autour du point de retrait. */
export const DEFAULT_DISPATCH_RADIUS_KM = 5;
/** Plafond d'espèces détenues au-delà duquel un livreur est bloqué. */
export const DEFAULT_CASH_LIMIT_FCFA = 50_000;
/** Durée de conservation des positions GPS des livreurs. */
export const LOCATION_RETENTION_MONTHS = 12;
/** Nombre d'essais du code de livraison avant blocage. */
export const MAX_DELIVERY_CODE_ATTEMPTS = 5;

/** Vitesse moyenne utilisée pour l'estimation de durée (km/h). */
export const AVERAGE_SPEED_KMH: Record<VehicleType, number> = {
  BIKE: 12,
  MOTO: 22,
  CAR: 20,
};

/** Pièces exigées selon le type de véhicule (KYC livreur). */
export function requiredDocuments(vehicleType: VehicleType): DocumentType[] {
  if (vehicleType === VehicleType.BIKE) {
    return [DocumentType.CNIB, DocumentType.SELFIE];
  }
  return [
    DocumentType.CNIB,
    DocumentType.PERMIS,
    DocumentType.CARTE_GRISE,
    DocumentType.ASSURANCE,
    DocumentType.SELFIE,
  ];
}

/** Une immatriculation est exigée pour la moto et la voiture, pas pour le vélo. */
export function plateRequired(vehicleType: VehicleType): boolean {
  return vehicleType !== VehicleType.BIKE;
}

/** Documents dont la date d'expiration est obligatoire. */
export const DOCUMENTS_WITH_EXPIRY: readonly DocumentType[] = [DocumentType.ASSURANCE];

/** Un livreur en ligne sans position depuis ce délai est remis hors ligne et n'est plus sollicité. */
export const DEFAULT_DRIVER_STALE_MINUTES = 10;
/** Longueur maximale d'un message client ↔ livreur. */
export const ORDER_MESSAGE_MAX_LENGTH = 500;
