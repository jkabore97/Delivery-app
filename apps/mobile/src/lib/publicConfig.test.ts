import { DEFAULT_TRACKING_POLL_MS, parsePublicConfig, POLL_MS, trackingPollMs } from './publicConfig';

describe('rafraîchissement de la page publique de suivi', () => {
  const config = parsePublicConfig({ realtime: 'poll', pollIntervalMs: 4000, demoMode: true, otpChannel: 'console' });

  it('trackingPollIntervalMs de /config lu quand il est valide', () => {
    expect(parsePublicConfig({ pollIntervalMs: 4000, trackingPollIntervalMs: 6000 }).trackingPollIntervalMs).toBe(6000);
    expect(parsePublicConfig({ pollIntervalMs: 4000, trackingPollIntervalMs: 50 }).trackingPollIntervalMs).toBeUndefined();
    expect(parsePublicConfig({ pollIntervalMs: 4000 })).not.toHaveProperty('trackingPollIntervalMs');
  });

  it('8 s par défaut pendant la course, le double pendant la recherche, rien une fois terminée', () => {
    expect(DEFAULT_TRACKING_POLL_MS).toBe(8000);
    expect(trackingPollMs(config, 'ASSIGNED')).toBe(8000);
    expect(trackingPollMs(config, 'PICKED_UP')).toBe(8000);
    expect(trackingPollMs(config, 'SEARCHING_DRIVER')).toBe(16_000);
    expect(trackingPollMs(config, 'PENDING')).toBe(16_000);
    expect(trackingPollMs(config, 'DELIVERED')).toBe(0);
    expect(trackingPollMs(config, 'CANCELLED')).toBe(0);
    // Étape inconnue (premier chargement) : rythme de la course.
    expect(trackingPollMs(config, null)).toBe(8000);
    expect(trackingPollMs(null, 'ASSIGNED')).toBe(8000);
  });

  it('valeur de /config prioritaire ; jamais plus vite que pollIntervalMs sans elle', () => {
    expect(trackingPollMs({ pollIntervalMs: 4000, trackingPollIntervalMs: 6000 }, 'PICKED_UP')).toBe(6000);
    expect(trackingPollMs({ pollIntervalMs: 4000, trackingPollIntervalMs: 6000 }, 'SEARCHING_DRIVER')).toBe(12_000);
    expect(trackingPollMs({ pollIntervalMs: 15_000 }, 'PICKED_UP')).toBe(15_000);
  });

  it('carte d’ensemble de l’entreprise : toutes les 10 s (docs/API.md)', () => {
    expect(POLL_MS.businessDeliveries).toBe(10_000);
  });
});
