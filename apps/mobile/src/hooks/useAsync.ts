import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../lib/api';

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  /** Erreur brute (pour tester le code API, ex. NOT_FOUND). */
  rawError: unknown;
  loading: boolean;
  /** Recharge sans vider les données affichées. */
  reload: () => Promise<void>;
  setData: (d: T | null) => void;
}

/**
 * Charge une donnée asynchrone au montage et quand `deps` change.
 * Ignore les réponses arrivées après un démontage ou un nouvel appel.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[], enabled = true): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rawError, setRawError] = useState<unknown>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const callId = useRef(0);
  const mounted = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const id = ++callId.current;
    setLoading(true);
    try {
      const result = await fnRef.current();
      if (mounted.current && id === callId.current) {
        setData(result);
        setError(null);
        setRawError(null);
      }
    } catch (e) {
      if (mounted.current && id === callId.current) {
        setError(errorMessage(e));
        setRawError(e);
      }
    } finally {
      if (mounted.current && id === callId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, reload, ...deps]);

  return { data, error, rawError, loading, reload, setData };
}
