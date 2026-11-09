import { describe, expect, it } from 'vitest';
import { approximateZone, approximateZoneCenter, haversineKm, roadDistanceKm, OUAGADOUGOU_CENTER } from '../src';

describe('approximateZoneCenter', () => {
  it('renvoie le centroïde du quartier le plus proche, cohérent avec approximateZone', () => {
    const p = { lat: 12.3421, lng: -1.5143 };
    expect(approximateZone(p)).toBe('Secteur Patte d’Oie');
    expect(approximateZoneCenter(p)).toEqual({ lat: 12.3395, lng: -1.517 });
    // Deux adresses du même quartier : le même point.
    expect(approximateZoneCenter({ lat: 12.3371, lng: -1.5199 })).toEqual(approximateZoneCenter(p));
  });

  it('hors des quartiers connus : point arrondi à 0,02°, jamais la position exacte', () => {
    const far = { lat: 11.1771, lng: -4.2979 };
    expect(approximateZone(far)).toBe('Hors des quartiers connus');
    expect(approximateZoneCenter(far)).toEqual({ lat: 11.18, lng: -4.3 });
  });
});

describe('haversineKm', () => {
  it('vaut 0 pour un même point', () => {
    expect(haversineKm(OUAGADOUGOU_CENTER, OUAGADOUGOU_CENTER)).toBe(0);
  });

  it('1 degré de latitude ≈ 111,2 km', () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.2, 0);
  });

  it('est symétrique', () => {
    const a = { lat: 12.3714, lng: -1.5197 };
    const b = { lat: 12.3299, lng: -1.4908 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10);
  });

  it('Ouaga centre -> Ouaga 2000 ≈ 5,6 km à vol d’oiseau', () => {
    const d = haversineKm(OUAGADOUGOU_CENTER, { lat: 12.3226, lng: -1.4977 });
    expect(d).toBeGreaterThan(5.5);
    expect(d).toBeLessThan(6.0);
  });
});

describe('roadDistanceKm', () => {
  it('applique le facteur 1,3 et arrondit à 0,1 km', () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 0.01, lng: 0 }; // ≈ 1,112 km
    expect(roadDistanceKm(a, b)).toBe(1.4);
  });
});
