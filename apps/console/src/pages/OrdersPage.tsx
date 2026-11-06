import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ACTIVE_ORDER_STATUSES, LABELS, ORDER_STATUSES, ORDER_TYPES, type OrderStatus } from '@yaar/shared';
import { useApi } from '../auth/AuthContext';
import { Card, Empty, ErrorBanner, Loading, OrderStatusBadge, Pagination, Vehicle } from '../components/ui';
import { useAsync, useDebouncedCallback } from '../hooks/useAsync';
import { formatDateTime, formatFcfa } from '../lib/format';
import { enumParam, pageParam } from '../lib/params';
import { useSocketEvent } from '../realtime/RealtimeContext';

const PAGE_SIZE = 20;

/** Valeur du filtre de statut : un statut, « ACTIVE » (tous les statuts non terminaux) ou vide. */
export function statusFilterToList(value: string | null): OrderStatus[] | undefined {
  if (!value) return undefined;
  if (value === 'ACTIVE') return [...ACTIVE_ORDER_STATUSES];
  const list = value.split(',').filter((s): s is OrderStatus => (ORDER_STATUSES as string[]).includes(s));
  return list.length ? list : undefined;
}

export function OrdersPage() {
  const api = useApi();
  const navigate = useNavigate();
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
      <h1>Courses</h1>
      <Card>
        <div className="filters">
          <label>
            Statut
            <select value={status} onChange={(e) => update({ status: e.target.value })}>
              <option value="">Tous</option>
              <option value="ACTIVE">En cours (non terminées)</option>
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LABELS.orderStatus[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select value={type} onChange={(e) => update({ type: e.target.value })}>
              <option value="">Tous</option>
              <option value="FOOD">{LABELS.orderType.FOOD}</option>
              <option value="PARCEL">{LABELS.orderType.PARCEL}</option>
            </select>
          </label>
          <form onSubmit={onSearch} className="filter-search">
            <label>
              Recherche
              <input
                type="search"
                placeholder="N° (#1048), téléphone ou nom du client"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
              />
            </label>
            <button type="submit" className="btn btn-primary">
              Rechercher
            </button>
          </form>
          {q && (
            <Link to={`/livreurs?q=${encodeURIComponent(q)}`} className="small">
              Chercher « {q} » parmi les livreurs →
            </Link>
          )}
        </div>
        <ErrorBanner message={orders.error} onRetry={() => orders.reload()} />
        {orders.loading && !orders.data ? (
          <Loading />
        ) : !orders.data || orders.data.items.length === 0 ? (
          <Empty>Aucune course ne correspond à ces critères.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table table-clickable">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Type</th>
                  <th>Statut</th>
                  <th>Client</th>
                  <th>Vendeur</th>
                  <th>Livreur</th>
                  <th>Véh.</th>
                  <th className="num">Total</th>
                  <th>Créée</th>
                </tr>
              </thead>
              <tbody>
                {orders.data.items.map((o) => (
                  <tr key={o.id} onClick={() => navigate(`/courses/${o.id}`)}>
                    <td>
                      <Link to={`/courses/${o.id}`} className="strong" onClick={(e) => e.stopPropagation()}>
                        #{o.number}
                      </Link>
                    </td>
                    <td>{LABELS.orderType[o.type]}</td>
                    <td>
                      <OrderStatusBadge status={o.status} />
                    </td>
                    <td>{o.client?.name ?? o.client?.phone ?? '-'}</td>
                    <td>{o.store?.name ?? '-'}</td>
                    <td>{o.driver?.name ?? '-'}</td>
                    <td>
                      <Vehicle type={o.vehicleType} withLabel={false} />
                    </td>
                    <td className="num">{formatFcfa(o.total)}</td>
                    <td>{formatDateTime(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
    </div>
  );
}
