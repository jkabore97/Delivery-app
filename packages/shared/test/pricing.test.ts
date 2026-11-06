import { describe, expect, it } from 'vitest';
import {
  computeDeliveryFee,
  computeDeliveryPrice,
  computeOrderTotals,
  DEFAULT_PRICING_RULES,
  formatFcfa,
  roundUpTo,
  type PricingRuleInput,
} from '../src';

const rule = (v: 'BIKE' | 'MOTO' | 'CAR'): PricingRuleInput => DEFAULT_PRICING_RULES.find((r) => r.vehicleType === v)!;

describe('roundUpTo', () => {
  it('arrondit au 50 FCFA supérieur', () => {
    expect(roundUpTo(1000)).toBe(1000);
    expect(roundUpTo(1001)).toBe(1050);
    expect(roundUpTo(1049.99)).toBe(1050);
    expect(roundUpTo(1050)).toBe(1050);
    expect(roundUpTo(0)).toBe(0);
  });
  it('ne saute pas de palier à cause des flottants', () => {
    expect(roundUpTo(700 + 200 * 1.5)).toBe(1000);
    expect(roundUpTo(0.1 * 3 * 1000)).toBe(300);
  });
});

describe('computeDeliveryFee', () => {
  it('applique le minimum pour une courte distance', () => {
    expect(computeDeliveryFee(rule('BIKE'), 1)).toBe(1000);
    expect(computeDeliveryFee(rule('MOTO'), 1)).toBe(1500);
    expect(computeDeliveryFee(rule('CAR'), 1)).toBe(3000);
  });
  it('base + km au-delà du minimum, arrondi à 50', () => {
    // MOTO 6,2 km : 700 + 1240 = 1940 -> 1950
    expect(computeDeliveryFee(rule('MOTO'), 6.2)).toBe(1950);
    // BIKE 5 km : 500 + 750 = 1250
    expect(computeDeliveryFee(rule('BIKE'), 5)).toBe(1250);
    // CAR 10,3 km : 1500 + 3605 = 5105 -> 5150
    expect(computeDeliveryFee(rule('CAR'), 10.3)).toBe(5150);
  });
  it('traite une distance négative comme 0', () => {
    expect(computeDeliveryFee(rule('BIKE'), -3)).toBe(1000);
  });
});

describe('computeDeliveryPrice / computeOrderTotals', () => {
  it('répartit commission et gain livreur', () => {
    const p = computeDeliveryPrice(rule('MOTO'), 2);
    expect(p.deliveryFee).toBe(1500);
    expect(p.deliveryCommission).toBe(300);
    expect(p.driverEarning).toBe(1200);
    expect(p.estimatedMinutes).toBeGreaterThanOrEqual(5);
  });
  it('ajoute la commission vendeur sur les articles', () => {
    const p = computeDeliveryPrice(rule('MOTO'), 2);
    const t = computeOrderTotals(p, 5000, 10);
    expect(t).toEqual({
      itemsTotal: 5000,
      deliveryFee: 1500,
      commission: 300 + 500,
      driverEarning: 1200,
      total: 6500,
      sellerPayout: 4500,
    });
  });
});

describe('formatFcfa', () => {
  it('sépare les milliers', () => {
    expect(formatFcfa(6500)).toBe('6 500 FCFA');
    expect(formatFcfa(1840000)).toBe('1 840 000 FCFA');
  });
});
