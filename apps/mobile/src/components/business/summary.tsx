import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BusinessSummaryDto } from '@yaar/shared';
import { errorMessage } from '../../lib/api';
import { useApi } from '../../state/auth';
import { usePolling, useSocketEvent } from '../../state/socket';

/** Mode poll : rafraîchissement du résumé tant que l'écran qui l'affiche est au premier plan. */
export const SUMMARY_POLL_MS = 30_000;

interface SummaryContextValue {
  /** null : pas encore chargé (ou jamais, après une erreur). */
  summary: BusinessSummaryDto | null;
  error: string | null;
  /** Relit GET /business/summary (un seul appel à la fois) ; true si la lecture a réussi. */
  refresh: () => Promise<boolean>;
}

const NO_SUMMARY: SummaryContextValue = { summary: null, error: null, refresh: async () => false };
const SummaryContext = createContext<SummaryContextValue>(NO_SUMMARY);

/**
 * Résumé du jour de l'entreprise (GET /business/summary, docs/API.md) : livraisons en cours, livrées aujourd'hui,
 * délai moyen, marchandise à reverser. Lu une fois à l'ouverture de l'espace entreprise ; les écrans qui l'affichent
 * le rafraîchissent (`useSummaryRefresh`). Partagé par l'accueil (pastilles), le tableau de bord (tuiles) et la barre
 * latérale de l'ordinateur (nombre de livraisons en cours).
 */
export function BusinessSummaryProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [summary, setSummary] = useState<BusinessSummaryDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback((): Promise<boolean> => {
    if (inFlight.current) return inFlight.current;
    const p = api
      .request<BusinessSummaryDto>('GET', '/business/summary')
      .then(
        (s) => {
          if (mounted.current) {
            setSummary(s);
            setError(null);
          }
          return true;
        },
        (e: unknown) => {
          if (mounted.current) setError(errorMessage(e));
          return false;
        },
      )
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = p;
    return p;
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ summary, error, refresh }), [summary, error, refresh]);
  return <SummaryContext.Provider value={value}>{children}</SummaryContext.Provider>;
}

/** Résumé du jour (valeurs nulles hors de `BusinessSummaryProvider`). */
export function useBusinessSummary(): SummaryContextValue {
  return useContext(SummaryContext);
}

/**
 * Écran qui affiche le résumé : relu à chaque retour au premier plan (`focused`), toutes les 30 s en mode poll, et
 * en mode socket à chaque changement d'état d'une livraison (`order.updated` : livrée, annulée, nouvelle).
 */
export function useSummaryRefresh(focused: boolean): void {
  const { refresh } = useBusinessSummary();
  useEffect(() => {
    if (focused) void refresh();
  }, [focused, refresh]);
  usePolling(refresh, SUMMARY_POLL_MS, focused);
  useSocketEvent('order.updated', () => {
    if (focused) void refresh();
  });
}

/**
 * Relit le résumé quand l'ensemble des livraisons en cours change (`key` : leurs identifiants ; une livraison livrée,
 * annulée ou nouvelle) : les chiffres du jour suivent la liste sans attendre le prochain rafraîchissement (30 s en mode
 * poll). Rien au premier chargement (déjà fait par `useSummaryRefresh`), ni tant que `key` est null (liste pas lue).
 */
export function useSummaryRefreshOnChange(key: string | null, enabled: boolean): void {
  const { refresh } = useBusinessSummary();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (key === null) return;
    const previous = last.current;
    last.current = key;
    if (enabled && previous !== null && previous !== key) void refresh();
  }, [key, enabled, refresh]);
}
