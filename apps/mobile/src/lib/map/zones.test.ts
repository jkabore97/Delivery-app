import { distanceM } from '@yaar/shared';
import { circleRing, zoneExtentPoints, zonesKey } from './lines';

describe('zones approximatives (cercles)', () => {
  const center = { lat: 12.3395, lng: -1.517 };

  it('contour fermé, chaque point à la distance voulue du centre', () => {
    const ring = circleRing(center, 900, 32);
    expect(ring).toHaveLength(33);
    expect(ring[0]).toEqual(ring[32]);
    for (const [lng, lat] of ring) expect(Math.abs(distanceM({ lat, lng }, center) - 900)).toBeLessThan(2);
  });

  it('points de cadrage : nord, est, sud, ouest du cercle', () => {
    const [n, e, s, w] = zoneExtentPoints({ ...center, radiusM: 900 });
    expect(n!.lat).toBeGreaterThan(center.lat);
    expect(s!.lat).toBeLessThan(center.lat);
    expect(e!.lng).toBeGreaterThan(center.lng);
    expect(w!.lng).toBeLessThan(center.lng);
  });

  it('clé stable (≈ 1 m)', () => {
    const z = { id: 'z', kind: 'dropoff' as const, ...center, radiusM: 900 };
    expect(zonesKey([z])).toBe(zonesKey([{ ...z, lat: center.lat + 0.000001 }]));
    expect(zonesKey([z])).not.toBe(zonesKey([{ ...z, radiusM: 1200 }]));
  });
});
