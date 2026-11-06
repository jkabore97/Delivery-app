import { AVERAGE_SPEED_KMH, PRICE_ROUNDING_FCFA } from './constants';
import type { VehicleType } from './enums';

/** Règle tarifaire d'un type de véhicule (montants en FCFA entiers). */
export interface PricingRuleInput {
  vehicleType: VehicleType;
  baseFare: number;
  perKm: number;
  minimumFare: number;
  /** Commission de la plateforme sur les frais de livraison, en % (0-100). */
  commissionPercent: number;
}

export interface DeliveryPrice {
  vehicleType: VehicleType;
  distanceKm: number;
  /** Frais de livraison payés par le client. */
  deliveryFee: number;
  /** Part de la plateforme sur les frais de livraison. */
  deliveryCommission: number;
  /** Gain du livreur = deliveryFee - deliveryCommission. */
  driverEarning: number;
  estimatedMinutes: number;
}

/** Arrondit au multiple supérieur de `step` (50 FCFA par défaut). */
export function roundUpTo(amount: number, step: number = PRICE_ROUNDING_FCFA): number {
  if (step <= 0) return Math.ceil(amount);
  // Évite qu'une erreur flottante (ex. 1000.0000001) ne fasse sauter un palier.
  const units = Math.ceil(Math.round((amount / step) * 1e6) / 1e6);
  return units * step;
}

/** Prix = max(minimum, base + perKm × distance), arrondi au 50 FCFA supérieur. */
export function computeDeliveryFee(rule: PricingRuleInput, distanceKm: number): number {
  const raw = Math.max(rule.minimumFare, rule.baseFare + rule.perKm * Math.max(0, distanceKm));
  return roundUpTo(raw);
}

/** Commission arrondie à l'entier inférieur (le livreur garde l'arrondi). */
export function computeCommission(amount: number, percent: number): number {
  return Math.floor((amount * percent) / 100);
}

export function estimateMinutes(vehicleType: VehicleType, distanceKm: number): number {
  const minutes = (distanceKm / AVERAGE_SPEED_KMH[vehicleType]) * 60;
  return Math.max(5, Math.ceil(minutes));
}

export function computeDeliveryPrice(rule: PricingRuleInput, distanceKm: number): DeliveryPrice {
  const deliveryFee = computeDeliveryFee(rule, distanceKm);
  const deliveryCommission = computeCommission(deliveryFee, rule.commissionPercent);
  return {
    vehicleType: rule.vehicleType,
    distanceKm,
    deliveryFee,
    deliveryCommission,
    driverEarning: deliveryFee - deliveryCommission,
    estimatedMinutes: estimateMinutes(rule.vehicleType, distanceKm),
  };
}

export interface OrderTotals {
  itemsTotal: number;
  deliveryFee: number;
  /** Commission totale plateforme = commission livraison + commission vendeur sur les articles. */
  commission: number;
  driverEarning: number;
  /** Montant payé par le client (articles + livraison). */
  total: number;
  /** Montant reversé au vendeur = itemsTotal - commission vendeur. */
  sellerPayout: number;
}

/**
 * Calcule l'ensemble des montants d'une commande.
 * @param storeCommissionPercent commission prélevée sur les articles du vendeur (0 pour un colis).
 */
export function computeOrderTotals(
  price: DeliveryPrice,
  itemsTotal: number,
  storeCommissionPercent: number,
): OrderTotals {
  const itemsCommission = computeCommission(itemsTotal, storeCommissionPercent);
  return {
    itemsTotal,
    deliveryFee: price.deliveryFee,
    commission: price.deliveryCommission + itemsCommission,
    driverEarning: price.driverEarning,
    total: itemsTotal + price.deliveryFee,
    sellerPayout: itemsTotal - itemsCommission,
  };
}

/** Grille tarifaire initiale (seed). */
export const DEFAULT_PRICING_RULES: PricingRuleInput[] = [
  { vehicleType: 'BIKE', baseFare: 500, perKm: 150, minimumFare: 1000, commissionPercent: 20 },
  { vehicleType: 'MOTO', baseFare: 700, perKm: 200, minimumFare: 1500, commissionPercent: 20 },
  { vehicleType: 'CAR', baseFare: 1500, perKm: 350, minimumFare: 3000, commissionPercent: 20 },
];

/** Formate un montant en FCFA à la française : 6 500 FCFA. */
export function formatFcfa(amount: number): string {
  const s = Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${s} FCFA`;
}
