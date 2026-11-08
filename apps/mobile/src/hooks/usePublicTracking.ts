import { useEffect, useRef, useState } from 'react';
import { isTerminal, type TrackingDto } from '@yaar/shared';
import { ApiError, errorMessage } from '../lib/api';
import { appStateVisibility, PollScheduler, type VisibilitySource } from '../lib/pollScheduler';
import { publicApi } from '../lib/publicApi';

export type PublicTrackingState =
  | { status: 'loading' }
  | { status: 'ok'; data: TrackingDto; /** Dernier rafraîchissement en échec (réseau) : données affichées anciennes. */ stale: boolean }
  | { status: 'notFound' }
  | { status: 'error'; message: string };

export interface PublicTrackingOptions {
  /** Intervalle de GET /config (pollIntervalMs). */
  intervalMs: number;
  visibility?: VisibilitySource;
  fetcher?: (token: string) => Promise<TrackingDto>;
}

/**
 * Suivi public d'une livraison (GET /track/:token, sans compte), rafraîchi toutes les `intervalMs` tant que
 * la page est visible (pause quand l'onglet est masqué, rafraîchissement immédiat au retour, ralentissement
 * en cas d'erreur réseau). Arrêté une fois la livraison terminée ou le lien expiré (404).
 */
export function usePublicTracking(token: string | undefined, opts: PublicTrackingOptions): PublicTrackingState {
  const [state, setState] = useState<PublicTrackingState>({ status: 'loading' });
  const fetcherRef = useRef(opts.fetcher ?? publicApi.trackDelivery);
  fetcherRef.current = opts.fetcher ?? publicApi.trackDelivery;
  const visibilityRef = useRef(opts.visibility);
  const intervalMs = Math.max(1000, opts.intervalMs);

  useEffect(() => {
    if (!token) {
      setState({ status: 'notFound' });
      return;
    }
    let cancelled = false;
    let remove: (() => void) | null = null;
    const scheduler = new PollScheduler(visibilityRef.current ?? appStateVisibility());
    const stop = () => {
      remove?.();
      remove = null;
    };
    const load = async (): Promise<boolean> => {
      try {
        const data = await fetcherRef.current(token);
        if (cancelled) return true;
        setState({ status: 'ok', data, stale: false });
        if (isTerminal(data.status)) stop();
        return true;
      } catch (e) {
        if (cancelled) return true;
        if (e instanceof ApiError && (e.status === 404 || e.code === 'NOT_FOUND')) {
          setState({ status: 'notFound' });
          stop();
          return true;
        }
        setState((prev) => (prev.status === 'ok' ? { ...prev, stale: true } : { status: 'error', message: errorMessage(e) }));
        return false; // intervalle doublé (30 s au plus)
      }
    };
    remove = scheduler.add(load, intervalMs);
    void load();
    return () => {
      cancelled = true;
      stop();
      scheduler.dispose();
    };
  }, [token, intervalMs]);

  return state;
}
