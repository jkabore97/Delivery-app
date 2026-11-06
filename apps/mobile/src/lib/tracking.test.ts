import {
  PING_INTERVAL_IDLE_MS,
  PING_INTERVAL_ON_DELIVERY_MS,
  shouldSendPing,
  toLocationPing,
} from './tracking';

describe('shouldSendPing', () => {
  const base = { online: true, onDelivery: false, lastSentAt: 1_000, movedMeters: 0 };

  it('n’envoie JAMAIS de position hors ligne', () => {
    expect(shouldSendPing({ ...base, online: false, lastSentAt: null }, 10_000_000)).toBe(false);
  });

  it('envoie la première position dès la mise en ligne', () => {
    expect(shouldSendPing({ ...base, lastSentAt: null }, 0)).toBe(true);
  });

  it('respecte la cadence en course et au repos', () => {
    expect(shouldSendPing({ ...base, onDelivery: true }, 1_000 + PING_INTERVAL_ON_DELIVERY_MS - 1)).toBe(false);
    expect(shouldSendPing({ ...base, onDelivery: true }, 1_000 + PING_INTERVAL_ON_DELIVERY_MS)).toBe(true);
    expect(shouldSendPing(base, 1_000 + PING_INTERVAL_ON_DELIVERY_MS)).toBe(false);
    expect(shouldSendPing(base, 1_000 + PING_INTERVAL_IDLE_MS)).toBe(true);
  });

  it('anticipe au repos si le livreur a beaucoup bougé', () => {
    expect(shouldSendPing({ ...base, movedMeters: 500 }, 1_000 + PING_INTERVAL_ON_DELIVERY_MS)).toBe(true);
    expect(shouldSendPing({ ...base, movedMeters: 500 }, 1_000 + 2_000)).toBe(false);
  });
});

describe('toLocationPing', () => {
  it('ne garde que les valeurs valides', () => {
    expect(toLocationPing({ latitude: 12.36, longitude: -1.52, accuracy: 12, heading: -1, speed: null })).toEqual({
      lat: 12.36,
      lng: -1.52,
      accuracy: 12,
    });
    expect(toLocationPing({ latitude: 1, longitude: 2, accuracy: null, heading: 90, speed: 6.5 })).toEqual({
      lat: 1,
      lng: 2,
      heading: 90,
      speed: 6.5,
    });
  });
});
