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
import { useIncidents } from '../hooks/IncidentsContext';
import { useAsync, useDebouncedCallback } from '../hooks/useAsync';
import { applyDriverLocation, applyDriverStatus, applyIncident, kpiFingerprint, type VehicleFilter } from '../lib/mapState';
import { MAP_SAFETY_REFRESH_MS, POLL_MS } from '../config';
import { usePolling, useRealtime, useReconnect, useSocketEvent } from '../realtime/RealtimeContext';

/** Légende de la carte (mêmes formes que les marqueurs, cf. styles.css « Marqueurs des cartes »). */
export function MapLegend() {
  return (
    <div className="map-legend" aria-label="Légende">
      <span>
        <i className="lg lg-driver lg-free" aria-hidden="true" /> Livreur libre
      </span>
      <span>
        <i className="lg lg-driver lg-busy" aria-hidden="true" /> En livraison
      </span>
      <span>
        <i className="lg lg-business" aria-hidden="true" /> Entreprise
      </span>
      <span>
        <i className="lg lg-dropoff" aria-hidden="true" /> Destinataire
      </span>
      <span>
        <i className="lg lg-search" aria-hidden="true" /> En attente d’un livreur
      </span>
      <span>
        <i className="lg lg-route" aria-hidden="true" /> Itinéraire
      </span>
      <span>
        <i className="lg lg-sos" aria-hidden="true" /> SOS
      </span>
    </div>
  );
}

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
  // Alertes (ouvertes et en cours) : même source que les toasts SOS de l'en-tête (IncidentsProvider),
  // une seule requête pour toute la console.
  const incidents = useIncidents();

  const refetchMap = useDebouncedCallback(() => map.reload(true), 1000);
  const refetchPending = useDebouncedCallback(() => pending.reload(true), 800);

  // Rattrapage après une coupure du temps réel : les événements manqués ne seront jamais rejoués.
  // (Les alertes sont rechargées par IncidentsProvider.)
  useReconnect(() => {
    map.reload(true);
    pending.reload(true);
    kyc.reload(true);
  });

  const { reload: reloadMap } = map;
  const { mode } = useRealtime();
  useEffect(() => {
    if (mode !== 'socket') return undefined;
    const t = setInterval(() => void reloadMap(true), MAP_SAFETY_REFRESH_MS);
    return () => clearInterval(t);
  }, [reloadMap, mode]);

  // Mode poll (Vercel) : la carte et la file d'attente remplacent les événements Socket.IO (10 s chacune).
  // Les indicateurs sont gérés par DashboardProvider, les alertes par IncidentsProvider ; la file KYC est
  // rechargée quand sa pastille (indicateurs) change : pas de requête périodique de plus.
  usePolling(() => map.reload(true), POLL_MS.map);
  usePolling(() => pending.reload(true), POLL_MS.pendingOrders);

  // Mode poll : une course qui quitte la carte (livrée, annulée), y entre ou change de statut, ou un livreur qui passe en
  // ligne ou en course, change les indicateurs : rechargés aussitôt (« Livrées aujourd'hui » à jour en même temps que la
  // carte) au lieu d'attendre leur rythme de 30 s. En mode socket, `order.updated` et `driver.status` s'en chargent.
  const kpiKey = map.data ? kpiFingerprint(map.data) : null;
  const lastKpiKey = useRef<string | null>(null);
  useEffect(() => {
    if (kpiKey === null) return;
    const previous = lastKpiKey.current;
    lastKpiKey.current = kpiKey;
    if (mode === 'poll' && previous !== null && previous !== kpiKey) refreshDashboard();
  }, [kpiKey, mode, refreshDashboard]);

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
  };
  useSocketEvent('sos', onIncident);
  useSocketEvent('incident.updated', onIncident);

  const onPendingChanged = () => {
    pending.reload(true);
    map.reload(true);
    refreshDashboard();
  };

  const openIncidents = (incidents.incidents ?? []).filter((i) => i.status !== 'RESOLVED');

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
          <MapLegend />
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
          <ErrorBanner message={incidents.error} onRetry={() => void incidents.reload()} />
          <AlertsPanel incidents={openIncidents} />
        </div>
      </div>
    </div>
  );
}
