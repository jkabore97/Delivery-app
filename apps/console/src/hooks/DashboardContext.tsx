import { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { DashboardDto } from '@yaar/shared';
import { useApi } from '../auth/AuthContext';
import { useReconnect, useSocketEvent } from '../realtime/RealtimeContext';
import { DASHBOARD_REFRESH_MS } from '../config';
import { useAsync, useDebouncedCallback } from './useAsync';

interface DashboardValue {
  dashboard: DashboardDto | null;
  error: string | null;
  refresh: () => void;
}

const DashboardContext = createContext<DashboardValue>({ dashboard: null, error: null, refresh: () => undefined });

/** Indicateurs partagés (cartes KPI + pastilles du menu), rafraîchis toutes les 30 s et sur événement. */
export function DashboardProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const { data, error, reload } = useAsync(() => api.dashboard(), [api]);
  const refresh = useDebouncedCallback(() => reload(true), 800);

  useEffect(() => {
    const t = setInterval(() => reload(true), DASHBOARD_REFRESH_MS);
    return () => clearInterval(t);
  }, [reload]);

  useSocketEvent('order.updated', refresh);
  useSocketEvent('driver.status', refresh);
  useSocketEvent('sos', refresh);
  useSocketEvent('incident.updated', refresh);
  useReconnect(() => reload(true));

  return <DashboardContext.Provider value={{ dashboard: data, error, refresh }}>{children}</DashboardContext.Provider>;
}

export function useDashboard(): DashboardValue {
  return useContext(DashboardContext);
}
