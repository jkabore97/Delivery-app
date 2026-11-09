import { artToSvg, vehicleSideGlyph } from './markerArt';
import { setDriverHeading } from './markerDom.web';
import { radarRings, RADAR_PERIOD_MS } from '../../lib/map/radar';

/** Élément DOM minimal (classList, style, premier enfant) pour tester le marqueur web sans navigateur. */
function fakeDriverElement() {
  const classes = new Set(['yaar-mk', 'yaar-driver', 'no-heading']);
  const ring = { style: { transform: '' } };
  const el = {
    firstElementChild: ring,
    classList: {
      toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)),
      contains: (c: string) => classes.has(c),
    },
  };
  return { el: el as unknown as HTMLElement, ring, classes };
}

describe('marqueur du livreur : pictogramme de profil, toujours droit', () => {
  it.each(['MOTO', 'BIKE', 'CAR'] as const)('%s : deux roues, dessin blanc sur le disque vert, jamais tourné en bloc', (v) => {
    const art = vehicleSideGlyph(v);
    expect(art.filter((s) => s.kind === 'circle')).toHaveLength(2);
    const svg = artToSvg(art, 26);
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 24 24"/);
    expect(svg.match(/<circle /g)).toHaveLength(2);
    expect(svg).toContain('#FFFFFF');
    // Seules des pièces (cadre, fourche) peuvent être inclinées, jamais le véhicule entier.
    expect(svg.slice(0, svg.indexOf('>'))).not.toMatch(/transform/);
    // Tout tient dans la boîte 24 × 24.
    for (const s of art) {
      if (s.kind === 'circle') {
        expect(s.cx - s.r).toBeGreaterThanOrEqual(0);
        expect(s.cx + s.r).toBeLessThanOrEqual(24);
        expect(s.cy + s.r).toBeLessThanOrEqual(24);
      }
    }
  });

  it('les trois véhicules se distinguent', () => {
    const svgs = (['MOTO', 'BIKE', 'CAR'] as const).map((v) => artToSvg(vehicleSideGlyph(v), 26));
    expect(new Set(svgs).size).toBe(3);
  });
});

describe('chevron de cap (web) : seul élément qui tourne', () => {
  it('cap connu : chevron affiché et tourné ; inconnu ou livreur arrêté : masqué', () => {
    const { el, ring, classes } = fakeDriverElement();
    setDriverHeading(el, 38.26);
    expect(classes.has('no-heading')).toBe(false);
    expect(ring.style.transform).toBe('rotate(38.3deg)');
    setDriverHeading(el, null);
    expect(classes.has('no-heading')).toBe(true);
    // Le pictogramme (élément racine) n'est jamais tourné par setDriverHeading.
    expect((el as unknown as { style?: unknown }).style).toBeUndefined();
  });
});

describe('radar « recherche d’un livreur » (natif)', () => {
  it('deux anneaux décalés qui grandissent et s’estompent, sans dépasser la période', () => {
    const [a0, b0] = radarRings(0);
    const [a1] = radarRings(RADAR_PERIOD_MS / 4);
    expect(a1!.radiusM).toBeGreaterThan(a0!.radiusM);
    expect(a1!.alpha).toBeLessThan(a0!.alpha);
    expect(b0!.radiusM).toBeGreaterThan(a0!.radiusM);
    expect(radarRings(RADAR_PERIOD_MS)).toEqual(radarRings(0));
  });
});
