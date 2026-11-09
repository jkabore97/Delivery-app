import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import type { DashboardDto } from '@yaar/shared';
import { useApi } from '../auth/AuthContext';
import { usePolling, useRealtime, useReconnect, useSocketEvent } from '../realtime/RealtimeContext';
import { DASHBOARD_REFRESH_MS, POLL_MS } from '../config';
import { useAsync, useDebouncedCallback } from './useAsync';

interface DashboardValue {
  dashboard: DashboardDto | null;
  error: string | null;
  refresh: () => void;
  /** Entreprises (boutiques) en attente de validation (null si inconnu) : pastille « Entreprises ». */
  pendingStores: number | null;
  refreshPendingStores: () => void;
}

const DashboardContext = createContext<DashboardValue>({
  dashboard: null,
  error: null,
  refresh: () => undefined,
  pendingStores: null,
  refreshPendingStores: () => undefined,
});

/** Indicateurs partagés (cartes KPI + pastilles du menu), rafraîchis toutes les 30 s (60 s pour les entreprises) et sur événement. */
export function DashboardProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const { data, error, reload } = useAsync(() => api.dashboard(), [api]);
  const refresh = useDebouncedCallback(() => reload(true), 800);
  // Le tableau de bord ne compte pas les entreprises à valider : file GET /controller/stores?approvalStatus=PENDING.
  const stores = useAsync(
    () => api.listStores({ approvalStatus: 'PENDING', pageSize: 1 }).then((p) => p.total),
    [api],
  );
  const reloadStores = stores.reload;
  const refreshPendingStores = useCallback(() => reloadStores(true), [reloadStores]);

  const { mode } = useRealtime();
  useEffect(() => {
    if (mode !== 'socket') return undefined;
    const t = setInterval(() => {
      void reload(true);
      void reloadStores(true);
    }, DASHBOARD_REFRESH_MS);
    return () => clearInterval(t);
  }, [reload, reloadStores, mode]);
  // Mode poll : indicateurs toutes les 30 s, entreprises à valider toutes les 60 s (rarement modifiées),
  // en pause quand l'onglet est masqué ou la console inactive.
  usePolling(() => reload(true), POLL_MS.dashboard);
  usePolling(() => reloadStores(true), POLL_MS.pendingStores);

  useSocketEvent('order.updated', refresh);
  useSocketEvent('driver.status', refresh);
  useSocketEvent('sos', refresh);
  useSocketEvent('incident.updated', refresh);
  useReconnect(() => {
    void reload(true);
    void reloadStores(true);
  });

  return (
    <DashboardContext.Provider
      value={{ dashboard: data, error, refresh, pendingStores: stores.data, refreshPendingStores }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard(): DashboardValue {
  return useContext(DashboardContext);
}
