import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { errorMessage } from '../api/client';

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Recharge ; `silent` garde les données affichées pendant le chargement. */
  reload: (silent?: boolean) => void;
  setData: Dispatch<SetStateAction<T | null>>;
}

/**
 * Charge des données asynchrones et recharge quand `deps` change.
 * Les réponses arrivées dans le désordre sont ignorées.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback((silent = false) => {
    const id = ++seq.current;
    if (!silent) setLoading(true);
    fnRef
      .current()
      .then((value) => {
        if (id !== seq.current) return;
        setData(value);
        setError(null);
      })
      .catch((err: unknown) => {
        if (id !== seq.current) return;
        setError(errorMessage(err));
      })
      .finally(() => {
        if (id === seq.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    run();
    return () => {
      seq.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload: run, setData };
}

/** Appelle `fn` au plus une fois toutes les `delayMs` (regroupe les rafales d'événements). */
export function useDebouncedCallback(fn: () => void, delayMs: number): () => void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      fnRef.current();
    }, delayMs);
  }, [delayMs]);
}

/** Horloge locale rafraîchie toutes les `intervalMs` (compteurs d'attente). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
