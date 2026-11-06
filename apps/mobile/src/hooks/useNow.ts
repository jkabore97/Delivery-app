import { useEffect, useState } from 'react';

/** Heure courante rafraîchie toutes les `intervalMs` (pour les comptes à rebours). */
export function useNow(intervalMs = 1000, active = true, clock: () => number = Date.now): number {
  const [now, setNow] = useState(clock);
  useEffect(() => {
    if (!active) return;
    setNow(clock());
    const id = setInterval(() => setNow(clock()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, active, clock]);
  return now;
}
