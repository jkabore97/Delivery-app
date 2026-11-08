import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { IncidentDto, MapDataDto, PendingOrderDto } from '@yaar/shared';
import { useApi } from '../auth/AuthContext';
import { AlertsPanel } from '../components/AlertsPanel';
import { KpiCards } from '../components/KpiCards';
import { KycQueuePanel } from '../components/KycQueuePanel';
import { LiveMap } from '../components/LiveMap';
import { PendingOrdersPanel } from '../components/PendingOrdersPanel';
import { ErrorBanner, Loading } from '../components/ui';
import { useDashboard } from '../hooks/DashboardContext';
import { useAsync, useDebouncedCallback } from '../hooks/useAsync';
import { applyDriverLocation, applyDriverStatus, applyIncident, type VehicleFilter } from '../lib/mapState';
import { MAP_SAFETY_REFRESH_MS, POLL_MS } from '../config';
import { usePolling, useRealtime, useReconnect, useSocketEvent } from '../realtime/RealtimeContext';

const FILTERS: Array<{ value: VehicleFilter; label: string }> = [
  { value: 'ALL', label: 'Tous' },
  { value: 'BIKE', label: '🚲 Vélo' },
  { value: 'MOTO', label: '🏍️ Moto' },
  { value: 'CAR', label: '🚗 Voiture' },
];

/** « Carte en direct · Ouagadougou » (maquette 2). */
export function LivePage() {
  const api = useApi();
  const navigate = useNavigate();
  const { dashboard, error: dashError, refresh: refreshDashboard } = useDashboard();
  const [filter, setFilter] = useState<VehicleFilter>('ALL');

  const map = useAsync<MapDataDto>(() => api.map(), [api]);
  const [pendingFetchedAt, setPendingFetchedAt] = useState(() => Date.now());
  const pending = useAsync<PendingOrderDto[]>(async () => {
    const res = await api.pendingOrders();
    setPendingFetchedAt(Date.now());
    return res;
  }, [api]);
  const kyc = useAsync(() => api.listDrivers({ status: 'PENDING', pageSize: 4 }), [api]);
  // L'API n'accepte qu'un statut par appel : on charge séparément les incidents ouverts et en cours,
  // pour qu'un SOS ancien ne soit jamais masqué par des incidents résolus plus récents.
  const incidents = useAsync<IncidentDto[]>(async () => {
    const [open, inProgress] = await Promise.all([
      api.listIncidents({ status: 'OPEN', pageSize: 50 }),
      api.listIncidents({ status: 'IN_PROGRESS', pageSize: 50 }),
    ]);
    return mergeIncidents(open.items, inProgress.items);
  }, [api]);

  const refetchMap = useDebouncedCallback(() => map.reload(true), 1000);
  const refetchPending = useDebouncedCallback(() => pending.reload(true), 800);
  const refetchIncidents = useDebouncedCallback(() => incidents.reload(true), 800);

  // Rattrapage après une coupure du temps réel : les événements manqués ne seront jamais rejoués.
  useReconnect(() => {
    map.reload(true);
    pending.reload(true);
    kyc.reload(true);
    incidents.reload(true);
  });

  const { reload: reloadMap } = map;
  const { mode } = useRealtime();
  useEffect(() => {
    if (mode !== 'socket') return undefined;
    const t = setInterval(() => void reloadMap(true), MAP_SAFETY_REFRESH_MS);
    return () => clearInterval(t);
  }, [reloadMap, mode]);

  // Mode poll (Vercel) : la carte, la file d'attente et les alertes remplacent les événements Socket.IO.
  // Les indicateurs (et donc la file KYC, rechargée quand sa pastille change) sont gérés par DashboardProvider.
  usePolling(() => map.reload(true), POLL_MS.map);
  usePolling(() => pending.reload(true), POLL_MS.pendingOrders);
  usePolling(() => incidents.reload(true), POLL_MS.incidents);
  usePolling(() => kyc.reload(true), POLL_MS.kyc);

  // Nouveau dossier déposé (pastille KYC qui change) : on recharge la file affichée.
  const pendingKyc = dashboard?.pendingKyc;
  const { reload: reloadKyc } = kyc;
  const firstKycCount = useRef(true);
  useEffect(() => {
    if (pendingKyc === undefined) return;
    if (firstKycCount.current) {
      firstKycCount.current = false;
      return;
    }
    reloadKyc(true);
  }, [pendingKyc, reloadKyc]);

  const { setData: setMap } = map;
  // Miroir synchrone de l'état de carte : plusieurs événements peuvent arriver entre deux rendus.
  const mapRef = useRef<MapDataDto | null>(map.data);
  mapRef.current = map.data;
  const updateMap = useCallback(
    (fn: (s: MapDataDto) => { state: MapDataDto; needsRefetch: boolean }) => {
      const current = mapRef.current;
      if (!current) return;
      const r = fn(current);
      mapRef.current = r.state;
      setMap(r.state);
      if (r.needsRefetch) refetchMap();
    },
    [setMap, refetchMap],
  );

  useSocketEvent('driver.location', (e) => updateMap((s) => applyDriverLocation(s, e)));
  useSocketEvent('driver.status', (e) => {
    updateMap((s) => applyDriverStatus(s, e));
  });
  useSocketEvent('order.updated', () => {
    refetchMap();
    refetchPending();
  });
  const onIncident = ({ incident }: { incident: IncidentDto }) => {
    updateMap((s) => ({ state: applyIncident(s, incident), needsRefetch: false }));
    refetchIncidents();
  };
  useSocketEvent('sos', onIncident);
  useSocketEvent('incident.updated', onIncident);

  const onPendingChanged = () => {
    pending.reload(true);
    map.reload(true);
    refreshDashboard();
  };

  const openIncidents = (incidents.data ?? []).filter((i) => i.status !== 'RESOLVED');

  return (
    <div className="page page-live">
      <h1>Carte en direct · Ouagadougou</h1>
      <ErrorBanner message={dashError} />
      {dashboard ? <KpiCards dashboard={dashboard} /> : <Loading label="Chargement des indicateurs…" />}
      <div className="live-grid">
        <div className="map-wrap">
          <div className="map-filters" role="group" aria-label="Filtrer par véhicule">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`pill ${filter === f.value ? 'pill-active' : ''}`}
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
          {map.error && <ErrorBanner message={map.error} onRetry={() => map.reload()} />}
          {map.data ? (
            <LiveMap
              data={map.data}
              filter={filter}
              onOrderClick={(id) => navigate(`/courses/${id}`)}
              onDriverClick={(id) => navigate(`/livreurs/${id}`)}
            />
          ) : (
            !map.error && <Loading label="Chargement de la carte…" />
          )}
          <div className="map-legend" aria-label="Légende">
            <span>
              <i className="dot dot-green" /> Livreur libre
            </span>
            <span>
              <i className="dot dot-blue" /> En course
            </span>
            <span>
              <i className="dot dot-orange square" /> Vendeur
            </span>
            <span>
              <i className="dot dot-red" /> Commande en attente
            </span>
          </div>
        </div>
        <div className="side-panels">
          <ErrorBanner message={pending.error} onRetry={() => pending.reload()} />
          <PendingOrdersPanel
            orders={pending.data ?? []}
            fetchedAt={pendingFetchedAt}
            onChanged={onPendingChanged}
            limit={6}
          />
          <ErrorBanner message={kyc.error} />
          <KycQueuePanel
            drivers={kyc.data?.items ?? []}
            total={kyc.data?.total ?? 0}
          />
          <ErrorBanner message={incidents.error} onRetry={() => incidents.reload()} />
          <AlertsPanel incidents={openIncidents} />
        </div>
      </div>
    </div>
  );
}

/** Fusionne des listes d'incidents (sans doublon), du plus récent au plus ancien. */
export function mergeIncidents(...lists: IncidentDto[][]): IncidentDto[] {
  const byId = new Map<string, IncidentDto>();
  for (const list of lists) for (const i of list) byId.set(i.id, i);
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
