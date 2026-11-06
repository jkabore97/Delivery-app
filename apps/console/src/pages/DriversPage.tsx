import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  DRIVER_STATUSES,
  LABELS,
  VEHICLE_TYPES,
} from '@yaar/shared';
import { useApi } from '../auth/AuthContext';
import { DocumentChips } from '../components/DocumentChips';
import {
  Badge,
  Card,
  DriverStatusBadge,
  Empty,
  ErrorBanner,
  Loading,
  Pagination,
  Vehicle,
} from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { formatDate, formatFcfa, formatPhone, initials } from '../lib/format';
import { enumParam, pageParam } from '../lib/params';

const PAGE_SIZE = 20;

function useFilterParams() {
  const [params, setParams] = useSearchParams();
  function update(next: Record<string, string>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (!('page' in next)) p.delete('page');
    setParams(p);
  }
  return { params, update };
}

/** Liste des livreurs (filtres statut, véhicule, en ligne, recherche). */
export function DriversPage() {
  const api = useApi();
  const navigate = useNavigate();
  const { params, update } = useFilterParams();
  const status = enumParam(params.get('status'), DRIVER_STATUSES);
  const vehicleType = enumParam(params.get('vehicleType'), VEHICLE_TYPES);
  const online = enumParam(params.get('online'), ['true', 'false'] as const);
  const q = params.get('q') ?? '';
  const page = pageParam(params.get('page'));
  const [qInput, setQInput] = useState(q);
  useEffect(() => setQInput(q), [q]);

  const drivers = useAsync(
    () =>
      api.listDrivers({
        status: status || undefined,
        vehicleType: vehicleType || undefined,
        online: online === '' ? undefined : online === 'true',
        q: q || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    [api, status, vehicleType, online, q, page],
  );

  function onSearch(e: FormEvent) {
    e.preventDefault();
    update({ q: qInput.trim() });
  }

  return (
    <div className="page">
      <h1>Livreurs</h1>
      <Card>
        <div className="filters">
          <label>
            Statut
            <select value={status} onChange={(e) => update({ status: e.target.value })}>
              <option value="">Tous</option>
              {DRIVER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LABELS.driverStatus[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Véhicule
            <select value={vehicleType} onChange={(e) => update({ vehicleType: e.target.value })}>
              <option value="">Tous</option>
              {VEHICLE_TYPES.map((v) => (
                <option key={v} value={v}>
                  {LABELS.vehicleType[v]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Disponibilité
            <select value={online} onChange={(e) => update({ online: e.target.value })}>
              <option value="">Tous</option>
              <option value="true">En ligne</option>
              <option value="false">Hors ligne</option>
            </select>
          </label>
          <form onSubmit={onSearch} className="filter-search">
            <label>
              Recherche
              <input
                type="search"
                placeholder="Nom, téléphone ou immatriculation"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
              />
            </label>
            <button type="submit" className="btn btn-primary">
              Rechercher
            </button>
          </form>
        </div>
        <ErrorBanner message={drivers.error} onRetry={() => drivers.reload()} />
        {drivers.loading && !drivers.data ? (
          <Loading />
        ) : !drivers.data || drivers.data.items.length === 0 ? (
          <Empty>Aucun livreur.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table table-clickable">
              <thead>
                <tr>
                  <th>Livreur</th>
                  <th>Téléphone</th>
                  <th>Véhicule</th>
                  <th>Dossier</th>
                  <th>Disponibilité</th>
                  <th className="num">Cash détenu</th>
                  <th>Note</th>
                  <th>Inscrit le</th>
                </tr>
              </thead>
              <tbody>
                {drivers.data.items.map((d) => (
                  <tr key={d.userId} onClick={() => navigate(`/livreurs/${d.userId}`)}>
                    <td>
                      <span className="person">
                        <span className="avatar avatar-small" aria-hidden="true">
                          {initials(d.name)}
                        </span>
                        {d.name ?? 'Sans nom'}
                      </span>
                    </td>
                    <td>{formatPhone(d.phone)}</td>
                    <td>
                      <Vehicle type={d.vehicleType} /> {d.plate ?? ''}
                    </td>
                    <td>
                      <span className="inline-badges">
                        <DriverStatusBadge status={d.status} />
                        {d.isSuspendedUser && <Badge tone="red">Compte suspendu</Badge>}
                      </span>
                    </td>
                    <td>
                      {d.isOnline ? (
                        <Badge tone={d.isBusy ? 'blue' : 'green'}>{d.isBusy ? 'En course' : 'En ligne'}</Badge>
                      ) : (
                        <Badge tone="grey">Hors ligne</Badge>
                      )}
                    </td>
                    <td className={`num ${d.cashBlocked ? 'tone-red strong' : ''}`}>{formatFcfa(d.cashHeld)}</td>
                    <td>{d.ratingAvg === null ? '-' : `${d.ratingAvg.toFixed(1)} ★ (${d.ratingCount})`}</td>
                    <td>{formatDate(d.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {drivers.data && (
          <Pagination
            page={drivers.data.page}
            pageSize={drivers.data.pageSize}
            total={drivers.data.total}
            onPage={(p) => update({ page: String(p) })}
          />
        )}
      </Card>
    </div>
  );
}

/** File de validation KYC (FIFO : plus ancien dossier en premier). */
export function KycQueuePage() {
  const api = useApi();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const queue = useAsync(() => api.listDrivers({ status: 'PENDING', page, pageSize: PAGE_SIZE }), [api, page]);

  return (
    <div className="page">
      <h1>Validation KYC</h1>
      <p className="muted">
        Dossiers en attente, du plus ancien au plus récent. Chaque consultation de pièce est enregistrée dans le journal
        d’audit.
      </p>
      <ErrorBanner message={queue.error} onRetry={() => queue.reload()} />
      {queue.loading && !queue.data ? (
        <Loading />
      ) : !queue.data || queue.data.items.length === 0 ? (
        <Card>
          <Empty>Aucun dossier en attente de validation.</Empty>
        </Card>
      ) : (
        <div className="kyc-grid">
          {queue.data.items.map((d) => (
            <article key={d.userId} className="card kyc-card">
              <div className="kyc-card-head">
                <span className="avatar" aria-hidden="true">
                  {initials(d.name)}
                </span>
                <div>
                  <div className="strong">{d.name ?? 'Sans nom'}</div>
                  <div className="muted small">
                    {LABELS.vehicleType[d.vehicleType]} {d.plate ?? ''} · {formatPhone(d.phone)}
                  </div>
                </div>
              </div>
              <DocumentChips profile={d} />
              <div className="muted small">Déposé le {formatDate(d.createdAt)}</div>
              <button type="button" className="btn btn-primary" onClick={() => navigate(`/kyc/${d.userId}`)}>
                Examiner le dossier
              </button>
            </article>
          ))}
        </div>
      )}
      {queue.data && (
        <Pagination page={queue.data.page} pageSize={queue.data.pageSize} total={queue.data.total} onPage={setPage} />
      )}
    </div>
  );
}
