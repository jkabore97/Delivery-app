import { secondsLeft } from '../lib/countdown';
import { useNow } from './useNow';

/** Secondes restantes avant `expiresAt` (0 quand expiré ou absent). */
export function useCountdown(expiresAt: string | null | undefined, clock?: () => number): number {
  const now = useNow(250, !!expiresAt, clock);
  return expiresAt ? secondsLeft(expiresAt, now) : 0;
}
