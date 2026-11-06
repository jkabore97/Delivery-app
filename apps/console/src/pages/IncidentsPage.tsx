import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
  LABELS,
  type IncidentDto,
  type IncidentStatus,
  type IncidentType,
} from '@yaar/shared';
import { errorMessage } from '../api/client';
import { useApi } from '../auth/AuthContext';
import {
  Card,
  Empty,
  ErrorBanner,
  IncidentStatusBadge,
  IncidentTypeBadge,
  Loading,
  Pagination,
  ReasonDialog,
} from '../components/ui';
import { useDashboard } from '../hooks/DashboardContext';
import { useAsync, useDebouncedCallback } from '../hooks/useAsync';
import { formatDateTime, formatPhone, formatRelative } from '../lib/format';
import { useSocketEvent } from '../realtime/RealtimeContext';

/** Litiges, SOS et autres incidents, avec suivi de statut (audité). */
export function IncidentsPage() {
  const api = useApi();
  const { refresh: refreshDashboard } = useDashboard();
  const [params] = useSearchParams();
  const focus = params.get('focus');
  // Par défaut on montre ce qui reste à traiter.
  const [status, setStatus] = useState<IncidentStatus | ''>('OPEN');
  const [type, setType] = useState<IncidentType | ''>('');
  const [page, setPage] = useState(1);
  const [resolving, setResolving] = useState<IncidentDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const incidents = useAsync(
    () => api.listIncidents({ status: status || undefined, type: type || undefined, page, pageSize: 20 }),
    [api, status, type, page],
  );
  const refresh = useDebouncedCallback(() => incidents.reload(true), 500);
  useSocketEvent('sos', refresh);
  useSocketEvent('incident.updated', refresh);

  function replace(updated: IncidentDto) {
    incidents.setData((prev) =>
      prev ? { ...prev, items: prev.items.map((i) => (i.id === updated.id ? updated : i)) } : prev,
    );
    refreshDashboard();
  }

  async function take(i: IncidentDto) {
    setError(null);
    try {
      replace(await api.updateIncident(i.id, { status: 'IN_PROGRESS' }));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="page">
      <h1>Litiges & SOS</h1>
      <Card>
        <div className="filters">
          <label>
            Statut
            <select
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value as IncidentStatus | '');
              }}
            >
              <option value="">Tous</option>
              {INCIDENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LABELS.incidentStatus[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select
              value={type}
              onChange={(e) => {
                setPage(1);
                setType(e.target.value as IncidentType | '');
              }}
            >
              <option value="">Tous</option>
              {INCIDENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {LABELS.incidentType[t]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ErrorBanner message={error ?? incidents.error} />
        {incidents.loading && !incidents.data ? (
          <Loading />
        ) : !incidents.data || incidents.data.items.length === 0 ? (
          <Empty>Aucun incident.</Empty>
        ) : (
          <ul className="incident-list">
            {incidents.data.items.map((i) => (
              <li key={i.id} className={`incident ${i.id === focus ? 'incident-focus' : ''} ${i.type === 'SOS' && i.status !== 'RESOLVED' ? 'incident-sos' : ''}`}>
                <div className="incident-head">
                  <IncidentTypeBadge type={i.type} />
                  <IncidentStatusBadge status={i.status} />
                  <span className="muted small" title={formatDateTime(i.createdAt)}>
                    {formatRelative(i.createdAt)}
                  </span>
                  {i.orderId && (
                    <Link to={`/courses/${i.orderId}`} className="small">
                      Course #{i.orderNumber}
                    </Link>
                  )}
                </div>
                <p className="incident-desc">{i.description || <span className="muted">Sans description</span>}</p>
                <div className="incident-meta small">
                  {LABELS.role[i.reporter.role]} : {i.reporter.name ?? 'Sans nom'} ·{' '}
                  <a href={`tel:${i.reporter.phone}`}>{formatPhone(i.reporter.phone)}</a>
                  {i.lat !== null && i.lng !== null && (
                    <>
                      {' · '}
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${i.lat}&mlon=${i.lng}#map=17/${i.lat}/${i.lng}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Position
                      </a>
                    </>
                  )}
                </div>
                {i.status === 'RESOLVED' ? (
                  <div className="incident-resolution small">
                    Résolu {i.resolvedBy ? `par ${i.resolvedBy.name ?? 'un contrôleur'} ` : ''}le {formatDateTime(i.resolvedAt)}
                    {i.resolutionNote ? ` · ${i.resolutionNote}` : ''}
                  </div>
                ) : (
                  <div className="incident-actions">
                    {i.type === 'SOS' && (
                      <a className="btn btn-small btn-danger-soft" href={`tel:${i.reporter.phone}`}>
                        Appeler
                      </a>
                    )}
                    {i.status === 'OPEN' && (
                      <button type="button" className="btn btn-small btn-ghost" onClick={() => void take(i)}>
                        Prendre en charge
                      </button>
                    )}
                    <button type="button" className="btn btn-small btn-primary" onClick={() => setResolving(i)}>
                      Marquer résolu
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {incidents.data && (
          <Pagination
            page={incidents.data.page}
            pageSize={incidents.data.pageSize}
            total={incidents.data.total}
            onPage={setPage}
          />
        )}
      </Card>
      {resolving && (
        <ReasonDialog
          title={`Résoudre : ${LABELS.incidentType[resolving.type]}`}
          label="Note de résolution"
          placeholder="Ex. : livreur dépanné, client remboursé"
          confirmLabel="Marquer résolu"
          danger={false}
          required={false}
          onClose={() => setResolving(null)}
          onConfirm={async (note) =>
            replace(await api.updateIncident(resolving.id, { status: 'RESOLVED', resolutionNote: note || undefined }))
          }
        />
      )}
    </div>
  );
}
