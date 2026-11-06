import { describe, expect, it } from 'vitest';
import {
  assertTransition,
  canTransition,
  initialStatus,
  InvalidTransitionError,
  isTerminal,
  ORDER_STATUSES,
  ORDER_TYPES,
  nextStatuses,
} from '../src';

describe('machine à états des commandes', () => {
  it('suit le parcours complet FOOD', () => {
    const path = ['PENDING', 'ACCEPTED', 'READY', 'SEARCHING_DRIVER', 'ASSIGNED', 'PICKED_UP', 'DELIVERED'] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition('FOOD', path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it('suit le parcours complet PARCEL (sans vendeur)', () => {
    expect(initialStatus('PARCEL')).toBe('SEARCHING_DRIVER');
    expect(initialStatus('FOOD')).toBe('PENDING');
    expect(canTransition('PARCEL', 'PENDING', 'SEARCHING_DRIVER')).toBe(true);
    expect(canTransition('PARCEL', 'PENDING', 'ACCEPTED')).toBe(false);
    expect(canTransition('PARCEL', 'SEARCHING_DRIVER', 'ASSIGNED')).toBe(true);
  });

  it('interdit les raccourcis', () => {
    expect(canTransition('FOOD', 'PENDING', 'SEARCHING_DRIVER')).toBe(false);
    expect(canTransition('FOOD', 'ACCEPTED', 'ASSIGNED')).toBe(false);
    expect(canTransition('FOOD', 'ASSIGNED', 'DELIVERED')).toBe(false);
    // Réservé à la console (le contrôle d'autorisation est fait par l'API).
    expect(canTransition('FOOD', 'PICKED_UP', 'CANCELLED')).toBe(true);
    expect(canTransition('FOOD', 'PICKED_UP', 'ASSIGNED')).toBe(false);
  });

  it('autorise l’annulation dans les états précoces uniquement', () => {
    for (const s of ['PENDING', 'ACCEPTED', 'READY', 'SEARCHING_DRIVER', 'ASSIGNED'] as const) {
      expect(canTransition('FOOD', s, 'CANCELLED')).toBe(true);
    }
    expect(canTransition('FOOD', 'DELIVERED', 'CANCELLED')).toBe(false);
  });

  it('permet de remettre une commande affectée en recherche (réaffectation)', () => {
    expect(canTransition('FOOD', 'ASSIGNED', 'SEARCHING_DRIVER')).toBe(true);
  });

  it('les états terminaux n’ont pas de successeur', () => {
    for (const t of ORDER_TYPES) {
      for (const s of ORDER_STATUSES) {
        if (isTerminal(s)) expect(nextStatuses(t, s)).toHaveLength(0);
      }
    }
  });

  it('assertTransition lève une InvalidTransitionError', () => {
    expect(() => assertTransition('FOOD', 'DELIVERED', 'PENDING')).toThrow(InvalidTransitionError);
    expect(() => assertTransition('FOOD', 'PENDING', 'ACCEPTED')).not.toThrow();
  });
});
