import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { ApiError, errorMessage } from '../api/client';

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  /** Statut HTTP de la dernière erreur (404 : la ressource n'existe pas, inutile de réessayer) ; null sans erreur HTTP. */
  errorStatus: number | null;
  loading: boolean;
  /**
   * Recharge ; `silent` garde les données affichées pendant le chargement.
   * La promesse renvoyée indique si le chargement a réussi (utile au polling, qui ralentit sur erreur).
   */
  reload: (silent?: boolean) => Promise<boolean>;
  setData: Dispatch<SetStateAction<T | null>>;
}

/**
 * Charge des données asynchrones et recharge quand `deps` change.
 * Les réponses arrivées dans le désordre sont ignorées.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback((silent = false): Promise<boolean> => {
    const id = ++seq.current;
    if (!silent) setLoading(true);
    return fnRef
      .current()
      .then((value) => {
        if (id !== seq.current) return true;
        setData(value);
        setError(null);
        setErrorStatus(null);
        return true;
      })
      .catch((err: unknown) => {
        if (id !== seq.current) return false;
        setError(errorMessage(err));
        setErrorStatus(err instanceof ApiError && err.status > 0 ? err.status : null);
        return false;
      })
      .finally(() => {
        if (id === seq.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    void run();
    return () => {
      seq.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, errorStatus, loading, reload: run, setData };
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

/**
 * Horloge à la minute (date et heure de la barre du haut) : mise à jour juste après chaque changement de minute, jamais
 * en retard de plus d'une seconde (une horloge rafraîchie toutes les 30 s pouvait l'être de 30 s).
 */
export function useMinuteNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(Date.now());
        schedule();
      }, 60_000 - (Date.now() % 60_000) + 50);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
  return now;
}
