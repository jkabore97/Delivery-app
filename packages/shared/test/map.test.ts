import { describe, expect, it } from 'vitest';
import {
  arrivalClockFr,
  bearingDeg,
  boundsCenter,
  boundsOf,
  distanceM,
  easeInOutCubic,
  formatArrivalFr,
  formatClockFr,
  formatDistanceFr,
  formatDurationFr,
  haversineKm,
  interpolateBearing,
  interpolateLatLng,
  minutesFromSeconds,
  nearestPointOnPolyline,
  normalizeDeg,
  padBounds,
  polylineLengthM,
  regionForBounds,
  remainingDistanceM,
  routeProgress,
  shortestAngleDelta,
  splitPolylineAt,
  toLatLng,
  toLatLngTuple,
  type LatLngTuple,
} from '../src';

// Un trajet réaliste dans Ouagadougou : Zogona → avenue Charles de Gaulle → Wemtenga (en « L »).
const ROUTE: LatLngTuple[] = [
  [12.3805, -1.4975],
  [12.3805, -1.4925],
  [12.3805, -1.4875],
  [12.3765, -1.4875],
  [12.3725, -1.4875],
];

describe('distances et caps', () => {
  it('distanceM est cohérente avec haversineKm', () => {
    const a = { lat: 12.3714, lng: -1.5197 };
    const b = { lat: 12.3226, lng: -1.4977 };
    expect(distanceM(a, b)).toBeCloseTo(haversineKm(a, b) * 1000, 6);
    expect(distanceM(a, a)).toBe(0);
  });

  it('cap : nord 0°, est 90°, sud 180°, ouest 270°', () => {
    const o = { lat: 12.37, lng: -1.52 };
    expect(bearingDeg(o, { lat: 12.38, lng: -1.52 })).toBeCloseTo(0, 6);
    expect(bearingDeg(o, { lat: 12.37, lng: -1.51 })).toBeCloseTo(90, 1);
    expect(bearingDeg(o, { lat: 12.36, lng: -1.52 })).toBeCloseTo(180, 6);
    expect(bearingDeg(o, { lat: 12.37, lng: -1.53 })).toBeCloseTo(270, 1);
    expect(bearingDeg(o, o)).toBe(0);
  });

  it('normalise et compare les angles par le plus court chemin', () => {
    expect(normalizeDeg(-90)).toBe(270);
    expect(normalizeDeg(720)).toBe(0);
    expect(shortestAngleDelta(350, 10)).toBe(20);
    expect(shortestAngleDelta(10, 350)).toBe(-20);
    expect(shortestAngleDelta(0, 180)).toBe(180);
  });
});

describe('interpolation', () => {
  it('interpole une position et borne t', () => {
    const a = { lat: 12.3, lng: -1.5 };
    const b = { lat: 12.4, lng: -1.4 };
    const mid = interpolateLatLng(a, b, 0.5);
    expect(mid.lat).toBeCloseTo(12.35, 9);
    expect(mid.lng).toBeCloseTo(-1.45, 9);
    expect(interpolateLatLng(a, b, -1)).toEqual(a);
    expect(interpolateLatLng(a, b, 2)).toEqual(b);
  });

  it('interpole un cap par le plus court chemin (350° → 10° passe par 0°)', () => {
    expect(interpolateBearing(350, 10, 0.5)).toBeCloseTo(0, 6);
    expect(interpolateBearing(10, 350, 0.25)).toBeCloseTo(5, 6);
    expect(interpolateBearing(90, 180, 1)).toBe(180);
  });

  it('courbe douce : 0 → 0, 0,5 → 0,5, 1 → 1', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 6);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.25)).toBeLessThan(0.25);
  });

  it('convertit [lat, lng] ↔ { lat, lng }', () => {
    expect(toLatLng([12.1, -1.2])).toEqual({ lat: 12.1, lng: -1.2 });
    expect(toLatLng({ lat: 1, lng: 2 })).toEqual({ lat: 1, lng: 2 });
    expect(toLatLngTuple({ lat: 1, lng: 2 })).toEqual([1, 2]);
  });
});

describe('projection sur un itinéraire', () => {
  it('longueur du tracé ≈ 1,09 km + 0,89 km', () => {
    const len = polylineLengthM(ROUTE);
    expect(len).toBeGreaterThan(1900);
    expect(len).toBeLessThan(2050);
  });

  it('point le plus proche : livreur légèrement à côté du premier tronçon', () => {
    const p = { lat: 12.3808, lng: -1.4950 }; // ~33 m au nord de la ligne, à mi-chemin du 1er segment
    const proj = nearestPointOnPolyline(ROUTE, p)!;
    expect(proj.index).toBe(0);
    expect(proj.t).toBeCloseTo(0.5, 2);
    expect(proj.point.lat).toBeCloseTo(12.3805, 6);
    expect(proj.point.lng).toBeCloseTo(-1.495, 6);
    expect(proj.distanceM).toBeGreaterThan(25);
    expect(proj.distanceM).toBeLessThan(40);
    expect(proj.alongM).toBeCloseTo(distanceM({ lat: 12.3805, lng: -1.4975 }, proj.point), 0);
  });

  it('point le plus proche sur le second tronçon (après le virage)', () => {
    const proj = nearestPointOnPolyline(ROUTE, { lat: 12.3745, lng: -1.4870 })!;
    expect(proj.index).toBe(3);
    expect(proj.point.lng).toBeCloseTo(-1.4875, 6);
  });

  it('ligne vide ou à un point', () => {
    expect(nearestPointOnPolyline([], { lat: 0, lng: 0 })).toBeNull();
    expect(splitPolylineAt([], { lat: 0, lng: 0 })).toBeNull();
    const single = nearestPointOnPolyline([[12, -1]], { lat: 12, lng: -1 })!;
    expect(single.distanceM).toBe(0);
  });

  it('coupe le tracé : partie parcourue + partie restante, qui commence au livreur', () => {
    const p = { lat: 12.3805, lng: -1.49 };
    const split = splitPolylineAt(ROUTE, p)!;
    expect(split.remaining[0]).toEqual(split.projection.point);
    expect(split.projection.t).toBeGreaterThan(0);
    expect(split.projection.t).toBeLessThan(1);
    expect(split.remaining.at(-1)).toEqual({ lat: 12.3725, lng: -1.4875 });
    expect(split.travelled[0]).toEqual({ lat: 12.3805, lng: -1.4975 });
    expect(split.travelled.at(-1)).toEqual(split.projection.point);
    const total = polylineLengthM(ROUTE);
    expect(polylineLengthM(split.travelled) + polylineLengthM(split.remaining)).toBeCloseTo(total, 3);
  });

  it('distance restante décroît quand le livreur avance', () => {
    const start = remainingDistanceM(ROUTE, { lat: 12.3805, lng: -1.4975 });
    const mid = remainingDistanceM(ROUTE, { lat: 12.3805, lng: -1.4875 });
    const end = remainingDistanceM(ROUTE, { lat: 12.3725, lng: -1.4875 });
    expect(start).toBeCloseTo(polylineLengthM(ROUTE), 3);
    expect(mid).toBeLessThan(start);
    expect(end).toBeCloseTo(0, 6);
  });

  it('avancement : distance et durée restantes au prorata des valeurs de l’API', () => {
    const route = { points: ROUTE, distanceM: 2400, durationS: 600 };
    const none = routeProgress(route, null);
    expect(none).toMatchObject({ remainingM: 2400, remainingS: 600, fraction: 0, offRouteM: 0 });
    expect(none.remaining).toHaveLength(ROUTE.length);
    const half = routeProgress(route, { lat: 12.3805, lng: -1.4875 }); // au virage ≈ 55 % du tracé
    expect(half.fraction).toBeGreaterThan(0.5);
    expect(half.fraction).toBeLessThan(0.6);
    expect(half.remainingM).toBeCloseTo(2400 * (1 - half.fraction), 6);
    expect(half.remainingS).toBeCloseTo(600 * (1 - half.fraction), 6);
    expect(half.remaining).toEqual([
      { lat: 12.3805, lng: -1.4875 },
      { lat: 12.3765, lng: -1.4875 },
      { lat: 12.3725, lng: -1.4875 },
    ]); // projection sur un sommet : pas de point en double
    const off = routeProgress(route, { lat: 12.39, lng: -1.4875 });
    expect(off.offRouteM).toBeGreaterThan(900);
  });
});

describe('cadrage', () => {
  it('rectangle englobant, points invalides ignorés', () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([null, undefined])).toBeNull();
    const b = boundsOf([{ lat: 12.3, lng: -1.5 }, [12.4, -1.45], { lat: Number.NaN, lng: 0 }])!;
    expect(b).toEqual({ south: 12.3, north: 12.4, west: -1.5, east: -1.45 });
    expect(boundsCenter(b).lat).toBeCloseTo(12.35, 9);
    expect(boundsCenter(b).lng).toBeCloseTo(-1.475, 9);
  });

  it('marge proportionnelle et étendue minimale pour un point unique', () => {
    const b = padBounds({ south: 12.3, north: 12.4, west: -1.5, east: -1.4 }, 0.1);
    expect(b.south).toBeCloseTo(12.29, 6);
    expect(b.north).toBeCloseTo(12.41, 6);
    const one = padBounds({ south: 12.37, north: 12.37, west: -1.52, east: -1.52 }, 0, 0.01);
    expect(one.north - one.south).toBeCloseTo(0.01, 9);
    expect(one.east - one.west).toBeCloseTo(0.01, 9);
  });

  it('région react-native-maps centrée avec marge', () => {
    const r = regionForBounds({ south: 12.3, north: 12.4, west: -1.5, east: -1.4 }, { paddingRatio: 0 });
    expect(r.latitude).toBeCloseTo(12.35, 6);
    expect(r.longitude).toBeCloseTo(-1.45, 6);
    expect(r.latitudeDelta).toBeCloseTo(0.1, 6);
  });
});

describe('textes en français', () => {
  it('distances', () => {
    expect(formatDistanceFr(0)).toBe('10 m');
    expect(formatDistanceFr(84)).toBe('80 m');
    expect(formatDistanceFr(850)).toBe('850 m');
    expect(formatDistanceFr(1234)).toBe('1,2 km');
    expect(formatDistanceFr(12_400)).toBe('12 km');
  });

  it('durées', () => {
    expect(minutesFromSeconds(0)).toBe(1);
    expect(minutesFromSeconds(61)).toBe(2);
    expect(formatDurationFr(0.2)).toBe('1 min');
    expect(formatDurationFr(12)).toBe('12 min');
    expect(formatDurationFr(60)).toBe('1 h');
    expect(formatDurationFr(65)).toBe('1 h 05');
  });

  it('heure d’arrivée (Ouagadougou = UTC)', () => {
    const now = Date.parse('2026-11-08T14:20:10Z');
    expect(formatClockFr(now)).toBe('14:20');
    expect(arrivalClockFr(12, now)).toBe('14:32');
    expect(formatArrivalFr(12, now)).toBe('Arrivée vers 14:32 · dans 12 min');
    expect(formatArrivalFr(75, now)).toBe('Arrivée vers 15:35 · dans 1 h 15');
    expect(formatArrivalFr(0, now)).toBe('Arrivée imminente');
    expect(formatArrivalFr(Number.NaN, now)).toBe('Arrivée imminente');
  });
});
