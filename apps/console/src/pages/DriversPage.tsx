import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  DRIVER_STATUSES,
  LABELS,
  VEHICLE_TYPES,
} from '@yaar/shared';
import { useApi } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { DocumentChips } from '../components/DocumentChips';
import { DocsMeter } from '../components/KycQueuePanel';
import { PageTitle } from '../components/PageTitle';
import {
  Avatar,
  Badge,
  Card,
  DriverStatusBadge,
  Empty,
  ErrorBanner,
  FilterSelect,
  Loading,
  Pagination,
  Rating,
  TableWrap,
  Vehicle,
} from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { formatDate, formatFcfa, formatPhone } from '../lib/format';
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
      <PageTitle>Livreurs</PageTitle>
      <Card>
        <div className="filters">
          <FilterSelect label="Statut" value={status} onChange={(v) => update({ status: v })}>
            <option value="">Tous</option>
            {DRIVER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LABELS.driverStatus[s]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Véhicule" value={vehicleType} onChange={(v) => update({ vehicleType: v })}>
            <option value="">Tous</option>
            {VEHICLE_TYPES.map((v) => (
              <option key={v} value={v}>
                {LABELS.vehicleType[v]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Disponibilité" value={online} onChange={(v) => update({ online: v })}>
            <option value="">Tous</option>
            <option value="true">En ligne</option>
            <option value="false">Hors ligne</option>
          </FilterSelect>
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
            <button type="submit" className="btn btn-ghost">
              <Icon name="search" size={18} />
              Rechercher
            </button>
          </form>
        </div>
        <ErrorBanner message={drivers.error} onRetry={() => drivers.reload()} />
        {!drivers.data ? (
          drivers.loading ? <Loading /> : null
        ) : drivers.data.items.length === 0 ? (
          <Empty icon="search">Aucun livreur.</Empty>
        ) : (
          <TableWrap label="Livreurs">
            <table className="table table-clickable">
              <thead>
                <tr>
                  <th>Livreur</th>
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
                      {/* Le nom est un vrai lien (clavier, lecteur d'écran, nouvel onglet) ; toute la ligne reste cliquable. */}
                      <span className="person">
                        <Avatar name={d.name} size="sm" />
                        <span className="person-text">
                          <Link to={`/livreurs/${d.userId}`} className="person-name" onClick={(e) => e.stopPropagation()}>
                            {d.name ?? 'Sans nom'}
                          </Link>
                          <span className="muted small phone">{formatPhone(d.phone)}</span>
                        </span>
                      </span>
                    </td>
                    <td>
                      {d.plate ? (
                        <span className="vehicle-plate">
                          <Vehicle type={d.vehicleType} withLabel={false} />
                          <span className="plate">{d.plate}</span>
                        </span>
                      ) : (
                        <Vehicle type={d.vehicleType} />
                      )}
                    </td>
                    <td>
                      <span className="inline-badges">
                        <DriverStatusBadge status={d.status} short />
                        {d.isSuspendedUser && <Badge tone="red">Compte suspendu</Badge>}
                      </span>
                    </td>
                    <td>
                      {d.isOnline ? (
                        <Badge tone={d.isBusy ? 'blue' : 'green'} dot>
                          {d.isBusy ? 'En course' : 'En ligne'}
                        </Badge>
                      ) : (
                        <Badge tone="grey">Hors ligne</Badge>
                      )}
                    </td>
                    <td className={`num ${d.cashBlocked ? 'tone-red' : ''}`}>
                      {formatFcfa(d.cashHeld)}
                      {d.cashBlocked && <div className="small nowrap">plafond atteint</div>}
                    </td>
                    <td>
                      <Rating avg={d.ratingAvg} count={d.ratingCount} />
                    </td>
                    <td className="tnum nowrap">{formatDate(d.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
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
      <PageTitle>Validation KYC</PageTitle>
      <p className="page-lead">
        Dossiers en attente, du plus ancien au plus récent. Chaque consultation de pièce est enregistrée dans le journal
        d’audit.
      </p>
      <ErrorBanner message={queue.error} onRetry={() => queue.reload()} />
      {!queue.data ? (
        queue.loading ? <Loading /> : null
      ) : queue.data.items.length === 0 ? (
        <Card>
          <Empty icon="check">Aucun dossier en attente de validation.</Empty>
        </Card>
      ) : (
        <div className="kyc-grid">
          {queue.data.items.map((d) => (
            <article key={d.userId} className="card kyc-card">
              <div className="kyc-card-head">
                <Avatar name={d.name} size="lg" />
                <div className="person-text">
                  <div className="strong">{d.name ?? 'Sans nom'}</div>
                  <div className="muted small">
                    {LABELS.vehicleType[d.vehicleType]}
                    {d.plate ? ` · ${d.plate}` : ''} · <span className="phone">{formatPhone(d.phone)}</span>
                  </div>
                </div>
              </div>
              <DocsMeter profile={d} />
              <DocumentChips profile={d} />
              <div className="kyc-card-foot">
                <span className="muted small tnum">Déposé le {formatDate(d.createdAt)}</span>
                <button type="button" className="btn btn-small btn-soft" onClick={() => navigate(`/kyc/${d.userId}`)}>
                  Examiner le dossier
                  <Icon name="chevronRight" size={16} />
                </button>
              </div>
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
