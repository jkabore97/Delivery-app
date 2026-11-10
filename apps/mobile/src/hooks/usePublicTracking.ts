import { useEffect, useRef, useState } from 'react';
import { isTerminal, type TrackingDto } from '@yaar/shared';
import { ApiError, errorMessage, NETWORK_ERROR_CODE } from '../lib/api';
import { appStateVisibility, PollScheduler, type VisibilitySource } from '../lib/pollScheduler';
import { publicApi } from '../lib/publicApi';

export type PublicTrackingState =
  | { status: 'loading' }
  | { status: 'ok'; data: TrackingDto; /** Dernier rafraîchissement en échec (réseau) : données affichées anciennes. */ stale: boolean }
  | { status: 'notFound' }
  | {
      status: 'error';
      message: string;
      /** Trop de requêtes (429) depuis cette connexion. */
      rateLimited?: boolean;
      /** Réseau injoignable (pas de réponse du serveur), à distinguer d'une erreur du serveur. */
      network?: boolean;
    };

export interface PublicTrackingOptions {
  /**
   * Intervalle des rafraîchissements (ms), fixe ou selon les dernières données reçues (étape de la livraison) :
   * relu après chaque rafraîchissement, sans requête supplémentaire quand il change.
   */
  intervalMs: number | ((data: TrackingDto | null) => number);
  visibility?: VisibilitySource;
  fetcher?: (token: string) => Promise<TrackingDto>;
  /** Change à chaque « Réessayer » : relance le suivi tout de suite (sans attendre l'essai automatique, 30 s au plus). */
  retryKey?: number;
}

/**
 * Suivi public d'une livraison (GET /track/:token, sans compte), rafraîchi toutes les `intervalMs` tant que
 * la page est visible (pause quand l'onglet est masqué, rafraîchissement immédiat au retour, ralentissement
 * en cas d'erreur réseau ou de limite de requêtes). Arrêté une fois la livraison terminée ou le lien expiré (404).
 */
export function usePublicTracking(token: string | undefined, opts: PublicTrackingOptions): PublicTrackingState {
  const [state, setState] = useState<PublicTrackingState>({ status: 'loading' });
  const fetcherRef = useRef(opts.fetcher ?? publicApi.trackDelivery);
  fetcherRef.current = opts.fetcher ?? publicApi.trackDelivery;
  const visibilityRef = useRef(opts.visibility);
  const intervalRef = useRef(opts.intervalMs);
  intervalRef.current = opts.intervalMs;
  const lastData = useRef<TrackingDto | null>(null);
  // Intervalle fixe : un changement relance le suivi ; intervalle calculé : relu après chaque rafraîchissement.
  const fixedKey = typeof opts.intervalMs === 'number' ? opts.intervalMs : 'dynamic';
  const nextDelay = () => {
    const i = intervalRef.current;
    return Math.max(1000, typeof i === 'function' ? i(lastData.current) : i);
  };

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
        lastData.current = data;
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
        const rateLimited = e instanceof ApiError && e.status === 429;
        const network = e instanceof ApiError && e.code === NETWORK_ERROR_CODE;
        setState((prev) =>
          prev.status === 'ok'
            ? { ...prev, stale: true }
            : { status: 'error', message: errorMessage(e), ...(rateLimited ? { rateLimited: true } : {}), ...(network ? { network: true } : {}) },
        );
        return false; // intervalle doublé (30 s au plus)
      }
    };
    remove = scheduler.add(load, nextDelay, { immediate: true });
    return () => {
      cancelled = true;
      stop();
      scheduler.dispose();
    };
    // nextDelay lit des refs : seuls le jeton, un intervalle fixe et « Réessayer » relancent le suivi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, fixedKey, opts.retryKey]);

  return state;
}
