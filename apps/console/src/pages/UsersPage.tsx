import { useState, type FormEvent } from 'react';
import { LABELS, createStaffSchema, type Role, type StoreDto, type UserDto } from '@yaar/shared';
import { errorMessage } from '../api/client';
import { useApi, useAuth } from '../auth/AuthContext';
import { Badge, Card, Empty, ErrorBanner, Loading, Pagination, ReasonDialog } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { formatDate, formatPhone } from '../lib/format';

const PAGE_SIZE = 20;

/** Tableau de comptes utilisateurs d'un rôle, avec suspension / réactivation (audité). */
export function UsersTable({ role, title }: { role: Role; title: string }) {
  const api = useApi();
  const { user: me } = useAuth();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [suspended, setSuspended] = useState<'' | 'true' | 'false'>('');
  const [suspending, setSuspending] = useState<UserDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const users = useAsync(
    () =>
      api.listUsers({
        role,
        q: q || undefined,
        suspended: suspended === '' ? undefined : suspended === 'true',
        page,
        pageSize: PAGE_SIZE,
      }),
    [api, role, q, suspended, page],
  );

  function replace(updated: UserDto) {
    users.setData((prev) =>
      prev ? { ...prev, items: prev.items.map((u) => (u.id === updated.id ? updated : u)) } : prev,
    );
  }

  async function unsuspend(u: UserDto) {
    setError(null);
    try {
      replace(await api.unsuspendUser(u.id));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setQ(qInput.trim());
  }

  const isStaff = role === 'CONTROLLER' || role === 'ADMIN';
  const canManage = !isStaff || me?.role === 'ADMIN';

  return (
    <Card title={title}>
      <div className="filters">
        <label>
          État
          <select
            value={suspended}
            onChange={(e) => {
              setPage(1);
              setSuspended(e.target.value as '' | 'true' | 'false');
            }}
          >
            <option value="">Tous</option>
            <option value="false">Actifs</option>
            <option value="true">Suspendus</option>
          </select>
        </label>
        <form className="filter-search" onSubmit={onSearch}>
          <label>
            Recherche
            <input type="search" placeholder="Nom ou téléphone" value={qInput} onChange={(e) => setQInput(e.target.value)} />
          </label>
          <button type="submit" className="btn btn-primary">
            Rechercher
          </button>
        </form>
      </div>
      <ErrorBanner message={error ?? users.error} />
      {users.loading && !users.data ? (
        <Loading />
      ) : !users.data || users.data.items.length === 0 ? (
        <Empty>Aucun compte.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Téléphone</th>
                <th>Rôle</th>
                <th>Inscrit le</th>
                <th>État</th>
                <th aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {users.data.items.map((u) => (
                <tr key={u.id}>
                  <td>{u.name ?? 'Sans nom'}</td>
                  <td>
                    <a href={`tel:${u.phone}`}>{formatPhone(u.phone)}</a>
                  </td>
                  <td>{LABELS.role[u.role]}</td>
                  <td>{formatDate(u.createdAt)}</td>
                  <td>
                    {u.isSuspended ? (
                      <Badge tone="red" title={u.suspensionReason ?? undefined}>
                        Suspendu{u.suspensionReason ? ` · ${u.suspensionReason}` : ''}
                      </Badge>
                    ) : (
                      <Badge tone="green">Actif</Badge>
                    )}
                  </td>
                  <td className="cell-action">
                    {canManage && u.id !== me?.id &&
                      (u.isSuspended ? (
                        <button type="button" className="btn btn-small btn-ghost" onClick={() => void unsuspend(u)}>
                          Réactiver
                        </button>
                      ) : (
                        <button type="button" className="btn btn-small btn-danger-soft" onClick={() => setSuspending(u)}>
                          Suspendre
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {users.data && (
        <Pagination page={users.data.page} pageSize={users.data.pageSize} total={users.data.total} onPage={setPage} />
      )}
      {suspending && (
        <ReasonDialog
          title={`Suspendre le compte de ${suspending.name ?? formatPhone(suspending.phone)}`}
          label="Motif (le compte sera bloqué immédiatement)"
          confirmLabel="Suspendre le compte"
          onClose={() => setSuspending(null)}
          onConfirm={async (reason) => replace(await api.suspendUser(suspending.id, reason))}
        />
      )}
    </Card>
  );
}

export function ClientsPage() {
  return (
    <div className="page">
      <h1>Clients</h1>
      <UsersTable role="CLIENT" title="Comptes clients" />
    </div>
  );
}

function StoresTable() {
  const api = useApi();
  const [page, setPage] = useState(1);
  const stores = useAsync(() => api.listStores({ page, pageSize: PAGE_SIZE }), [api, page]);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  function replace(updated: StoreDto) {
    stores.setData((prev) =>
      prev ? { ...prev, items: prev.items.map((s) => (s.id === updated.id ? updated : s)) } : prev,
    );
  }

  async function save(s: StoreDto, input: { commissionPercent?: number; isOpen?: boolean }) {
    setError(null);
    try {
      replace(await api.updateStore(s.id, input));
      setEditing((prev) => {
        const next = { ...prev };
        delete next[s.id];
        return next;
      });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card title="Boutiques et restaurants">
      <ErrorBanner message={error ?? stores.error} />
      {stores.loading && !stores.data ? (
        <Loading />
      ) : !stores.data || stores.data.items.length === 0 ? (
        <Empty>Aucune boutique.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Boutique</th>
                <th>Adresse</th>
                <th>Téléphone</th>
                <th>Horaires</th>
                <th>État</th>
                <th>Commission</th>
              </tr>
            </thead>
            <tbody>
              {stores.data.items.map((s) => {
                const draft = editing[s.id];
                const value = draft ?? String(s.commissionPercent);
                const parsed = Number(value.replace(',', '.'));
                const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= 100;
                return (
                  <tr key={s.id}>
                    <td>
                      <div className="strong">{s.name}</div>
                      <div className="muted small">{s.description}</div>
                    </td>
                    <td>
                      {s.address}
                      {s.landmark && <div className="muted small">Repère : {s.landmark}</div>}
                    </td>
                    <td>{formatPhone(s.phone)}</td>
                    <td>{s.openingHours || '-'}</td>
                    <td>
                      <button
                        type="button"
                        className={`btn btn-small ${s.isOpen ? 'btn-soft' : 'btn-ghost'}`}
                        title={s.isOpen ? 'Fermer la boutique' : 'Ouvrir la boutique'}
                        onClick={() => void save(s, { isOpen: !s.isOpen })}
                      >
                        {s.isOpen ? '● Ouverte' : '○ Fermée'}
                      </button>
                    </td>
                    <td>
                      <span className="inline-form">
                        <input
                          aria-label={`Commission ${s.name}`}
                          className="input-small"
                          inputMode="decimal"
                          value={value}
                          onChange={(e) => setEditing((prev) => ({ ...prev, [s.id]: e.target.value }))}
                        />
                        %
                        {draft !== undefined && (
                          <button
                            type="button"
                            className="btn btn-small btn-primary"
                            disabled={!valid}
                            onClick={() => void save(s, { commissionPercent: parsed })}
                          >
                            OK
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {stores.data && (
        <Pagination page={stores.data.page} pageSize={stores.data.pageSize} total={stores.data.total} onPage={setPage} />
      )}
    </Card>
  );
}

export function SellersPage() {
  return (
    <div className="page">
      <h1>Vendeurs</h1>
      <StoresTable />
      <UsersTable role="SELLER" title="Comptes vendeurs" />
    </div>
  );
}

/** Équipe back office (ADMIN) : création de comptes contrôleur / administrateur. */
export function StaffPage() {
  const api = useApi();
  const { user } = useAuth();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'CONTROLLER' | 'ADMIN'>('CONTROLLER');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  if (user?.role !== 'ADMIN') {
    return (
      <div className="page">
        <h1>Équipe</h1>
        <ErrorBanner message="Réservé aux administrateurs." />
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = createStaffSchema.safeParse({ phone, name, role });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Données invalides');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const created = await api.createStaff(parsed.data);
      setNotice(`Compte ${LABELS.role[created.role].toLowerCase()} créé pour ${created.name ?? created.phone}.`);
      setPhone('');
      setName('');
      setVersion((v) => v + 1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1>Équipe</h1>
      <Card title="Ajouter un membre">
        <form className="form form-inline" onSubmit={submit}>
          <label>
            Nom
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </label>
          <label>
            Téléphone
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="70 99 88 77" />
          </label>
          <label>
            Rôle
            <select value={role} onChange={(e) => setRole(e.target.value as 'CONTROLLER' | 'ADMIN')}>
              <option value="CONTROLLER">{LABELS.role.CONTROLLER}</option>
              <option value="ADMIN">{LABELS.role.ADMIN}</option>
            </select>
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Créer le compte
          </button>
        </form>
        <ErrorBanner message={error} />
        {notice && <div className="alert alert-success">{notice}</div>}
      </Card>
      <UsersTable key={`c${version}`} role="CONTROLLER" title="Contrôleurs" />
      <UsersTable key={`a${version}`} role="ADMIN" title="Administrateurs" />
    </div>
  );
}
