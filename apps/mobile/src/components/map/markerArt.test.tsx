import { render } from '@testing-library/react-native';
import { artToSvg, avatarInitials, HOUSE_GLYPH, STORE_GLYPH, vehicleSideGlyph } from './markerArt';
import { avatarPinColor, avatarPinElement, driverElement, dropoffElement, MARKER_Z, PIN_BOX, pickupElement, setDriverHeading } from './markerDom.web';
import { AVATAR_VIEW, AvatarPinView, DriverMarkerView, PickupMarkerView, PIN_VIEW } from './MarkerViews';
import { resolveLines } from '../../lib/map/lines';
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

describe('marqueur du livreur : pictogramme de profil au trait, toujours droit', () => {
  it.each(['MOTO', 'BIKE', 'CAR'] as const)('%s : deux roues au trait, blanc par défaut (pastilles pleines), jamais tourné en bloc', (v) => {
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

  it.each(['MOTO', 'BIKE', 'CAR'] as const)('%s : au trait (anneaux sans remplissage, traits ronds) dans la couleur demandée', (v) => {
    const art = vehicleSideGlyph(v, '#2448FF');
    for (const s of art) {
      if (s.kind === 'circle') {
        expect(s.stroke).toBe('#2448FF');
        expect(s.fill).toBeUndefined();
      } else {
        expect(s.fill).toBe('#2448FF');
        // Trait à extrémités rondes : rayon des coins = demi-épaisseur.
        expect(s.r).toBeCloseTo(s.h / 2, 5);
      }
    }
    expect(artToSvg(art, 22)).not.toContain('#FFFFFF');
  });

  it('boutique et maison au trait, blanches (sur le carré encre, sur la goutte cobalt), dans la boîte 24 × 24', () => {
    for (const glyph of [STORE_GLYPH, HOUSE_GLYPH]) {
      for (const s of glyph) {
        if (s.kind === 'circle') continue;
        expect(s.fill).toBe('#FFFFFF');
        expect(s.x + s.w / 2).toBeGreaterThan(0);
        expect(s.x + s.w / 2).toBeLessThan(24);
        expect(s.y + s.h / 2).toBeLessThan(24);
      }
    }
  });
});

describe('encoche de cap (web) : seul élément qui tourne', () => {
  it('cap connu : encoche affichée et tournée ; inconnu ou livreur arrêté : masquée', () => {
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

describe('marqueurs web Cobalt', () => {
  type FakeNode = {
    className: string;
    dataset: Record<string, string>;
    innerHTML: string;
    title: string;
    textContent: string;
    style: Record<string, string>;
    attrs: Record<string, string>;
    children: FakeNode[];
  };
  const build = <T,>(run: () => T) => withFakeDocument(run) as unknown as FakeNode;

  it('destinataire : goutte cobalt cerclée de blanc, initiales en texte (jamais en HTML), halo pulsé', () => {
    const el = build(() => avatarPinElement('dropoff', '<b>AK</b>', true, 'Awa Kaboré'));
    expect(el.className).toContain('yaar-dropoff');
    expect(el.dataset.kind).toBe('dropoff');
    expect(el.dataset.avatar).toBe('1');
    expect(el.title).toBe('Awa Kaboré');
    expect(el.innerHTML).toContain('yaar-pulse');
    expect(el.innerHTML).toContain(`fill="${avatarPinColor('dropoff')}" stroke="#fff" stroke-width="2.5"`);
    const [content] = el.children;
    expect(content?.className).toBe('yaar-pin-content');
    expect(content?.children[0]?.textContent).toBe('<b>');
    expect(content?.innerHTML).toBe('');
    expect(avatarPinColor('dropoff')).toBe('#2448FF');
  });

  it('destinataire sans initiales : goutte à maison ; sans livraison en cours : pas de halo', () => {
    const el = build(() => dropoffElement(false, 'Vous'));
    expect(el.dataset.avatar).toBeUndefined();
    expect(el.innerHTML).not.toContain('yaar-pulse');
    expect(el.children[0]?.innerHTML).toContain('<svg');
    expect(PIN_BOX.tipY).toBeGreaterThan(PIN_BOX.height - 2);
  });

  it('entreprise : carré encre à ses initiales (ou boutique), radar cobalt pendant la recherche', () => {
    const el = build(() => pickupElement(true, 'Le Verdoyant', 'LV'));
    expect(el.className).toContain('yaar-pickup');
    expect(el.dataset.kind).toBe('pickup');
    expect(el.dataset.avatar).toBe('1');
    expect(el.innerHTML.match(/class="yaar-radar( d\d)?"/g)).toHaveLength(3);
    expect(el.innerHTML).toContain('yaar-radar-glow');
    const [square] = el.children;
    expect(square?.className).toBe('yaar-pickup-box');
    expect(square?.children[0]?.textContent).toBe('LV');
    expect(avatarPinColor('pickup')).toBe('#0C1222');
    // Avec initiales via avatarPinElement : le même carré (plus d'épingle pour l'entreprise).
    expect(build(() => avatarPinElement('pickup', 'PC', false)).className).toContain('yaar-pickup');
    const plain = build(() => pickupElement(false));
    expect(plain.innerHTML).toBe('');
    expect(plain.children[0]?.innerHTML).toContain('<svg');
  });

  it('livreur : disque blanc, véhicule cobalt, encoche cobalt cachée tant que le cap est inconnu ; variante Sun', () => {
    const el = build(() => driverElement('BIKE', 'Issouf'));
    expect(el.className).toBe('yaar-mk yaar-driver no-heading');
    expect(el.dataset.vehicle).toBe('BIKE');
    expect(el.innerHTML).toContain('yaar-driver-heading');
    expect(el.innerHTML).toContain('fill="#2448FF" stroke="#fff"');
    const sun = build(() => driverElement('MOTO', 'Karim', 'sun'));
    expect(sun.className).toContain('is-sun');
    expect(sun.innerHTML).toContain('fill="#E0A400"');
    expect(sun.innerHTML).toContain('#0C1222');
    expect(MARKER_Z).toEqual({ pickup: 2, dropoff: 3, driver: 4 });
  });
});

describe('marqueurs natifs Cobalt', () => {
  it('goutte : pointe au bas de la vue, même géométrie avec ou sans initiales', async () => {
    expect(AVATAR_VIEW.tipY).toBeCloseTo(3 + 18 + 18 * Math.SQRT2, 5);
    expect(AVATAR_VIEW.tipY).toBeLessThan(AVATAR_VIEW.height);
    expect(PIN_VIEW).toBe(AVATAR_VIEW);
    const r = await render(<AvatarPinView initials="AK" pulse />);
    expect(r.getByText('AK')).toBeTruthy();
  });

  it('entreprise à ses initiales, livreur (blanc ou Sun)', async () => {
    const r = await render(<PickupMarkerView searching initials="LV" />);
    expect(r.getByText('LV')).toBeTruthy();
    const d = await render(<DriverMarkerView vehicleType="CAR" tone="sun" />);
    expect(d.toJSON()).toBeTruthy();
  });
});

describe('étape à venir (`pending`)', () => {
  it('dessinée telle quelle, sans rognage', () => {
    const pts = [
      { lat: 12.36, lng: -1.52 },
      { lat: 12.34, lng: -1.51 },
    ];
    expect(resolveLines([{ id: 'n', kind: 'pending', points: pts }], () => ({ lat: 0, lng: 0 }))).toEqual([{ id: 'n', kind: 'pending', points: pts }]);
  });
});
