import { createContext, useContext, type ReactNode } from 'react';
import type { IncidentDto } from '@yaar/shared';
import { useApi } from '../auth/AuthContext';
import { POLL_MS } from '../config';
import { usePolling, useReconnect, useSocketEvent } from '../realtime/RealtimeContext';
import { useAsync, useDebouncedCallback } from './useAsync';

/** Incidents à traiter : ouverts et en cours (les plus récents d'abord). */
export const ACTIVE_INCIDENT_STATUSES = ['OPEN', 'IN_PROGRESS'] as const;

interface IncidentsValue {
  /** null pendant le premier chargement. */
  incidents: IncidentDto[] | null;
  error: string | null;
  reload: () => Promise<boolean>;
}

const IncidentsContext = createContext<IncidentsValue>({
  incidents: null,
  error: null,
  reload: async () => true,
});

/**
 * Une seule source pour les alertes de toute la console : les toasts SOS de l'en-tête et le panneau
 * « Alertes » de la carte en direct lisent la même liste. En mode poll, une seule requête
 * `GET /controller/incidents?status=OPEN,IN_PROGRESS` toutes les POLL_MS.incidents (au lieu de trois) ;
 * en mode socket, rechargement sur les événements `sos` / `incident.updated` et à la reconnexion.
 */
export function IncidentsProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const state = useAsync(
    async () => (await api.listIncidents({ status: [...ACTIVE_INCIDENT_STATUSES], pageSize: 50 })).items,
    [api],
  );
  const { reload } = state;
  const refresh = useDebouncedCallback(() => void reload(true), 800);
  useSocketEvent('sos', refresh);
  useSocketEvent('incident.updated', refresh);
  useReconnect(() => void reload(true));
  usePolling(() => reload(true), POLL_MS.incidents);

  return (
    <IncidentsContext.Provider value={{ incidents: state.data, error: state.error, reload: () => reload(true) }}>
      {children}
    </IncidentsContext.Provider>
  );
}

export function useIncidents(): IncidentsValue {
  return useContext(IncidentsContext);
}
