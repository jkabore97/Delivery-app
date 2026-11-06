import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CONTROLLER_CANCELLABLE_STATUSES,
  CONTROLLER_FORCE_DELIVER_STATUSES,
  LABELS,
  type AddressDto,
  type OrderDto,
  type OrderEventDto,
} from '@yaar/shared';
import { useApi } from '../auth/AuthContext';
import { AssignDialog } from '../components/AssignDialog';
import { BlobViewer } from '../components/BlobViewer';
import {
  Card,
  ErrorBanner,
  KeyValue,
  Loading,
  OrderStatusBadge,
  ReasonDialog,
  Vehicle,
} from '../components/ui';
import { useDashboard } from '../hooks/DashboardContext';
import { useAsync, useDebouncedCallback } from '../hooks/useAsync';
import { formatDateTime, formatFcfa, formatKm, formatPhone, formatTime } from '../lib/format';
import { useSocketEvent } from '../realtime/RealtimeContext';

function Address({ a }: { a: AddressDto | null }) {
  if (!a) return <span className="muted">Masqué</span>;
  return (
    <div>
      <div>{a.address}</div>
      {a.landmark && <div className="muted">Repère : {a.landmark}</div>}
      <a
        className="small"
        href={`https://www.openstreetmap.org/?mlat=${a.lat}&mlon=${a.lng}#map=17/${a.lat}/${a.lng}`}
        target="_blank"
        rel="noreferrer"
      >
        Voir sur la carte ({a.lat.toFixed(4)}, {a.lng.toFixed(4)})
      </a>
    </div>
  );
}

/** Ligne de la chronologie : « 18:57 · En attente du vendeur → En préparation · Vendeur ». */
export function eventLabel(e: OrderEventDto): string {
  const to = LABELS.orderStatus[e.toStatus];
  const from = e.fromStatus ? `${LABELS.orderStatus[e.fromStatus]} → ` : 'Création · ';
  return `${from}${to}`;
}

export function Timeline({ events }: { events: OrderEventDto[] }) {
  if (events.length === 0) return <p className="muted">Aucun événement.</p>;
  return (
    <ol className="timeline">
      {events.map((e) => (
        <li key={e.id} className={`tl-${e.toStatus.toLowerCase()}`}>
          <time dateTime={e.createdAt}>{formatTime(e.createdAt)}</time>
          <div>
            <div className="strong">{eventLabel(e)}</div>
            <div className="muted small">
              {e.actorRole ? LABELS.role[e.actorRole] : 'Système'}
              {e.note ? ` · ${e.note}` : ''}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const api = useApi();
  const { refresh: refreshDashboard } = useDashboard();
  const order = useAsync<OrderDto>(() => api.getOrder(id), [api, id]);
  const [dialog, setDialog] = useState<'assign' | 'cancel' | 'proof' | 'force-deliver' | 'reset-code' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = useDebouncedCallback(() => order.reload(true), 500);
  useSocketEvent('order.updated', (e) => {
    if (e.orderId === id) refresh();
  });

  if (order.loading && !order.data) return <Loading />;
  if (!order.data) return <ErrorBanner message={order.error ?? 'Commande introuvable'} onRetry={() => order.reload()} />;
  const o = order.data;
  const canAssign = o.status === 'SEARCHING_DRIVER' || o.status === 'ASSIGNED';
  const canCancel = CONTROLLER_CANCELLABLE_STATUSES.includes(o.status);
  // Course récupérée mais bloquée (code perdu / 5 essais) : reprise par la console (§8.2).
  const canForceDeliver = CONTROLLER_FORCE_DELIVER_STATUSES.includes(o.status);
  const pickedUp = o.status === 'PICKED_UP';
  const afterChange = () => {
    order.reload(true);
    refreshDashboard();
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>
          Course #{o.number} <OrderStatusBadge status={o.status} />
        </h1>
        <div className="actions">
          {canAssign && (
            <button type="button" className="btn btn-primary" onClick={() => setDialog('assign')}>
              {o.status === 'ASSIGNED' ? 'Réaffecter' : 'Affecter un livreur'}
            </button>
          )}
          {o.hasProofPhoto && (
            <button type="button" className="btn btn-ghost" onClick={() => setDialog('proof')}>
              Photo de livraison
            </button>
          )}
          {canForceDeliver && (
            <button type="button" className="btn btn-ghost" onClick={() => setDialog('reset-code')}>
              Réinitialiser le code
            </button>
          )}
          {canForceDeliver && (
            <button type="button" className="btn btn-primary" onClick={() => setDialog('force-deliver')}>
              Valider la livraison
            </button>
          )}
          {canCancel && (
            <button type="button" className="btn btn-danger-soft" onClick={() => setDialog('cancel')}>
              Annuler la course
            </button>
          )}
        </div>
      </div>
      <ErrorBanner message={order.error} />
      {notice && (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      )}
      <div className="grid-2">
        <Card title="Trajet">
          <KeyValue
            items={[
              ['Type', LABELS.orderType[o.type]],
              ['Véhicule', <Vehicle key="v" type={o.vehicleType} />],
              ['Retrait', <Address key="p" a={o.pickup} />],
              ['Livraison', <Address key="d" a={o.dropoff} />],
              ['Distance', formatKm(o.distanceKm)],
              ...(o.recipientName || o.recipientPhone
                ? ([['Destinataire', `${o.recipientName ?? ''} ${o.recipientPhone ? formatPhone(o.recipientPhone) : ''}`]] as Array<
                    [string, string]
                  >)
                : []),
              ...(o.parcelDescription ? ([['Colis', o.parcelDescription]] as Array<[string, string]>) : []),
              ...(o.notes ? ([['Instructions', o.notes]] as Array<[string, string]>) : []),
              ...(o.cancelReason ? ([['Motif d’annulation', o.cancelReason]] as Array<[string, string]>) : []),
            ]}
          />
        </Card>
        <Card title="Intervenants">
          <KeyValue
            items={[
              [
                'Client',
                o.client ? (
                  <span>
                    {o.client.name ?? 'Sans nom'} ·{' '}
                    {o.client.phone ? <a href={`tel:${o.client.phone}`}>{formatPhone(o.client.phone)}</a> : '-'}
                  </span>
                ) : (
                  '-'
                ),
              ],
              [
                'Vendeur',
                o.store ? (
                  <span>
                    {o.store.name}
                    {o.store.phone ? (
                      <>
                        {' · '}
                        <a href={`tel:${o.store.phone}`}>{formatPhone(o.store.phone)}</a>
                      </>
                    ) : null}
                  </span>
                ) : (
                  '-'
                ),
              ],
              [
                'Livreur',
                o.driver ? (
                  <span>
                    <Link to={`/livreurs/${o.driver.id}`}>{o.driver.name ?? 'Sans nom'}</Link> ·{' '}
                    {o.driver.plate ?? LABELS.vehicleType[o.driver.vehicleType]}
                    {o.driver.phone ? (
                      <>
                        {' · '}
                        <a href={`tel:${o.driver.phone}`}>{formatPhone(o.driver.phone)}</a>
                      </>
                    ) : null}
                    {o.driver.lastLocation && (
                      <div className="muted small">Dernière position : {formatTime(o.driver.lastLocation.at)}</div>
                    )}
                  </span>
                ) : (
                  <span className="muted">Aucun livreur affecté</span>
                ),
              ],
            ]}
          />
        </Card>
        <Card title="Montants">
          {o.items.length > 0 && (
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Article</th>
                  <th className="num">Qté</th>
                  <th className="num">Prix</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {o.items.map((it, idx) => (
                  <tr key={`${it.productId ?? 'x'}-${idx}`}>
                    <td>{it.name}</td>
                    <td className="num">{it.quantity}</td>
                    <td className="num">{formatFcfa(it.unitPrice)}</td>
                    <td className="num">{formatFcfa(it.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <KeyValue
            items={[
              ['Articles', formatFcfa(o.itemsTotal)],
              ['Frais de livraison', formatFcfa(o.deliveryFee)],
              ['Total client', <strong key="t">{formatFcfa(o.total)}</strong>],
              ['Paiement', `${LABELS.paymentMethod[o.paymentMethod]} · ${o.paymentStatus === 'PAID' ? 'payé' : o.paymentStatus === 'CANCELLED' ? 'annulé' : 'à encaisser'}`],
              ['Commission plateforme', o.commission === null ? '-' : formatFcfa(o.commission)],
              ['Gain livreur', o.driverEarning === null ? '-' : formatFcfa(o.driverEarning)],
              ['Reversement vendeur', o.sellerPayout === null ? '-' : formatFcfa(o.sellerPayout)],
              ...(o.cashCollected !== null ? ([['Espèces encaissées', formatFcfa(o.cashCollected)]] as Array<[string, string]>) : []),
            ]}
          />
        </Card>
        <Card title="Chronologie" aside={<span className="muted small">Créée le {formatDateTime(o.createdAt)}</span>}>
          <Timeline events={o.events ?? []} />
        </Card>
      </div>
      {dialog === 'assign' && (
        <AssignDialog
          orderId={o.id}
          orderNumber={o.number}
          vehicleType={o.vehicleType}
          reassign={o.status === 'ASSIGNED'}
          onClose={() => setDialog(null)}
          onAssigned={afterChange}
        />
      )}
      {dialog === 'cancel' && (
        <ReasonDialog
          title={`Annuler la course #${o.number}`}
          confirmLabel="Annuler la course"
          required={false}
          placeholder="Ex. : client injoignable"
          description={
            pickedUp
              ? 'La marchandise est déjà chez le livreur : un incident « récupérer la marchandise auprès du livreur » sera ouvert et le livreur libéré. Action enregistrée dans le journal d’audit.'
              : undefined
          }
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            await api.cancelOrder(o.id, reason || undefined);
            afterChange();
          }}
        />
      )}
      {dialog === 'force-deliver' && (
        <ReasonDialog
          title={`Valider la livraison #${o.number}`}
          confirmLabel="Valider la livraison"
          danger={false}
          placeholder="Ex. : client joint par téléphone, colis bien reçu"
          description={`La course passe à « Livrée » sans code. ${
            o.paymentMethod === 'CASH' ? `Les espèces (${formatFcfa(o.total)}) sont comptées comme encaissées par le livreur. ` : ''
          }Action enregistrée dans le journal d’audit.`}
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            await api.forceDeliver(o.id, reason);
            setNotice(`Course #${o.number} validée comme livrée.`);
            afterChange();
          }}
        />
      )}
      {dialog === 'reset-code' && (
        <ReasonDialog
          title={`Réinitialiser le code de livraison #${o.number}`}
          confirmLabel="Réinitialiser"
          danger={false}
          required={false}
          placeholder="Ex. : client a donné un mauvais code"
          description="À utiliser après « code bloqué » (5 codes incorrects) : le livreur dispose de nouveau de 5 essais. Le code ne change pas. Action enregistrée dans le journal d’audit."
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            await api.resetDeliveryCode(o.id, reason || undefined);
            setNotice('Code de livraison réinitialisé : le livreur peut de nouveau saisir le code.');
            afterChange();
          }}
        />
      )}
      {dialog === 'proof' && (
        <BlobViewer
          title={`Photo de livraison · #${o.number}`}
          notice="Consultation enregistrée dans le journal d'audit."
          load={() => api.proofPhoto(o.id)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
