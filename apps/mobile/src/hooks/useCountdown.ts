import { useEffect, useState } from 'react';
import { secondsLeft } from '../lib/countdown';
import { useNow } from './useNow';

/** Secondes restantes avant `expiresAt` (0 quand expiré ou absent). */
export function useCountdown(expiresAt: string | null | undefined, clock?: () => number): number {
  const now = useNow(250, !!expiresAt, clock);
  return expiresAt ? secondsLeft(expiresAt, now) : 0;
}

/**
 * true une fois `expiresAt` passé (date invalide : true). Un seul rendu, à l'échéance (minuterie) : l'écran qui
 * l'utilise n'est pas redessiné à chaque seconde (le compte à rebours visible a sa propre horloge).
 */
export function useExpired(expiresAt: string): boolean {
  const [expired, setExpired] = useState(() => !(Date.parse(expiresAt) > Date.now()));
  useEffect(() => {
    const ms = Date.parse(expiresAt) - Date.now();
    if (!(ms > 0)) {
      setExpired(true);
      return;
    }
    setExpired(false);
    const t = setTimeout(() => setExpired(true), ms + 20);
    return () => clearTimeout(t);
  }, [expiresAt]);
  return expired;
}
