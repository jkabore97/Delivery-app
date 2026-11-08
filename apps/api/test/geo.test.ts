import { describe, expect, it } from 'vitest';
import {
  bearingDeg,
  decodePolyline,
  distanceM,
  downsamplePolyline,
  encodePolyline,
  polylineLengthM,
  projectOnPolyline,
  remainingFraction,
  simplifyPolyline,
  type LatLngTuple,
} from '../src/lib/geo';
import { headingForDto, MIN_BEARING_DISTANCE_M, nextHeading, normalizeHeading } from '../src/services/heading';

/** Tracé sinueux de `n` points (≈ 2,5 m d'écart entre points) autour de Ouagadougou. */
function wiggly(n: number): LatLngTuple[] {
  const pts: LatLngTuple[] = [];
  for (let i = 0; i < n; i++) pts.push([12.36 + i * 0.00002, -1.53 + Math.sin(i / 7) * 0.002]);
  return pts;
}

describe('polylignes (format Google / OSRM, précision 5)', () => {
  it('décode l’exemple de référence de Google', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ]);
  });

  it('encode puis décode à l’identique (5 décimales)', () => {
    const pts: LatLngTuple[] = [
      [12.3686, -1.5275],
      [12.36861, -1.52749],
      [12.3395, -1.517],
      [-12.5, 179.99999],
    ];
    expect(decodePolyline(encodePolyline(pts))).toEqual(pts);
    expect(decodePolyline('')).toEqual([]);
  });

  it('refuse une polyligne tronquée, un caractère invalide ou une valeur trop longue', () => {
    const ok = encodePolyline([[12.3686, -1.5275]]);
    expect(() => decodePolyline(ok.slice(0, -1))).toThrow(/tronquée/);
    expect(() => decodePolyline('_p~iF ~ps|U')).toThrow(/invalide/);
    expect(() => decodePolyline('~~~~~~~~~~~')).toThrow();
  });
});

describe('simplification (Douglas–Peucker) à 300 points au plus', () => {
  it('retire les points alignés et garde le premier et le dernier', () => {
    const line: LatLngTuple[] = Array.from({ length: 50 }, (_, i) => [12.36 + i * 0.0001, -1.53] as LatLngTuple);
    expect(simplifyPolyline(line, 1)).toEqual([line[0], line[49]]);
    const corner: LatLngTuple[] = [
      [12.36, -1.53],
      [12.361, -1.53],
      [12.362, -1.53],
      [12.362, -1.529],
      [12.362, -1.528],
    ];
    expect(simplifyPolyline(corner, 1)).toEqual([corner[0], corner[2], corner[4]]);
  });

  it('réduit un long tracé à ≤ 300 points, premier et dernier conservés, sans s’écarter de plus de la tolérance utile', () => {
    const pts = wiggly(5000);
    const out = downsamplePolyline(pts, 300);
    expect(out.length).toBeLessThanOrEqual(300);
    expect(out.length).toBeGreaterThan(10);
    expect(out[0]).toEqual(pts[0]);
    expect(out.at(-1)).toEqual(pts.at(-1));
    // Chaque point d'origine reste proche du tracé simplifié.
    const worst = Math.max(...pts.filter((_, i) => i % 50 === 0).map((p) => projectOnPolyline(out, { lat: p[0], lng: p[1] }).distanceM));
    expect(worst).toBeLessThan(60);
    // Longueur quasi conservée.
    expect(Math.abs(polylineLengthM(out) - polylineLengthM(pts)) / polylineLengthM(pts)).toBeLessThan(0.05);
    // Limite plus basse respectée aussi.
    expect(downsamplePolyline(pts, 20).length).toBeLessThanOrEqual(20);
  });

  it('cas dégénérés : un tracé déjà court est inchangé, des points identiques donnent 2 points', () => {
    const two: LatLngTuple[] = [
      [12.36, -1.53],
      [12.37, -1.52],
    ];
    expect(downsamplePolyline(two)).toEqual(two);
    expect(downsamplePolyline([[12.36, -1.53], [12.36, -1.53], [12.36, -1.53]])).toEqual([
      [12.36, -1.53],
      [12.36, -1.53],
    ]);
  });
});

describe('projection sur le tracé et cap', () => {
  const route: LatLngTuple[] = [
    [12.36, -1.53],
    [12.37, -1.53], // ≈ 1,1 km vers le nord
    [12.37, -1.52], // ≈ 1,1 km vers l'est
  ];

  it('écart au tracé, distance parcourue et part restante', () => {
    const total = polylineLengthM(route);
    const onRoute = projectOnPolyline(route, { lat: 12.365, lng: -1.53 });
    expect(onRoute.distanceM).toBeLessThan(1);
    expect(onRoute.alongM / total).toBeCloseTo(0.25, 2);
    expect(remainingFraction(route, { lat: 12.365, lng: -1.53 })).toBeCloseTo(0.75, 2);
    // 200 m à l'ouest du premier segment : hors itinéraire.
    const off = projectOnPolyline(route, { lat: 12.365, lng: -1.53 - 200 / 108_800 });
    expect(off.distanceM).toBeGreaterThan(190);
    expect(off.distanceM).toBeLessThan(210);
    expect(remainingFraction(route, { lat: 12.37, lng: -1.52 })).toBe(0);
    expect(remainingFraction(route, { lat: 12.35, lng: -1.53 })).toBe(1);
  });

  it('aller-retour dans des rues parallèles : le passage le plus tôt est retenu (ETA prudente)', () => {
    const uTurn: LatLngTuple[] = [
      [12.36, -1.53],
      [12.37, -1.53],
      [12.37, -1.52989], // demi-tour à 12 m
      [12.36, -1.52989],
    ];
    const atStart = projectOnPolyline(uTurn, { lat: 12.3605, lng: -1.529945 });
    expect(atStart.alongM).toBeLessThan(100);
  });

  it('cap : nord 0°, est 90°, sud 180°, ouest 270°', () => {
    const o = { lat: 12.36, lng: -1.53 };
    expect(bearingDeg(o, { lat: 12.37, lng: -1.53 })).toBeCloseTo(0, 1);
    expect(bearingDeg(o, { lat: 12.36, lng: -1.52 })).toBeCloseTo(90, 0);
    expect(bearingDeg(o, { lat: 12.35, lng: -1.53 })).toBeCloseTo(180, 1);
    expect(bearingDeg(o, { lat: 12.36, lng: -1.54 })).toBeCloseTo(270, 0);
  });
});

describe('cap du livreur (téléphone ou calculé)', () => {
  const prev = { lat: 12.36, lng: -1.53, heading: 42 };
  const north30m = { lat: 12.36 + 30 / 111_000, lng: -1.53 };
  const north5m = { lat: 12.36 + 5 / 111_000, lng: -1.53 };

  it('cap du téléphone accepté quand il est valide et que la vitesse indique un déplacement (ou est absente)', () => {
    expect(nextHeading(prev, { ...north5m, heading: 271.04, speed: 6 })).toBe(271);
    expect(nextHeading(prev, { ...north5m, heading: 90 })).toBe(90);
    expect(nextHeading(prev, { ...north5m, heading: 360, speed: 3 })).toBe(0);
  });

  it('à l’arrêt (vitesse < 1 m/s), cap du téléphone ignoré : calculé depuis la position précédente si ≥ 15 m', () => {
    expect(nextHeading(prev, { ...north30m, heading: 200, speed: 0.2 })).toBeCloseTo(0, 0);
    // Déplacement < 15 m : cap précédent conservé.
    expect(nextHeading(prev, { ...north5m, heading: 200, speed: 0 })).toBe(42);
    expect(distanceM(prev, north5m)).toBeLessThan(MIN_BEARING_DISTANCE_M);
  });

  it('sans cap du téléphone : calculé si ≥ 15 m, sinon conservé ; inconnu sans position précédente', () => {
    expect(nextHeading(prev, north30m)).toBeCloseTo(0, 0);
    expect(nextHeading(prev, { lat: 12.36, lng: -1.53 + 30 / 108_800, speed: 4 })).toBeCloseTo(90, 0);
    expect(nextHeading(prev, north5m)).toBe(42);
    expect(nextHeading({ lat: null, lng: null, heading: null }, north30m)).toBeNull();
  });

  it('normalisation et valeur exposée', () => {
    expect(normalizeHeading(-90)).toBe(270);
    expect(normalizeHeading(359.97)).toBe(0);
    expect(headingForDto(359.6)).toBe(0);
    expect(headingForDto(12.4)).toBe(12);
    expect(headingForDto(null)).toBeNull();
  });
});
