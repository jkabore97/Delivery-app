import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ACTIVE_ORDER_STATUSES, LABELS, ORDER_STATUSES, ORDER_TYPES, type OrderDto, type OrderStatus } from '@yaar/shared';
import { useApi } from '../auth/AuthContext';
import { CsvExport } from '../components/CsvExport';
import { Icon } from '../components/Icon';
import { PageTitle } from '../components/PageTitle';
import { Badge, BizMark, Card, DateTimeCell, Empty, ErrorBanner, FilterSelect, Loading, OrderStatusBadge, Pagination, TableWrap, Vehicle } from '../components/ui';
import { useAsync, useDebouncedCallback, useNow } from '../hooks/useAsync';
import { etaCell, isBusinessDelivery, orderKind } from '../lib/delivery';
import { formatFcfa } from '../lib/format';
import { enumParam, pageParam } from '../lib/params';
import { POLL_MS } from '../config';
import { usePolling, useSocketEvent } from '../realtime/RealtimeContext';

const PAGE_SIZE = 20;

/** Statuts d'une livraison d'entreprise (les autres ne concernent que les anciennes commandes repas). */
const DELIVERY_STATUSES: OrderStatus[] = ['SEARCHING_DRIVER', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'CANCELLED'];
const LEGACY_STATUSES: OrderStatus[] = ORDER_STATUSES.filter((s) => !DELIVERY_STATUSES.includes(s));

/** Valeur du filtre de statut : un statut, « ACTIVE » (tous les statuts non terminaux) ou vide. */
export function statusFilterToList(value: string | null): OrderStatus[] | undefined {
  if (!value) return undefined;
  if (value === 'ACTIVE') return [...ACTIVE_ORDER_STATUSES];
  const list = value.split(',').filter((s): s is OrderStatus => (ORDER_STATUSES as string[]).includes(s));
  return list.length ? list : undefined;
}

/** Entreprise expéditrice (ancienne commande : boutique ou client). */
function SenderCell({ o }: { o: OrderDto }) {
  const kind = orderKind(o);
  if (kind === 'business')
    return (
      <span className="person">
        <BizMark name={o.store?.name} />
        <span className="person-name">{o.store?.name ?? '-'}</span>
      </span>
    );
  return (
    <span>
      {kind === 'legacyFood' ? (o.store?.name ?? '-') : (o.client?.name ?? o.client?.phone ?? '-')}
      <div className="muted small">{kind === 'legacyFood' ? 'commande repas (ancien)' : 'client (ancien)'}</div>
    </span>
  );
}

function RecipientCell({ o }: { o: OrderDto }) {
  const name = o.recipientName ?? (isBusinessDelivery(o) ? null : (o.client?.name ?? null));
  return (
    <span>
      <span className="strong">{name ?? '-'}</span>
      {o.recipientIsBusiness ? (
        <>
          {' '}
          <Badge tone="blue">entreprise</Badge>
        </>
      ) : null}
      {o.dropoff?.address && <div className="muted small">{o.dropoff.address}</div>}
    </span>
  );
}

/** « 1 950 » : montant sans l'unité (déjà écrite sur le total au-dessus). */
const bare = (n: number) => formatFcfa(n).replace(/\s*FCFA$/, '');

/** Total, puis le détail sur une seule ligne (frais, marchandise) : la ligne du tableau garde deux niveaux. */
function AmountCell({ o }: { o: OrderDto }) {
  const goods = o.cashToCollect ?? 0;
  return (
    <span>
      <span className="money">{formatFcfa(o.total)}</span>
      <div className="muted small amount-detail">
        frais {bare(o.deliveryFee)}
        {goods > 0 ? ` · marchandise ${bare(goods)}` : ''}
      </div>
    </span>
  );
}

/** Livraisons : liste filtrable (statut, type, recherche), rafraîchie en mode poll. */
export function OrdersPage() {
  const api = useApi();
  const navigate = useNavigate();
  const now = useNow(30_000);
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const type = enumParam(params.get('type'), ORDER_TYPES);
  const q = params.get('q') ?? '';
  const page = pageParam(params.get('page'));
  const [qInput, setQInput] = useState(q);
  useEffect(() => setQInput(q), [q]);

  const orders = useAsync(
    () =>
      api.listOrders({
        status: statusFilterToList(status),
        type: type || undefined,
        q: q || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    [api, status, type, q, page],
  );
  const refresh = useDebouncedCallback(() => orders.reload(true), 1000);
  useSocketEvent('order.updated', refresh);
  usePolling(() => orders.reload(true), POLL_MS.orders);

  function update(next: Record<string, string>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (!('page' in next)) p.delete('page');
    setParams(p);
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    update({ q: qInput.trim() });
  }

  return (
    <div className="page">
      <PageTitle>Livraisons</PageTitle>
      <Card>
        <div className="filters">
          <FilterSelect label="Statut" value={status} onChange={(v) => update({ status: v })}>
            <option value="">Tous</option>
            <option value="ACTIVE">En cours (non terminées)</option>
            {DELIVERY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LABELS.orderStatus[s]}
              </option>
            ))}
            <optgroup label="Ancien parcours (commandes repas)">
              {LEGACY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LABELS.orderStatus[s]}
                </option>
              ))}
            </optgroup>
          </FilterSelect>
          <FilterSelect label="Type" value={type} onChange={(v) => update({ type: v })}>
            <option value="">Tous</option>
            <option value="PARCEL">Colis (livraisons d’entreprise)</option>
            <option value="FOOD">Repas (ancien parcours)</option>
          </FilterSelect>
          <form onSubmit={onSearch} className="filter-search">
            <label>
              Recherche
              <input
                type="search"
                placeholder="N° (#1048), nom ou téléphone du compte demandeur"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
              />
            </label>
            <button type="submit" className="btn btn-ghost">
              <Icon name="search" size={18} />
              Rechercher
            </button>
          </form>
          {q && (
            <Link to={`/livreurs?q=${encodeURIComponent(q)}`} className="card-link filters-note">
              Chercher « {q} » parmi les livreurs
              <Icon name="chevronRight" size={16} />
            </Link>
          )}
        </div>
        <ErrorBanner message={orders.error} onRetry={() => orders.reload()} />
        {!orders.data ? (
          orders.loading ? <Loading /> : null
        ) : orders.data.items.length === 0 ? (
          <Empty icon="search">Aucune livraison ne correspond à ces critères.</Empty>
        ) : (
          <TableWrap label="Livraisons">
            <table className="table table-clickable">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Entreprise</th>
                  <th>Destinataire</th>
                  <th>Statut</th>
                  <th>Véh.</th>
                  <th className="num">Montant</th>
                  <th>Arrivée</th>
                  <th>Créée</th>
                </tr>
              </thead>
              <tbody>
                {orders.data.items.map((o) => {
                  const eta = etaCell(o.etaMinutes, now);
                  return (
                    <tr key={o.id} onClick={() => navigate(`/courses/${o.id}`)}>
                      <td>
                        <Link to={`/courses/${o.id}`} className="table-link" onClick={(e) => e.stopPropagation()}>
                          #{o.number}
                        </Link>
                      </td>
                      <td>
                        <SenderCell o={o} />
                      </td>
                      <td className="cell-wide">
                        <RecipientCell o={o} />
                      </td>
                      <td>
                        <OrderStatusBadge status={o.status} business={isBusinessDelivery(o)} />
                        {o.driver?.name && <div className="muted small">{o.driver.name}</div>}
                      </td>
                      <td>
                        <Vehicle type={o.vehicleType} withLabel={false} />
                      </td>
                      <td className="num">
                        <AmountCell o={o} />
                      </td>
                      <td className="nowrap tnum">
                        {eta ? (
                          <span title="Estimation d’arrivée chez le destinataire">
                            <span className="strong">{eta.duration}</span>
                            {eta.clock && <div className="muted small">vers {eta.clock}</div>}
                          </span>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                      <td>
                        <DateTimeCell iso={o.createdAt} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
        {orders.data && (
          <Pagination
            page={orders.data.page}
            pageSize={orders.data.pageSize}
            total={orders.data.total}
            onPage={(p) => update({ page: String(p) })}
          />
        )}
      </Card>
      <Card title="Export comptable des livraisons">
        <CsvExport kind="orders" label="Exporter les livraisons (CSV)" />
      </Card>
    </div>
  );
}
