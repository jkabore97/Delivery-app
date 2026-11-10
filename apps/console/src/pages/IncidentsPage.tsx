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
import { Icon } from '../components/Icon';
import { PageTitle } from '../components/PageTitle';
import {
  Card,
  Empty,
  ErrorBanner,
  FilterSelect,
  IncidentStatusBadge,
  IncidentTypeBadge,
  Loading,
  Pagination,
  ReasonDialog,
  incidentTypeLabel,
} from '../components/ui';
import { useDashboard } from '../hooks/DashboardContext';
import { useAsync, useDebouncedCallback } from '../hooks/useAsync';
import { roleLabel } from '../lib/delivery';
import { formatDateTime, formatPhone, formatRelative } from '../lib/format';
import { POLL_MS } from '../config';
import { usePolling, useSocketEvent } from '../realtime/RealtimeContext';

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
  usePolling(() => incidents.reload(true), POLL_MS.incidents);

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
      <PageTitle>Litiges & SOS</PageTitle>
      <Card>
        <div className="filters">
          <FilterSelect
            label="Statut"
            value={status}
            onChange={(v) => {
              setPage(1);
              setStatus(v as IncidentStatus | '');
            }}
          >
            <option value="">Tous</option>
            {INCIDENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LABELS.incidentStatus[s]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Type"
            value={type}
            onChange={(v) => {
              setPage(1);
              setType(v as IncidentType | '');
            }}
          >
            <option value="">Tous</option>
            {INCIDENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {incidentTypeLabel(t)}
              </option>
            ))}
          </FilterSelect>
          {incidents.data && (
            <span className="filters-note tnum">
              {incidents.data.total} incident{incidents.data.total > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <ErrorBanner message={error ?? incidents.error} />
        {!incidents.data ? (
          incidents.loading ? <Loading /> : null
        ) : incidents.data.items.length === 0 ? (
          <Empty icon="check">Aucun incident.</Empty>
        ) : (
          <ul className="incident-list">
            {incidents.data.items.map((i) => (
              <li
                key={i.id}
                className={`incident ${i.id === focus ? 'incident-focus' : ''} ${i.type === 'SOS' && i.status !== 'RESOLVED' ? 'incident-sos' : ''}`}
              >
                <span className={`alert-disc${i.type === 'SOS' ? ' is-sos' : ''}`} aria-hidden="true">
                  <Icon name={i.type === 'SOS' ? 'alert' : i.type === 'DISPUTE' ? 'flag' : 'info'} size={18} />
                </span>
                <div className="incident-main">
                  <div className="incident-head">
                    <IncidentTypeBadge type={i.type} />
                    <IncidentStatusBadge status={i.status} />
                    <span className="muted small strong" title={formatDateTime(i.createdAt)}>
                      {formatRelative(i.createdAt)}
                    </span>
                    {i.orderId && (
                      <Link to={`/courses/${i.orderId}`} className="small tnum">
                        Livraison #{i.orderNumber}
                      </Link>
                    )}
                  </div>
                  <p className="incident-desc">{i.description || <span className="muted">Sans description</span>}</p>
                  <div className="incident-meta small">
                    {roleLabel(i.reporter.role)} : {i.reporter.name ?? 'Sans nom'} ·{' '}
                    <a href={`tel:${i.reporter.phone}`} className="phone">
                      {formatPhone(i.reporter.phone)}
                    </a>
                    {i.lat !== null && i.lng !== null && (
                      <>
                        {' · '}
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${i.lat}&mlon=${i.lng}#map=17/${i.lat}/${i.lng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="osm-link"
                        >
                          Position
                          <Icon name="external" size={13} />
                        </a>
                      </>
                    )}
                  </div>
                  {i.status === 'RESOLVED' ? (
                    <div className="incident-resolution small">
                      <Icon name="checkCircle" size={16} />
                      <span>
                        Résolu {i.resolvedBy ? `par ${i.resolvedBy.name ?? 'un contrôleur'} ` : ''}le {formatDateTime(i.resolvedAt)}
                        {i.resolutionNote ? ` · ${i.resolutionNote}` : ''}
                      </span>
                    </div>
                  ) : (
                    <div className="incident-actions">
                      {i.type === 'SOS' && (
                        <a className="btn btn-small btn-danger" href={`tel:${i.reporter.phone}`}>
                          <Icon name="phone" size={16} />
                          Appeler
                        </a>
                      )}
                      {i.status === 'OPEN' && (
                        <button type="button" className="btn btn-small btn-ghost" onClick={() => void take(i)}>
                          Prendre en charge
                        </button>
                      )}
                      <button type="button" className="btn btn-small btn-soft" onClick={() => setResolving(i)}>
                        <Icon name="check" size={16} />
                        Marquer résolu
                      </button>
                    </div>
                  )}
                </div>
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
          title={`Résoudre\u00a0: ${incidentTypeLabel(resolving.type)}`}
          label="Note de résolution"
          placeholder="Ex. : livreur dépanné, entreprise remboursée"
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
