import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { cashDepositSchema, type BusinessBalanceDto, type CashOverviewDto } from '@yaar/shared';
import { errorMessage } from '../api/client';
import { useApi } from '../auth/AuthContext';
import { CsvExport } from '../components/CsvExport';
import { Badge, Card, Empty, ErrorBanner, Loading, Modal, Pagination, Vehicle } from '../components/ui';
import { useDashboard } from '../hooks/DashboardContext';
import { useAsync, useDebouncedCallback } from '../hooks/useAsync';
import { formatDateTime, formatFcfa, formatPhone, formatTime } from '../lib/format';
import { POLL_MS } from '../config';
import { usePolling, useReconnect, useSocketEvent } from '../realtime/RealtimeContext';

type CashDriver = CashOverviewDto['drivers'][number];

/** Valide un versement : entier > 0 et pas plus que le cash détenu. */
export function validateDeposit(amountInput: string, cashHeld: number): string | null {
  const amount = Number(amountInput.replace(/\s/g, ''));
  const parsed = cashDepositSchema.safeParse({ amount });
  if (!amountInput.trim() || !parsed.success) return 'Montant entier en FCFA, supérieur à 0.';
  if (amount > cashHeld) return `Le versement dépasse le cash détenu (${formatFcfa(cashHeld)}).`;
  return null;
}

function DepositDialog({ driver, onClose, onDone }: { driver: CashDriver; onClose: () => void; onDone: () => void }) {
  const api = useApi();
  const [amount, setAmount] = useState(String(driver.cashHeld));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const invalid = validateDeposit(amount, driver.cashHeld);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.recordDeposit(driver.driverId, {
        amount: Number(amount.replace(/\s/g, '')),
        note: note.trim() || undefined,
      });
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={`Versement de ${driver.name ?? formatPhone(driver.phone)}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="muted">Cash détenu : {formatFcfa(driver.cashHeld)}</p>
        <label htmlFor="deposit-amount">Montant versé (FCFA)</label>
        <input id="deposit-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        <label htmlFor="deposit-note">Note</label>
        <input
          id="deposit-note"
          value={note}
          maxLength={300}
          placeholder="Ex. : versement agence Zogona"
          onChange={(e) => setNote(e.target.value)}
        />
        <ErrorBanner message={error} />
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer le versement'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Totaux de la section « À reverser aux entreprises ». */
export function balanceTotals(rows: readonly BusinessBalanceDto[]): { owed: number; businesses: number; deliveries: number } {
  return rows.reduce(
    (t, r) => ({ owed: t.owed + r.owedTotal, businesses: t.businesses + 1, deliveries: t.deliveries + r.deliveries }),
    { owed: 0, businesses: 0, deliveries: 0 },
  );
}

/**
 * « À reverser aux entreprises » (GET /controller/cash/businesses) : marchandise encaissée par les livreurs pour
 * le compte des entreprises. Lecture seule : l'API ne gère pas encore le reversement (rien n'est marqué comme payé).
 */
export function BusinessBalances({
  rows,
  loading,
  error,
  fetchedAt,
  onReload,
}: {
  rows: BusinessBalanceDto[] | null;
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
  onReload: () => void;
}) {
  const totals = balanceTotals(rows ?? []);
  return (
    <Card
      title="À reverser aux entreprises"
      aside={
        <span className="inline-badges">
          {fetchedAt !== null && <span className="muted small">Mis à jour à {formatTime(new Date(fetchedAt).toISOString())}</span>}
          <button type="button" className="btn btn-small btn-ghost" onClick={onReload} disabled={loading}>
            Actualiser
          </button>
        </span>
      }
    >
      <div className="alert alert-info" role="note">
        <span>
          Lecture seule. Marchandise encaissée par les livreurs pour le compte des entreprises (livraisons livrées). Le
          reversement aux entreprises n’est pas encore géré par la console : les montants sont cumulés depuis le début et
          rien n’est marqué comme payé. Pour la comptabilité, utilisez l’export des livraisons (colonne « du_entreprise »).
        </span>
      </div>
      <ErrorBanner message={error} onRetry={onReload} />
      {loading && !rows ? (
        <Loading />
      ) : !rows || rows.length === 0 ? (
        <Empty>Aucun montant dû aux entreprises.</Empty>
      ) : (
        <>
          <div className="kpis kpis-3 kpis-inline">
            <article className="kpi" aria-label="Total à reverser">
              <div className="kpi-label">Total à reverser</div>
              <div className="kpi-value">{formatFcfa(totals.owed)}</div>
            </article>
            <article className="kpi" aria-label="Entreprises concernées">
              <div className="kpi-label">Entreprises concernées</div>
              <div className="kpi-value">{totals.businesses}</div>
            </article>
            <article className="kpi" aria-label="Livraisons avec marchandise encaissée">
              <div className="kpi-label">Livraisons avec marchandise encaissée</div>
              <div className="kpi-value">{totals.deliveries}</div>
            </article>
          </div>
          <div className="table-wrap">
            <table className="table" aria-label="Montants dus par entreprise">
              <thead>
                <tr>
                  <th>Entreprise</th>
                  <th>Téléphone</th>
                  <th className="num">Livraisons</th>
                  <th>Dernière livraison</th>
                  <th className="num">Montant dû</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.storeId}>
                    <td>
                      <div className="strong">{r.storeName}</div>
                      {r.ownerName && <div className="muted small">{r.ownerName}</div>}
                    </td>
                    <td>{r.phone ? <a href={`tel:${r.phone}`}>{formatPhone(r.phone)}</a> : '-'}</td>
                    <td className="num">{r.deliveries}</td>
                    <td>{formatDateTime(r.lastDeliveredAt)}</td>
                    <td className="num strong">{formatFcfa(r.owedTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

/** Caisse : espèces des livreurs (soldes, plafond, versements, grand livre) et montants dus aux entreprises. */
export function CashPage() {
  const api = useApi();
  const { refresh: refreshDashboard } = useDashboard();
  const [params, setParams] = useSearchParams();
  const driverId = params.get('driverId') ?? '';
  const [page, setPage] = useState(1);
  const [onlyBlocked, setOnlyBlocked] = useState(false);
  const [depositFor, setDepositFor] = useState<CashDriver | null>(null);
  const overview = useAsync(() => api.cashOverview(), [api]);
  const ledger = useAsync(
    () => api.cashLedger({ driverId: driverId || undefined, page, pageSize: 20 }),
    [api, driverId, page],
  );
  const [balancesAt, setBalancesAt] = useState<number | null>(null);
  const balances = useAsync(async () => {
    const rows = await api.businessBalances();
    setBalancesAt(Date.now());
    return rows;
  }, [api]);
  // Une livraison payée en espèces livrée fait monter le cash détenu : on recharge soldes, grand livre et dû aux entreprises.
  const refreshCash = useDebouncedCallback(() => {
    overview.reload(true);
    ledger.reload(true);
    balances.reload(true);
  }, 1500);
  useSocketEvent('order.updated', (e) => {
    if (e.status === 'DELIVERED') refreshCash();
  });
  useReconnect(refreshCash);
  // Mode poll : pas d'événement « livrée » ; soldes et grand livre rechargés toutes les 30 s.
  usePolling(async () => {
    const [a, b] = await Promise.all([overview.reload(true), ledger.reload(true)]);
    return a && b;
  }, POLL_MS.cash);
  // Dû aux entreprises : pas de requête périodique de plus. Rechargé quand le cash détenu change (une livraison
  // avec marchandise vient d'être encaissée), comme la file KYC de la carte suit sa pastille ; sinon « Actualiser ».
  const totalHeld = overview.data?.totalHeld;
  const { reload: reloadBalances } = balances;
  const lastHeld = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (totalHeld === undefined) return;
    const prev = lastHeld.current;
    lastHeld.current = totalHeld;
    if (prev !== undefined && prev !== totalHeld) void reloadBalances(true);
  }, [totalHeld, reloadBalances]);

  const drivers = (overview.data?.drivers ?? []).filter((d) => !onlyBlocked || d.cashBlocked);
  const blockedCount = (overview.data?.drivers ?? []).filter((d) => d.cashBlocked).length;
  const selected = overview.data?.drivers.find((d) => d.driverId === driverId);

  return (
    <div className="page">
      <h1>Caisse</h1>
      <ErrorBanner message={overview.error} onRetry={() => overview.reload()} />
      {overview.data && (
        <div className="kpis kpis-3">
          <article className="kpi">
            <div className="kpi-label">Cash détenu au total</div>
            <div className="kpi-value">{formatFcfa(overview.data.totalHeld)}</div>
          </article>
          <article className="kpi">
            <div className="kpi-label">Plafond par livreur</div>
            <div className="kpi-value">{formatFcfa(overview.data.cashLimit)}</div>
            <div className="kpi-sub muted">au-delà : plus d’offres ni de mise en ligne</div>
          </article>
          <article className="kpi">
            <div className="kpi-label">Livreurs au plafond</div>
            <div className="kpi-value">{blockedCount}</div>
            <div className={`kpi-sub ${blockedCount ? 'tone-red' : 'tone-green'}`}>
              {blockedCount ? 'versement requis' : 'aucun blocage'}
            </div>
          </article>
        </div>
      )}
      <Card
        title="Soldes des livreurs"
        aside={
          <label className="checkbox">
            <input type="checkbox" checked={onlyBlocked} onChange={(e) => setOnlyBlocked(e.target.checked)} />
            Au plafond uniquement
          </label>
        }
      >
        {overview.loading && !overview.data ? (
          <Loading />
        ) : drivers.length === 0 ? (
          <Empty>Aucun livreur.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Livreur</th>
                  <th>Véhicule</th>
                  <th className="num">Cash détenu</th>
                  <th>Dernier versement</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <tr key={d.driverId} className={d.cashBlocked ? 'row-alert' : ''}>
                    <td>
                      <Link to={`/livreurs/${d.driverId}`}>{d.name ?? 'Sans nom'}</Link>
                      <div className="muted small">{formatPhone(d.phone)}</div>
                    </td>
                    <td>
                      <Vehicle type={d.vehicleType} />
                    </td>
                    <td className="num">
                      <span className={d.cashBlocked ? 'tone-red strong' : ''}>{formatFcfa(d.cashHeld)}</span>
                      {d.cashBlocked && (
                        <>
                          {' '}
                          <Badge tone="red">Plafond</Badge>
                        </>
                      )}
                    </td>
                    <td>{formatDateTime(d.lastDepositAt)}</td>
                    <td className="cell-action">
                      <span className="inline-badges">
                        <button
                          type="button"
                          className="btn btn-small btn-ghost"
                          onClick={() => {
                            setPage(1);
                            setParams({ driverId: d.driverId });
                          }}
                        >
                          Historique
                        </button>
                        <button
                          type="button"
                          className="btn btn-small btn-primary"
                          disabled={d.cashHeld <= 0}
                          onClick={() => setDepositFor(d)}
                        >
                          Versement
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <BusinessBalances
        rows={balances.data}
        loading={balances.loading}
        error={balances.error}
        fetchedAt={balancesAt}
        onReload={() => void balances.reload(true)}
      />
      <Card
        title={selected ? `Mouvements · ${selected.name ?? formatPhone(selected.phone)}` : 'Mouvements de caisse'}
        aside={
          driverId ? (
            <button
              type="button"
              className="btn btn-small btn-ghost"
              onClick={() => {
                setPage(1);
                setParams({});
              }}
            >
              Tous les livreurs
            </button>
          ) : null
        }
      >
        <ErrorBanner message={ledger.error} />
        {ledger.loading && !ledger.data ? (
          <Loading />
        ) : !ledger.data || ledger.data.items.length === 0 ? (
          <Empty>Aucun mouvement.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Livreur</th>
                  <th>Type</th>
                  <th>Détail</th>
                  <th className="num">Montant</th>
                  <th className="num">Solde</th>
                </tr>
              </thead>
              <tbody>
                {ledger.data.items.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDateTime(e.createdAt)}</td>
                    <td>{e.driverName ?? '-'}</td>
                    <td>
                      {e.type === 'COLLECTION' ? <Badge tone="orange">Encaissement</Badge> : <Badge tone="green">Versement</Badge>}
                    </td>
                    <td>
                      {e.orderId ? <Link to={`/courses/${e.orderId}`}>#{e.orderNumber}</Link> : null} {e.note ?? ''}
                      {e.recordedBy && <div className="muted small">par {e.recordedBy.name ?? 'contrôleur'}</div>}
                    </td>
                    <td className={`num ${e.amount < 0 ? 'tone-green' : ''}`}>
                      {e.amount > 0 ? '+' : ''}
                      {formatFcfa(e.amount)}
                    </td>
                    <td className="num">{formatFcfa(e.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {ledger.data && (
          <Pagination page={ledger.data.page} pageSize={ledger.data.pageSize} total={ledger.data.total} onPage={setPage} />
        )}
      </Card>
      {depositFor && (
        <DepositDialog
          driver={depositFor}
          onClose={() => setDepositFor(null)}
          onDone={() => {
            overview.reload(true);
            ledger.reload(true);
            refreshDashboard();
          }}
        />
      )}
      <Card title="Exports comptables">
        <CsvExport kind="cash-ledger" label="Exporter le journal de caisse (CSV)" />
        <CsvExport kind="orders" label="Exporter les livraisons (CSV, dû aux entreprises)" />
      </Card>
    </div>
  );
}
