import { cashRatio, onlineStatus } from './driverStatus';

describe('indicateur légal du livreur', () => {
  it('libellés : en ligne (actif, activation, pause) et hors ligne', () => {
    expect(onlineStatus({ online: true, gpsActive: true, gpsPaused: false })).toEqual({ label: 'En ligne : suivi GPS actif', tone: 'on' });
    expect(onlineStatus({ online: true, gpsActive: false, gpsPaused: false }).label).toBe('En ligne : activation du GPS…');
    expect(onlineStatus({ online: true, gpsActive: true, gpsPaused: true }).label).toBe('En ligne : suivi GPS en pause (Yaar en arrière-plan)');
    expect(onlineStatus({ online: false, gpsActive: true, gpsPaused: false })).toEqual({ label: 'Hors ligne : position non suivie', tone: 'off' });
  });

  it('part du plafond d’espèces, bornée entre 0 et 1', () => {
    expect(cashRatio(18500, 50000)).toBeCloseTo(0.37);
    expect(cashRatio(60000, 50000)).toBe(1);
    expect(cashRatio(1000, 0)).toBe(0);
  });
});
