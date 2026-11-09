import { AVERAGE_SPEED_KMH, type DriverProfileDto, type OfferDto, type OrderDto } from '@yaar/shared';
import type { MapPoint, SceneLine, SceneMarker, SceneZone } from '../components/map/types';
import { avatarInitials } from '../components/map/markerArt';
import { zoneExtentPoints } from './map/lines';
import { formatKm } from './format';

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

/**
 * Offre affichée au livreur : la plus récente, seulement en ligne et sans course en cours (mêmes règles pour la
 * fenêtre de l'offre et pour l'accueil, qui démonte sa carte pendant ce temps).
 */
export function visibleOffer(
  profile: Pick<DriverProfileDto, 'isOnline'> | null | undefined,
  currentOrder: Pick<OrderDto, 'id'> | null,
  offers: OfferDto[],
): OfferDto | null {
  return profile?.isOnline && !currentOrder ? (offers[0] ?? null) : null;
}

export interface OfferEta {
  /** Minutes estimées jusqu'au retrait (1 au moins). */
  minutes: number;
  /** Distance livreur → retrait annoncée par l'API (km). */
  km: number;
}

/**
 * Temps pour rejoindre le retrait : distance annoncée par l'API (`pickup.distanceFromDriverKm`) à la vitesse moyenne
 * du véhicule (AVERAGE_SPEED_KMH), arrondi à la minute supérieure, 1 min au moins (et non les 5 min minimum
 * d'`estimateMinutes`, faits pour une course entière). null si la distance est inconnue.
 */
export function offerPickupEta(offer: Pick<OfferDto, 'vehicleType' | 'pickup'>): OfferEta | null {
  const km = offer.pickup.distanceFromDriverKm;
  if (km === null || km === undefined || !Number.isFinite(km) || km < 0) return null;
  const speed = AVERAGE_SPEED_KMH[offer.vehicleType] ?? AVERAGE_SPEED_KMH.MOTO;
  return { minutes: Math.max(1, Math.ceil((km / speed) * 60)), km };
}

/** « ≈ 6 min · 2,1 km » (pastille de l'offre), null si la distance est inconnue. */
export function formatOfferEta(offer: Pick<OfferDto, 'vehicleType' | 'pickup'>): string | null {
  const eta = offerPickupEta(offer);
  return eta ? `≈ ${eta.minutes} min · ${formatKm(eta.km)}` : null;
}

/** Rayon du cercle doux de la zone de livraison (et de retrait approximatif) sur la carte de l'offre. */
export const OFFER_ZONE_RADIUS_M = 900;

export interface OfferScene {
  markers: SceneMarker[];
  lines: SceneLine[];
  zones: SceneZone[];
  fitPoints: MapPoint[];
}

const point = (p: { lat: number; lng: number } | null | undefined): MapPoint | null =>
  p && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? { lat: p.lat, lng: p.lng } : null;

/**
 * Carte de l'offre (fond sombre) AVANT acceptation : le livreur, le retrait (épingle aux initiales de l'entreprise
 * quand c'est un lieu professionnel à position exacte, sinon cercle doux autour du centre de la zone), la zone de
 * livraison en cercle doux (centre du quartier : jamais la position du destinataire) et un pointillé retrait →
 * zone ; cadrage sur le tout, cercles compris.
 */
export function offerScene(offer: Pick<OfferDto, 'id' | 'vehicleType' | 'pickup' | 'dropoff'>, driver: MapPoint | null): OfferScene {
  const markers: SceneMarker[] = [];
  const zones: SceneZone[] = [];
  const lines: SceneLine[] = [];
  const fitPoints: MapPoint[] = [];
  const me = point(driver);
  const exact = point(offer.pickup.location);
  const approxPickup = exact ? null : point(offer.pickup.approxLocation);
  const dropZone = point(offer.dropoff.approxLocation);

  if (exact) {
    markers.push({
      id: `${offer.id}:pickup`,
      kind: 'pickup',
      ...exact,
      initials: avatarInitials(offer.pickup.name),
      title: offer.pickup.name ?? 'Retrait',
    });
    fitPoints.push(exact);
  } else if (approxPickup) {
    const z: SceneZone = { id: `${offer.id}:pickup-zone`, kind: 'pickup', ...approxPickup, radiusM: OFFER_ZONE_RADIUS_M };
    zones.push(z);
    fitPoints.push(...zoneExtentPoints(z));
  }
  if (dropZone) {
    const z: SceneZone = { id: `${offer.id}:dropoff-zone`, kind: 'dropoff', ...dropZone, radiusM: OFFER_ZONE_RADIUS_M };
    zones.push(z);
    fitPoints.push(...zoneExtentPoints(z));
  }
  const from = exact ?? approxPickup;
  if (from && dropZone) lines.push({ id: `${offer.id}:trip`, kind: 'dashed', points: [from, dropZone] });
  if (me) {
    markers.push({ id: 'me', kind: 'driver', ...me, vehicleType: offer.vehicleType, title: 'Vous' });
    fitPoints.push(me);
  }
  return { markers, lines, zones, fitPoints };
}
