import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { cashDepositSchema, type BusinessBalanceDto, type CashOverviewDto } from '@yaar/shared';
import { errorMessage } from '../api/client';
import { useApi } from '../auth/AuthContext';
import { CsvExport } from '../components/CsvExport';
import { Icon } from '../components/Icon';
import { KpiTile } from '../components/KpiCards';
import { PageTitle } from '../components/PageTitle';
import {
  Avatar,
  Badge,
  Banner,
  BizMark,
  Card,
  DateTimeCell,
  Empty,
  ErrorBanner,
  Loading,
  Modal,
  Pagination,
  Vehicle,
} from '../components/ui';
import { useDashboard } from '../hooks/DashboardContext';
import { useAsync, useDebouncedCallback } from '../hooks/useAsync';
import { formatFcfa, formatPhone, formatTime, splitFcfaCompact } from '../lib/format';
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
        <p className="hint">
          Cash détenu : <strong className="money">{formatFcfa(driver.cashHeld)}</strong>
        </p>
        <label htmlFor="deposit-amount">Montant versé (FCFA)</label>
        <span className="input-suffix">
          <input id="deposit-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          <span>FCFA</span>
        </span>
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
          {fetchedAt !== null && (
            <span className="tnum">Mis à jour à {formatTime(new Date(fetchedAt).toISOString())}</span>
          )}
          <button type="button" className="btn btn-small btn-ghost" onClick={onReload} disabled={loading}>
            <Icon name="refresh" size={16} />
            Actualiser
          </button>
        </span>
      }
    >
      <Banner tone="info" role="note">
        Lecture seule. Marchandise encaissée par les livreurs pour le compte des entreprises (livraisons livrées). Le
        reversement aux entreprises n’est pas encore géré par la console : les montants sont cumulés depuis le début et
        rien n’est marqué comme payé. Pour la comptabilité, utilisez l’export des livraisons (colonne « du_entreprise »).
      </Banner>
      <ErrorBanner message={error} onRetry={onReload} />
      {loading && !rows ? (
        <Loading />
      ) : !rows || rows.length === 0 ? (
        <Empty icon="check">Aucun montant dû aux entreprises.</Empty>
      ) : (
        <>
          <div className="kpis kpis-3 kpis-inline">
            <article className="kpi kpi-sun" aria-label="Total à reverser">
              <div className="kpi-label">Total à reverser</div>
              <div className="kpi-value">
                <span className="kpi-number">
                  {splitFcfaCompact(totals.owed, false).value} <span className="kpi-unit">FCFA</span>
                </span>
              </div>
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
                      <span className="person">
                        <BizMark name={r.storeName} />
                        <span className="person-text">
                          <span className="person-name">{r.storeName}</span>
                          {r.ownerName && <span className="muted small">{r.ownerName}</span>}
                        </span>
                      </span>
                    </td>
                    <td>
                      {r.phone ? (
                        <a href={`tel:${r.phone}`} className="phone">
                          {formatPhone(r.phone)}
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="num">{r.deliveries}</td>
                    <td>
                      <DateTimeCell iso={r.lastDeliveredAt} />
                    </td>
                    <td className="num">
                      <span className="sunpill sunpill-sm">{formatFcfa(r.owedTotal)}</span>
                    </td>
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

  const total = overview.data ? splitFcfaCompact(overview.data.totalHeld, false) : null;
  const limit = overview.data ? splitFcfaCompact(overview.data.cashLimit, false) : null;

  return (
    <div className="page">
      <PageTitle>Caisse</PageTitle>
      <ErrorBanner message={overview.error} onRetry={() => overview.reload()} />
      {overview.data && total && limit && (
        <div className="kpis kpis-3">
          <KpiTile
            k={{
              label: 'Cash détenu au total',
              icon: 'wallet',
              value: total.value,
              unit: total.unit,
              sub: `${overview.data.drivers.filter((d) => d.cashHeld > 0).length} livreurs avec des espèces`,
              tone: 'muted',
              look: 'sun',
            }}
          />
          <KpiTile
            k={{
              label: 'Plafond par livreur',
              icon: 'shield',
              value: limit.value,
              unit: limit.unit,
              sub: 'au-delà : plus d’offres ni de mise en ligne',
              tone: 'muted',
            }}
          />
          <KpiTile
            k={{
              label: 'Livreurs au plafond',
              icon: blockedCount ? 'alert' : 'check',
              value: String(blockedCount),
              sub: blockedCount ? 'versement requis' : 'aucun blocage',
              tone: blockedCount ? 'red' : 'green',
              look: blockedCount ? 'alert' : 'mint',
            }}
          />
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
          <Empty icon="check">Aucun livreur.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Livreur</th>
                  <th>Véhicule</th>
                  <th className="num">Cash détenu</th>
                  <th>Plafond</th>
                  <th>Dernier versement</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => {
                  const ratio = overview.data ? Math.min(1, d.cashHeld / Math.max(1, overview.data.cashLimit)) : 0;
                  return (
                    <tr key={d.driverId} className={d.cashBlocked ? 'row-alert' : ''}>
                      <td>
                        <span className="person">
                          <Avatar name={d.name} size="sm" tone="sun" />
                          <span className="person-text">
                            <Link to={`/livreurs/${d.driverId}`} className="person-name">
                              {d.name ?? 'Sans nom'}
                            </Link>
                            <span className="muted small phone">{formatPhone(d.phone)}</span>
                          </span>
                        </span>
                      </td>
                      <td>
                        <Vehicle type={d.vehicleType} />
                      </td>
                      <td className="num">
                        <span className={d.cashBlocked ? 'tone-red' : ''}>{formatFcfa(d.cashHeld)}</span>
                        {d.cashBlocked && (
                          <>
                            {' '}
                            <Badge tone="red">Plafond</Badge>
                          </>
                        )}
                      </td>
                      <td>
                        <span
                          className={`cash-meter${d.cashBlocked ? ' is-over' : ''}`}
                          role="img"
                          aria-label={`${Math.round(ratio * 100)} % du plafond`}
                          title={`${Math.round(ratio * 100)} % du plafond`}
                        >
                          <i style={{ width: `${Math.max(4, Math.round(ratio * 100))}%` }} />
                        </span>
                      </td>
                      <td>
                        <DateTimeCell iso={d.lastDepositAt} />
                      </td>
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
                  );
                })}
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
              <Icon name="close" size={16} />
              Tous les livreurs
            </button>
          ) : null
        }
      >
        <ErrorBanner message={ledger.error} />
        {ledger.loading && !ledger.data ? (
          <Loading />
        ) : !ledger.data || ledger.data.items.length === 0 ? (
          <Empty icon="history">Aucun mouvement.</Empty>
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
                    <td>
                      <DateTimeCell iso={e.createdAt} />
                    </td>
                    <td className="strong">{e.driverName ?? '-'}</td>
                    <td>
                      {e.type === 'COLLECTION' ? <Badge tone="sun">Encaissement</Badge> : <Badge tone="green">Versement</Badge>}
                    </td>
                    <td>
                      {e.orderId ? (
                        <Link to={`/courses/${e.orderId}`} className="tnum">
                          #{e.orderNumber}
                        </Link>
                      ) : null}{' '}
                      {e.note ?? ''}
                      {e.recordedBy && <div className="muted small">par {e.recordedBy.name ?? 'contrôleur'}</div>}
                    </td>
                    <td className={`num ${e.amount < 0 ? 'tone-green' : ''}`}>
                      {e.amount > 0 ? '+' : ''}
                      {formatFcfa(e.amount)}
                    </td>
                    <td className="num muted">{formatFcfa(e.balanceAfter)}</td>
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
