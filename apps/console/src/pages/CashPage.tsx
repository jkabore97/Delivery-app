import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { cashDepositSchema, type CashOverviewDto } from '@yaar/shared';
import { errorMessage } from '../api/client';
import { useApi } from '../auth/AuthContext';
import { CsvExport } from '../components/CsvExport';
import { Badge, Card, Empty, ErrorBanner, Loading, Modal, Pagination, Vehicle } from '../components/ui';
import { useDashboard } from '../hooks/DashboardContext';
import { useAsync, useDebouncedCallback } from '../hooks/useAsync';
import { formatDateTime, formatFcfa, formatPhone } from '../lib/format';
import { useReconnect, useSocketEvent } from '../realtime/RealtimeContext';

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

/** Caisse livreurs : soldes, livreurs au plafond, versements, grand livre. */
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
  // Une course payée en espèces livrée fait monter le cash détenu : on recharge soldes et grand livre.
  const refreshCash = useDebouncedCallback(() => {
    overview.reload(true);
    ledger.reload(true);
  }, 1500);
  useSocketEvent('order.updated', (e) => {
    if (e.status === 'DELIVERED') refreshCash();
  });
  useReconnect(refreshCash);

  const drivers = (overview.data?.drivers ?? []).filter((d) => !onlyBlocked || d.cashBlocked);
  const blockedCount = (overview.data?.drivers ?? []).filter((d) => d.cashBlocked).length;
  const selected = overview.data?.drivers.find((d) => d.driverId === driverId);

  return (
    <div className="page">
      <h1>Caisse livreurs</h1>
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
      <Card title="Export du journal de caisse">
        <CsvExport kind="cash-ledger" label="Exporter le journal de caisse (CSV)" />
      </Card>
    </div>
  );
}
