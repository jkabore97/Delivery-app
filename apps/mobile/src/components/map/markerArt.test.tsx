import { render } from '@testing-library/react-native';
import { artToSvg, avatarInitials, vehicleSideGlyph } from './markerArt';
import { avatarPinColor, avatarPinElement, setDriverHeading } from './markerDom.web';
import { AVATAR_VIEW, AvatarPinView } from './MarkerViews';
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

describe('épingle « avatar » : initiales', () => {
  it('deux premiers mots significatifs, particules ignorées après le premier mot', () => {
    expect(avatarInitials('Awa Kaboré')).toBe('AK');
    expect(avatarInitials('Pharmacie du Centre')).toBe('PC');
    expect(avatarInitials('Maquis Le Verdoyant')).toBe('MV');
    expect(avatarInitials('Le Verdoyant')).toBe('LV');
    expect(avatarInitials('Boutique Faso Mode')).toBe('BF');
    expect(avatarInitials('Issouf S.')).toBe('IS');
  });

  it('élision, accents, chiffres, casse', () => {
    expect(avatarInitials('L’Escale')).toBe('E');
    expect(avatarInitials('élodie ouédraogo')).toBe('ÉO');
    expect(avatarInitials('Pharmacie 2000')).toBe('P2');
    expect(avatarInitials('awa')).toBe('A');
  });

  it('sans nom exploitable : null (marqueur habituel)', () => {
    expect(avatarInitials(null)).toBeNull();
    expect(avatarInitials('')).toBeNull();
    expect(avatarInitials('  ·  ')).toBeNull();
  });
});

/** Document minimal (createElement, head) pour construire les marqueurs web sans navigateur. */
function withFakeDocument<T>(run: () => T): T {
  type FakeEl = {
    tagName: string;
    className: string;
    title: string;
    textContent: string;
    innerHTML: string;
    style: Record<string, string>;
    dataset: Record<string, string>;
    attrs: Record<string, string>;
    children: FakeEl[];
    setAttribute(k: string, v: string): void;
    appendChild(c: FakeEl): FakeEl;
  };
  const make = (tagName: string): FakeEl => ({
    tagName,
    className: '',
    title: '',
    textContent: '',
    innerHTML: '',
    style: {},
    dataset: {},
    attrs: {},
    children: [],
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    appendChild(c) {
      this.children.push(c);
      return c;
    },
  });
  const g = globalThis as { document?: unknown };
  const previous = g.document;
  g.document = { createElement: make, head: make('head') };
  try {
    return run();
  } finally {
    g.document = previous;
  }
}

describe('épingle « avatar » (web)', () => {
  it('initiales en texte (jamais en HTML), couleur du type, type pour les tests de bout en bout', () => {
    const el = withFakeDocument(() => avatarPinElement('dropoff', '<b>AK</b>', true, 'Awa Kaboré')) as unknown as {
      className: string;
      dataset: Record<string, string>;
      innerHTML: string;
      title: string;
      children: Array<{ className: string; textContent: string; innerHTML: string; style: Record<string, string> }>;
    };
    expect(el.className).toContain('yaar-avatar');
    expect(el.dataset.kind).toBe('dropoff');
    expect(el.dataset.avatar).toBe('1');
    expect(el.title).toBe('Awa Kaboré');
    const [pin, text] = el.children;
    expect(pin?.style.background).toBe(avatarPinColor('dropoff'));
    expect(text?.textContent).toBe('<b>');
    expect(text?.innerHTML).toBe('');
    expect(el.innerHTML).toContain('yaar-pulse');
    expect(avatarPinColor('pickup')).not.toBe(avatarPinColor('dropoff'));
  });
});

describe('épingle « avatar » (natif)', () => {
  it('pointe au bas de la vue, initiales affichées', async () => {
    expect(AVATAR_VIEW.tipY).toBeCloseTo(4 + 20 + 20 * Math.SQRT2, 1);
    expect(AVATAR_VIEW.tipY).toBeLessThan(AVATAR_VIEW.height);
    const r = await render(<AvatarPinView initials="PC" color="#F28C1B" />);
    expect(r.getByText('PC')).toBeTruthy();
  });
});
