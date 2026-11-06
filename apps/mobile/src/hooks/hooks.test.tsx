import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useAsync } from './useAsync';
import { useCountdown } from './useCountdown';

describe('useCountdown', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('décompte jusqu’à zéro avec une horloge injectée', async () => {
    let now = Date.parse('2026-11-06T09:43:00.000Z');
    const clock = () => now;
    const { result } = await renderHook(() => useCountdown('2026-11-06T09:43:30.000Z', clock));
    expect(result.current).toBe(30);
    now += 16_000;
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(result.current).toBe(14);
    now += 60_000;
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(result.current).toBe(0);
  });

  it('renvoie 0 sans échéance', async () => {
    const { result } = await renderHook(() => useCountdown(null));
    expect(result.current).toBe(0);
  });
});

describe('useAsync', () => {
  it('charge, expose l’erreur en français puis recharge', async () => {
    let fail = true;
    const fn = jest.fn(async () => {
      if (fail) throw new Error('Connexion impossible.');
      return 42;
    });
    const { result } = await renderHook(() => useAsync(fn, []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Connexion impossible.');
    expect(result.current.data).toBeNull();
    fail = false;
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.data).toBe(42);
    expect(result.current.error).toBeNull();
  });

  it('ne charge pas tant que désactivé', async () => {
    const fn = jest.fn(async () => 1);
    const { result } = await renderHook(() => useAsync(fn, [], false));
    expect(fn).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });
});
