import { useState, type FormEvent } from 'react';
import {
  LABELS,
  createStaffSchema,
  type Role,
  type StoreApprovalStatus,
  type StoreDto,
  type UserDto,
} from '@yaar/shared';
import { errorMessage } from '../api/client';
import { useApi, useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { PageTitle } from '../components/PageTitle';
import {
  Avatar,
  Badge,
  Banner,
  BizMark,
  Card,
  Empty,
  ErrorBanner,
  FilterSelect,
  Loading,
  Pagination,
  ReasonDialog,
  TableWrap,
  type Tone,
} from '../components/ui';
import { useDashboard } from '../hooks/DashboardContext';
import { useAsync } from '../hooks/useAsync';
import { roleLabel } from '../lib/delivery';
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
        <FilterSelect
          label="État"
          value={suspended}
          onChange={(v) => {
            setPage(1);
            setSuspended(v as '' | 'true' | 'false');
          }}
        >
          <option value="">Tous</option>
          <option value="false">Actifs</option>
          <option value="true">Suspendus</option>
        </FilterSelect>
        <form className="filter-search" onSubmit={onSearch}>
          <label>
            Recherche
            <input type="search" placeholder="Nom ou téléphone" value={qInput} onChange={(e) => setQInput(e.target.value)} />
          </label>
          <button type="submit" className="btn btn-ghost">
            <Icon name="search" size={18} />
            Rechercher
          </button>
        </form>
      </div>
      <ErrorBanner message={error ?? users.error} />
      {!users.data ? (
        users.loading ? <Loading /> : null
      ) : users.data.items.length === 0 ? (
        <Empty icon="users">Aucun compte.</Empty>
      ) : (
        <TableWrap label={title}>
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
                  <td>
                    <span className="person">
                      <Avatar name={u.name} size="sm" />
                      <span className="person-name">{u.name ?? 'Sans nom'}</span>
                    </span>
                  </td>
                  <td>
                    <a href={`tel:${u.phone}`} className="phone">
                      {formatPhone(u.phone)}
                    </a>
                  </td>
                  <td>{roleLabel(u.role)}</td>
                  <td className="tnum nowrap">{formatDate(u.createdAt)}</td>
                  <td>
                    {u.isSuspended ? (
                      <Badge tone="red" title={u.suspensionReason ?? undefined}>
                        Suspendu{u.suspensionReason ? ` · ${u.suspensionReason}` : ''}
                      </Badge>
                    ) : (
                      <Badge tone="green" dot>
                        Actif
                      </Badge>
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
        </TableWrap>
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

/**
 * Comptes clients de l'ancien parcours de commande (abandonné) : les destinataires des livraisons d'entreprise
 * n'ont pas de compte. L'écran sert encore à suspendre / réactiver ces comptes.
 */
export function ClientsPage() {
  return (
    <div className="page">
      <PageTitle>Anciens comptes clients</PageTitle>
      <p className="page-lead">
        Comptes créés par l’ancien parcours de commande (repas, colis client), qui n’est plus proposé. Les destinataires
        des livraisons d’entreprise n’ont pas de compte : ils suivent leur livraison par un lien.
      </p>
      <UsersTable role="CLIENT" title="Comptes clients" />
    </div>
  );
}

const STORE_APPROVAL_TONE: Record<StoreApprovalStatus, Tone> = { PENDING: 'orange', APPROVED: 'green', SUSPENDED: 'red' };

const STORE_FILTERS: Array<{ value: StoreApprovalStatus | ''; label: string }> = [
  { value: 'PENDING', label: 'À valider' },
  { value: 'APPROVED', label: 'Validées' },
  { value: 'SUSPENDED', label: 'Suspendues' },
  { value: '', label: 'Toutes' },
];

/**
 * Entreprises (§8.5, modèle B2B) : la boutique d'un compte SELLER est son profil d'entreprise. File de validation
 * des nouvelles entreprises, validation / refus / suspension avec motif (audités). Une entreprise doit être validée
 * avant de demander des livraisons (403 STORE_NOT_APPROVED sinon). Ouverture et commission de boutique ne servent
 * qu'à l'ancien parcours de commande : elles ne sont plus affichées.
 */
export function StoresTable() {
  const api = useApi();
  const { pendingStores, refreshPendingStores } = useDashboard();
  const [page, setPage] = useState(1);
  const [approval, setApproval] = useState<StoreApprovalStatus | ''>('PENDING');
  const stores = useAsync(
    () => api.listStores({ approvalStatus: approval || undefined, page, pageSize: PAGE_SIZE }),
    [api, approval, page],
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [suspending, setSuspending] = useState<StoreDto | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function replace(updated: StoreDto) {
    stores.setData((prev) =>
      prev ? { ...prev, items: prev.items.map((s) => (s.id === updated.id ? updated : s)) } : prev,
    );
  }

  /** Après validation / suspension : l'entreprise quitte éventuellement le filtre courant. */
  function afterApprovalChange(updated: StoreDto, message: string) {
    replace(updated);
    setNotice(message);
    refreshPendingStores();
    stores.reload(true);
  }

  async function approve(s: StoreDto) {
    setError(null);
    setNotice(null);
    setBusyId(s.id);
    try {
      afterApprovalChange(await api.approveStore(s.id), `Entreprise « ${s.name} » validée : elle peut demander des livraisons.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function changeFilter(value: StoreApprovalStatus | '') {
    setApproval(value);
    setPage(1);
    setNotice(null);
  }

  return (
    <Card
      title="Profils d’entreprise"
      aside={
        pendingStores ? (
          <Badge tone="orange">
            {pendingStores} entreprise{pendingStores > 1 ? 's' : ''} à valider
          </Badge>
        ) : undefined
      }
    >
      <div className="filters">
        <div className="segmented" role="group" aria-label="Filtrer par statut de validation">
          {STORE_FILTERS.map((f) => (
            <button
              key={f.value || 'all'}
              type="button"
              aria-pressed={approval === f.value}
              onClick={() => changeFilter(f.value)}
            >
              {f.label}
              {f.value === 'PENDING' && pendingStores ? ` (${pendingStores})` : ''}
            </button>
          ))}
        </div>
      </div>
      {notice && (
        <Banner tone="success" role="status">
          {notice}
        </Banner>
      )}
      <ErrorBanner message={error ?? stores.error} />
      {!stores.data ? (
        stores.loading ? <Loading /> : null
      ) : stores.data.items.length === 0 ? (
        <Empty icon={approval === 'PENDING' ? 'check' : 'store'}>
          {approval === 'PENDING' ? 'Aucune entreprise en attente de validation.' : 'Aucune entreprise.'}
        </Empty>
      ) : (
        <TableWrap label="Profils d’entreprise">
          <table className="table">
            <thead>
              <tr>
                <th>Entreprise</th>
                <th>Adresse de retrait</th>
                <th>Téléphone</th>
                <th>Validation</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {stores.data.items.map((s) => {
                const status = s.approvalStatus ?? 'APPROVED';
                return (
                  <tr key={s.id}>
                    <td>
                      <span className="person person-top">
                        <BizMark name={s.name} large />
                        <span className="person-text">
                          <span className="person-name">{s.name}</span>
                          {s.description && <div className="muted small">{s.description}</div>}
                          <div className="muted small tnum">Inscrite le {formatDate(s.createdAt)}</div>
                        </span>
                      </span>
                    </td>
                    <td>
                      {s.address}
                      {s.landmark && <div className="muted small">Repère : {s.landmark}</div>}
                    </td>
                    <td>
                      {s.phone ? (
                        <a href={`tel:${s.phone}`} className="phone">
                          {formatPhone(s.phone)}
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>
                      <Badge tone={STORE_APPROVAL_TONE[status]}>{LABELS.storeApprovalStatus[status]}</Badge>
                      {s.approvalNote && <div className="muted small">Motif : {s.approvalNote}</div>}
                    </td>
                    <td>
                      <span className="inline-form">
                        {status !== 'APPROVED' && (
                          <button
                            type="button"
                            className="btn btn-small btn-soft"
                            disabled={busyId === s.id}
                            onClick={() => void approve(s)}
                          >
                            {status === 'SUSPENDED' ? 'Réactiver' : 'Valider'}
                          </button>
                        )}
                        {status !== 'SUSPENDED' && (
                          <button
                            type="button"
                            className="btn btn-small btn-danger-soft"
                            disabled={busyId === s.id}
                            onClick={() => {
                              setNotice(null);
                              setSuspending(s);
                            }}
                          >
                            {status === 'PENDING' ? 'Refuser' : 'Suspendre'}
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
      {stores.data && (
        <Pagination page={stores.data.page} pageSize={stores.data.pageSize} total={stores.data.total} onPage={setPage} />
      )}
      {suspending && (
        <ReasonDialog
          title={`${suspending.approvalStatus === 'PENDING' ? 'Refuser' : 'Suspendre'} l’entreprise « ${suspending.name} »`}
          confirmLabel={suspending.approvalStatus === 'PENDING' ? 'Refuser' : 'Suspendre'}
          placeholder="Ex. : adresse introuvable, activité non vérifiée, documents manquants"
          description="L’entreprise ne peut plus demander de livraisons ; celles en cours continuent. Elle voit le motif dans son application. Action enregistrée dans le journal d’audit."
          onClose={() => setSuspending(null)}
          onConfirm={async (reason) => {
            const s = suspending;
            afterApprovalChange(
              await api.suspendStore(s.id, reason),
              `Entreprise « ${s.name} » ${s.approvalStatus === 'PENDING' ? 'refusée' : 'suspendue'}.`,
            );
          }}
        />
      )}
    </Card>
  );
}

/** Entreprises clientes de Yaar (modèle B2B) : validation des profils et comptes de connexion. */
export function BusinessesPage() {
  return (
    <div className="page">
      <PageTitle>Entreprises</PageTitle>
      <p className="page-lead">
        Les entreprises demandent des livraisons depuis l’application Yaar. Chaque nouvelle entreprise doit être validée
        par Yaar avant sa première demande ; tant qu’elle ne l’est pas (ou si elle est suspendue), l’application lui répond
        « Votre entreprise doit être validée par Yaar avant de demander une livraison ».
      </p>
      <StoresTable />
      <UsersTable role="SELLER" title="Comptes des entreprises" />
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
        <PageTitle>Équipe</PageTitle>
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
      <PageTitle>Équipe</PageTitle>
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
          <FilterSelect label="Rôle" value={role} onChange={(v) => setRole(v as 'CONTROLLER' | 'ADMIN')}>
            <option value="CONTROLLER">{LABELS.role.CONTROLLER}</option>
            <option value="ADMIN">{LABELS.role.ADMIN}</option>
          </FilterSelect>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            <Icon name="plus" size={18} />
            Créer le compte
          </button>
        </form>
        <ErrorBanner message={error} />
        {notice && <Banner tone="success">{notice}</Banner>}
      </Card>
      <UsersTable key={`c${version}`} role="CONTROLLER" title="Contrôleurs" />
      <UsersTable key={`a${version}`} role="ADMIN" title="Administrateurs" />
    </div>
  );
}
