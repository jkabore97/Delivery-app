import { distanceM } from '@yaar/shared';
import {
  chevronVisible,
  DriverMotion,
  fixTime,
  GLIDE_MAX_MS,
  GLIDE_MIN_MS,
  glideDurationMs,
  screenHeading,
  STALE_MS,
} from './motion';

const A = { lat: 12.3627, lng: -1.521 };
/** ~111 m au nord de A. */
const B = { lat: 12.3637, lng: -1.521 };
const C = { lat: 12.3647, lng: -1.521 };
const T = Date.parse('2026-11-08T14:10:00.000Z');

describe('durée du glissement : écart réel entre deux relevés GPS', () => {
  it('écart entre les horodatages, borné à 2–12 s ; sans horodatage : durée de repli', () => {
    expect(glideDurationMs(T, T + 8000, 4000)).toBe(8000);
    expect(glideDurationMs(T, T + 500, 4000)).toBe(GLIDE_MIN_MS);
    expect(glideDurationMs(T, T + 60_000, 4000)).toBe(GLIDE_MAX_MS);
    expect(glideDurationMs(null, T, 4000)).toBe(4000);
    expect(glideDurationMs(T, null, 1200)).toBe(1200);
    // Relevés dans le désordre ou identiques : repli.
    expect(glideDurationMs(T + 5000, T, 4000)).toBe(4000);
    expect(GLIDE_MIN_MS).toBe(2000);
    expect(GLIDE_MAX_MS).toBe(12_000);
  });

  it('horodatage ISO de l’API ou nombre du téléphone', () => {
    expect(fixTime('2026-11-08T14:10:00.000Z')).toBe(T);
    expect(fixTime(T)).toBe(T);
    expect(fixTime('pas une date')).toBeNull();
    expect(fixTime(null)).toBeNull();
  });
});

describe('DriverMotion : le livreur roule en continu entre les relevés', () => {
  it('nouveau relevé 8 s après le précédent : glissement de 8 s, à vitesse constante, sans arrêt', () => {
    const m = new DriverMotion();
    expect(m.update({ ...A, at: T }, 0, 4000)).toBe('placed');
    // Le rafraîchissement suivant relit le même relevé : rien ne change.
    expect(m.update({ ...A, at: T }, 4000, 4000)).toBe('none');
    expect(m.update({ ...B, at: T + 8000 }, 8000, 4000)).toBe('glide');
    expect(m.glideMs).toBe(8000);
    // À mi-parcours (4 s), encore en mouvement : le marqueur est au milieu, pas déjà arrivé (ancien comportement : 4 s).
    const half = m.sample(12_000);
    expect(half.animating).toBe(true);
    expect(distanceM(half.pos, A)).toBeGreaterThan(50);
    expect(distanceM(half.pos, B)).toBeGreaterThan(50);
    // Relevé suivant pile à la fin du glissement : on repart de la position affichée, sans à-coup.
    const end = m.sample(16_000);
    expect(distanceM(end.pos, B)).toBeLessThan(0.5);
    expect(m.update({ ...C, at: T + 16_000 }, 16_000, 4000)).toBe('glide');
    expect(m.glideMs).toBe(8000);
    expect(distanceM(m.sample(16_000).pos, B)).toBeLessThan(0.5);
  });

  it('relevé en avance (glissement pas fini) : repart de la position affichée, vers la nouvelle cible', () => {
    const m = new DriverMotion();
    m.update({ ...A, at: T }, 0, 4000);
    m.update({ ...B, at: T + 8000 }, 0, 4000);
    const shown = m.sample(4000).pos; // à mi-chemin
    m.update({ ...C, at: T + 12_000 }, 4000, 4000);
    expect(distanceM(m.sample(4000).pos, shown)).toBeLessThan(0.5);
    expect(m.glideMs).toBe(4000);
    expect(distanceM(m.sample(8000).pos, C)).toBeLessThan(0.5);
  });

  it('saut de plus de 2,5 km ou durée nulle : placement immédiat', () => {
    const m = new DriverMotion();
    m.update({ ...A, at: T }, 0, 4000);
    expect(m.update({ lat: 12.5, lng: -1.521, at: T + 8000 }, 1000, 4000)).toBe('jump');
    expect(m.sample(1000).pos.lat).toBe(12.5);
    const local = new DriverMotion();
    local.update(A, 0, 0);
    expect(local.update(B, 10, 0)).toBe('jump');
  });

  it('position sans horodatage (GPS du livreur) : durée de repli, et rien si elle ne bouge pas', () => {
    const m = new DriverMotion();
    m.update(A, 0, 1200);
    expect(m.update({ lat: A.lat + 1e-7, lng: A.lng }, 100, 1200)).toBe('none');
    expect(m.update(B, 200, 1200)).toBe('glide');
    expect(m.glideMs).toBe(1200);
  });
});

describe('chevron de cap : visible en mouvement avec un cap connu', () => {
  it('cap de l’API ou déduit du déplacement ; masqué à l’arrêt ou sans cap', () => {
    const m = new DriverMotion();
    m.update({ ...A, at: T }, 0, 4000);
    // Premier relevé sans cap : pas de chevron.
    expect(m.chevronVisible(0)).toBe(false);
    m.update({ ...B, at: T + 8000 }, 8000, 4000);
    expect(m.heading).toBeCloseTo(0, 0); // vers le nord
    expect(m.chevronVisible(8000)).toBe(true);
    // Relevé suivant au même endroit : livreur arrêté, chevron masqué (le cap est gardé pour la reprise).
    m.update({ ...B, at: T + 16_000 }, 16_000, 4000);
    expect(m.moving).toBe(false);
    expect(m.chevronVisible(16_000)).toBe(false);
    // Reprise vers l'est avec le cap du téléphone.
    m.update({ lat: B.lat, lng: B.lng + 0.001, heading: 92, at: T + 24_000 }, 24_000, 4000);
    expect(m.heading).toBe(92);
    expect(m.chevronVisible(24_000)).toBe(true);
    // Plus aucun relevé depuis 30 s : chevron masqué.
    expect(m.chevronVisible(24_000 + STALE_MS)).toBe(false);
  });

  it('premier relevé avec un cap du téléphone (connu seulement en mouvement) : chevron visible', () => {
    const m = new DriverMotion();
    m.update({ ...A, heading: 170, at: T }, 0, 4000);
    expect(m.chevronVisible(0)).toBe(true);
  });

  it('règle pure et rotation à l’écran compensée par l’orientation de la carte', () => {
    expect(chevronVisible({ heading: 45, moving: true })).toBe(true);
    expect(chevronVisible({ heading: null, moving: true })).toBe(false);
    expect(chevronVisible({ heading: 45, moving: false })).toBe(false);
    expect(chevronVisible({ heading: 45, moving: true, staleSince: 0 }, STALE_MS + 1)).toBe(false);
    expect(screenHeading(90, 0)).toBe(90);
    expect(screenHeading(90, 30)).toBe(60);
    expect(screenHeading(10, 350)).toBe(20);
  });

  it('le cap tourne par le plus court chemin (350° → 10° passe par 0°)', () => {
    const m = new DriverMotion();
    m.update({ ...A, heading: 350, at: T }, 0, 4000);
    m.update({ ...B, heading: 10, at: T + 8000 }, 0, 4000);
    const h = m.sample(350).heading!; // à mi-rotation (700 ms)
    expect(h > 355 || h < 5).toBe(true);
  });
});
