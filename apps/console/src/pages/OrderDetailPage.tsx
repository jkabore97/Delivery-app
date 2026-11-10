import { useState, type ReactNode } from 'react';
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
import { DeliveryHero } from '../components/DeliveryHero';
import { DeliveryMap } from '../components/DeliveryMap';
import { Icon } from '../components/Icon';
import { PageTitle } from '../components/PageTitle';
import { Badge, Banner, Card, ErrorBanner, KeyValue, Loading, OrderStatusBadge, ReasonDialog, TableWrap, Vehicle } from '../components/ui';
import { useDashboard } from '../hooks/DashboardContext';
import { useAsync, useDebouncedCallback, useNow } from '../hooks/useAsync';
import {
  FEE_PAYER_LABEL,
  ORDER_KIND_LABEL,
  cashSplit,
  isBusinessDelivery,
  legSummary,
  orderKind,
  roleLabel,
  statusLabel,
} from '../lib/delivery';
import { formatDateTime, formatFcfa, formatKm, formatPhone, formatTime } from '../lib/format';
import { POLL_MS } from '../config';
import { usePolling, useSocketEvent } from '../realtime/RealtimeContext';

function Address({ a }: { a: AddressDto | null }) {
  if (!a) return <span className="muted">Masqué</span>;
  return (
    <div>
      <div className="strong">{a.address}</div>
      {a.landmark && <div className="muted">Repère : {a.landmark}</div>}
      <a
        className="small osm-link"
        href={`https://www.openstreetmap.org/?mlat=${a.lat}&mlon=${a.lng}#map=17/${a.lat}/${a.lng}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Voir sur OpenStreetMap <span className="tnum">({a.lat.toFixed(4)}, {a.lng.toFixed(4)})</span>
        <Icon name="external" size={13} />
      </a>
    </div>
  );
}

function Phone({ phone }: { phone: string | null | undefined }) {
  return phone ? (
    <a href={`tel:${phone}`} className="phone">
      {formatPhone(phone)}
    </a>
  ) : (
    <span className="muted">-</span>
  );
}

/** Ligne de la chronologie : « En attente du vendeur → En préparation » ; livraison d'entreprise : « Création · Demande reçue ». */
export function eventLabel(e: OrderEventDto, business = false): string {
  const to = statusLabel(e.toStatus, business);
  const from = e.fromStatus ? `${statusLabel(e.fromStatus, business)} → ` : 'Création · ';
  return `${from}${to}`;
}

export function Timeline({ events, business = false }: { events: OrderEventDto[]; business?: boolean }) {
  if (events.length === 0) return <p className="muted">Aucun événement.</p>;
  return (
    <ol className="timeline">
      {events.map((e) => (
        <li key={e.id} className={`tl-${e.toStatus.toLowerCase()}`}>
          <time dateTime={e.createdAt}>{formatTime(e.createdAt)}</time>
          <div>
            <div className="strong">{eventLabel(e, business)}</div>
            <div className="muted small">
              {e.actorRole ? (business ? roleLabel(e.actorRole) : LABELS.role[e.actorRole]) : 'Système'}
              {e.note ? ` · ${e.note}` : ''}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Lien public de suivi du destinataire : ouvrir (nouvel onglet) ou copier. */
export function TrackingLink({ url }: { url: string }) {
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied('ok');
    } catch {
      setCopied('failed');
    }
  }
  return (
    <div className="tracking-link">
      <code className="tracking-url" title={url}>
        {url}
      </code>
      <div className="actions">
        <a className="btn btn-small btn-ghost" href={url} target="_blank" rel="noopener noreferrer">
          <Icon name="external" size={16} />
          Ouvrir
        </a>
        <button type="button" className="btn btn-small btn-ghost" onClick={() => void copy()}>
          <Icon name="copy" size={16} />
          Copier le lien
        </button>
        {copied === 'ok' && (
          <span className="small tone-green strong" role="status">
            Lien copié
          </span>
        )}
        {copied === 'failed' && (
          <span className="small tone-red" role="status">
            Copie impossible : sélectionnez le lien
          </span>
        )}
      </div>
    </div>
  );
}

function paymentText(o: OrderDto): string {
  const state = o.paymentStatus === 'PAID' ? 'payé' : o.paymentStatus === 'CANCELLED' ? 'annulé' : 'à encaisser';
  return `${LABELS.paymentMethod[o.paymentMethod]} · ${state}`;
}

/** Montants d'une livraison d'entreprise : qui paie les frais, marchandise à encaisser, dû à l'entreprise. */
function BusinessAmounts({ o }: { o: OrderDto }) {
  const cash = cashSplit(o);
  const payer = cash.feePaidBy;
  const owed = o.sellerPayout ?? cash.goods;
  const owedNote =
    o.status === 'CANCELLED'
      ? 'rien (livraison annulée)'
      : o.status === 'DELIVERED'
        ? 'encaissé à la livraison, à reverser (reversements pas encore suivis par la console)'
        : 'une fois encaissé auprès du destinataire';
  const items: Array<[string, ReactNode]> = [
    [
      'Frais de livraison',
      <span key="fee">
        <strong>{formatFcfa(o.deliveryFee)}</strong>
        {payer && <span className="muted"> · payés par : {FEE_PAYER_LABEL[payer]}</span>}
      </span>,
    ],
    ['Marchandise à encaisser', cash.goods > 0 ? `${formatFcfa(cash.goods)} auprès du destinataire` : 'Aucune'],
    ['Encaissé au retrait', cash.atPickup > 0 ? `${formatFcfa(cash.atPickup)} (frais, auprès de l’entreprise)` : 'Rien'],
    [
      'À encaisser à la livraison',
      cash.atDropoff > 0 ? <strong key="drop">{formatFcfa(cash.atDropoff)}</strong> : 'Rien (le destinataire ne paie rien)',
    ],
    [
      'Dû à l’entreprise',
      owed > 0 && o.status !== 'CANCELLED' ? (
        <span key="owed">
          <strong>{formatFcfa(owed)}</strong> <span className="muted">· {owedNote}</span>
        </span>
      ) : (
        'Rien'
      ),
    ],
    ['Commission plateforme', o.commission === null ? '-' : formatFcfa(o.commission)],
    ['Gain livreur', o.driverEarning === null ? '-' : formatFcfa(o.driverEarning)],
    ['Paiement', paymentText(o)],
  ];
  if (o.cashCollected !== null) items.push(['Espèces encaissées', formatFcfa(o.cashCollected)]);
  return <KeyValue items={items} />;
}

/** Montants d'une ancienne commande (parcours client) : articles pour un repas, total client, reversement vendeur. */
function LegacyAmounts({ o }: { o: OrderDto }) {
  return (
    <>
      {o.type === 'FOOD' && o.items.length > 0 && (
        <TableWrap label="Articles">
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
        </TableWrap>
      )}
      <KeyValue
        items={[
          ...(o.type === 'FOOD' ? ([['Articles', formatFcfa(o.itemsTotal)]] as Array<[string, ReactNode]>) : []),
          ['Frais de livraison', formatFcfa(o.deliveryFee)],
          ['Total client', <strong key="t">{formatFcfa(o.total)}</strong>],
          ['Paiement', paymentText(o)],
          ['Commission plateforme', o.commission === null ? '-' : formatFcfa(o.commission)],
          ['Gain livreur', o.driverEarning === null ? '-' : formatFcfa(o.driverEarning)],
          ...(o.type === 'FOOD'
            ? ([['Reversement vendeur', o.sellerPayout === null ? '-' : formatFcfa(o.sellerPayout)]] as Array<[string, ReactNode]>)
            : []),
          ...(o.cashCollected !== null ? ([['Espèces encaissées', formatFcfa(o.cashCollected)]] as Array<[string, ReactNode]>) : []),
        ]}
      />
    </>
  );
}

function DriverCell({ o }: { o: OrderDto }) {
  if (!o.driver) return <span className="muted">Aucun livreur affecté</span>;
  return (
    <span>
      <Link to={`/livreurs/${o.driver.id}`} className="person-name">
        {o.driver.name ?? 'Sans nom'}
      </Link>{' '}
      · <Vehicle type={o.driver.vehicleType} /> {o.driver.plate ? <span className="plate">{o.driver.plate}</span> : null}
      {o.driver.phone ? (
        <>
          {' · '}
          <Phone phone={o.driver.phone} />
        </>
      ) : null}
      {o.driver.lastLocation && (
        <div className="muted small">Dernière position : {formatTime(o.driver.lastLocation.at)}</div>
      )}
    </span>
  );
}

/** Intervenants : entreprise expéditrice, destinataire (sans compte), livreur ; ancienne commande : client et vendeur. */
function Parties({ o }: { o: OrderDto }) {
  const business = isBusinessDelivery(o);
  const recipient: [string, ReactNode] = [
    'Destinataire',
    o.recipientName || o.recipientPhone ? (
      <span>
        {o.recipientName ?? 'Sans nom'}
        {o.recipientIsBusiness ? (
          <>
            {' '}
            <Badge tone="blue">entreprise</Badge>
          </>
        ) : null}
        {' · '}
        <Phone phone={o.recipientPhone} />
      </span>
    ) : (
      <span className="muted">-</span>
    ),
  ];
  if (business) {
    return (
      <KeyValue
        items={[
          [
            'Entreprise',
            o.store ? (
              <span>
                <span className="strong">{o.store.name}</span> · <Phone phone={o.store.phone} />
                {o.client && (
                  <div className="muted small">
                    Compte demandeur : {o.client.name ?? 'Sans nom'}
                    {o.client.phone ? (
                      <>
                        {' · '}
                        <span className="phone">{formatPhone(o.client.phone)}</span>
                      </>
                    ) : null}
                  </div>
                )}
              </span>
            ) : (
              '-'
            ),
          ],
          recipient,
          ['Livreur', <DriverCell key="drv" o={o} />],
        ]}
      />
    );
  }
  return (
    <KeyValue
      items={[
        [
          'Client',
          o.client ? (
            <span>
              {o.client.name ?? 'Sans nom'} · <Phone phone={o.client.phone} />
            </span>
          ) : (
            '-'
          ),
        ],
        ...(o.store
          ? ([
              [
                'Vendeur',
                <span key="st">
                  {o.store.name} · <Phone phone={o.store.phone} />
                </span>,
              ],
            ] as Array<[string, ReactNode]>)
          : []),
        ...(o.recipientName || o.recipientPhone ? [recipient] : []),
        ['Livreur', <DriverCell key="drv" o={o} />],
      ]}
    />
  );
}

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const api = useApi();
  const { refresh: refreshDashboard } = useDashboard();
  const now = useNow(15_000);
  const order = useAsync<OrderDto>(() => api.getOrder(id), [api, id]);
  const [dialog, setDialog] = useState<'assign' | 'cancel' | 'proof' | 'force-deliver' | 'reset-code' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = useDebouncedCallback(() => order.reload(true), 500);
  useSocketEvent('order.updated', (e) => {
    if (e.orderId === id) refresh();
  });
  // Mode poll : statut, position du livreur et itinéraire rechargés tant que la livraison n'est pas terminée
  // (la carte anime le livreur entre deux réponses, sans requête de plus).
  const finished = order.data?.status === 'DELIVERED' || order.data?.status === 'CANCELLED';
  usePolling(() => order.reload(true), POLL_MS.order, !finished);

  // Chargement ou erreur : titre et retour à la liste toujours là ; « Réessayer » seulement si réessayer peut servir.
  if (!order.data) {
    const notFound = order.errorStatus === 404;
    return (
      <div className="page">
        <PageTitle docTitle="Livraison">{notFound ? 'Livraison introuvable' : 'Livraison'}</PageTitle>
        <div className="page-toolbar">
          <Link to="/courses" className="back-link">
            <Icon name="chevronLeft" size={18} />
            Livraisons
          </Link>
        </div>
        {order.loading ? (
          <Loading label="Chargement de la livraison…" />
        ) : (
          <ErrorBanner
            message={notFound ? 'Cette livraison n’existe pas ou n’est plus accessible.' : (order.error ?? 'Livraison introuvable')}
            onRetry={notFound ? undefined : () => order.reload()}
          />
        )}
      </div>
    );
  }
  const o = order.data;
  const business = isBusinessDelivery(o);
  const kind = orderKind(o);
  const canAssign = o.status === 'SEARCHING_DRIVER' || o.status === 'ASSIGNED';
  const canCancel = CONTROLLER_CANCELLABLE_STATUSES.includes(o.status);
  // Livraison récupérée mais bloquée (code perdu / 5 essais) : reprise par la console (§8.2).
  const canForceDeliver = CONTROLLER_FORCE_DELIVER_STATUSES.includes(o.status);
  const pickedUp = o.status === 'PICKED_UP';
  const cash = cashSplit(o);
  const leg = legSummary(o, now);
  const afterChange = () => {
    order.reload(true);
    refreshDashboard();
  };

  return (
    <div className="page">
      <PageTitle docTitle={`Livraison #${o.number}`}>
        Livraison #{o.number} <OrderStatusBadge status={o.status} business={business} />
        {kind !== 'business' && <Badge tone="grey">{ORDER_KIND_LABEL[kind]}</Badge>}
      </PageTitle>
      <div className="page-toolbar">
        <Link to="/courses" className="back-link">
          <Icon name="chevronLeft" size={18} />
          Livraisons
        </Link>
        <div className="actions">
          {/* Une seule action en cobalt (affecter) ; annuler et valider sans code sont des exceptions, en secondaire. */}
          {canCancel && (
            <button type="button" className="btn btn-danger-soft" onClick={() => setDialog('cancel')}>
              <Icon name="close" size={18} />
              Annuler la livraison
            </button>
          )}
          {o.hasProofPhoto && (
            <button type="button" className="btn btn-ghost" onClick={() => setDialog('proof')}>
              <Icon name="camera" size={18} />
              Photo de livraison
            </button>
          )}
          {canForceDeliver && (
            <button type="button" className="btn btn-ghost" onClick={() => setDialog('reset-code')}>
              <Icon name="refresh" size={18} />
              Réinitialiser le code
            </button>
          )}
          {canForceDeliver && (
            <button type="button" className="btn btn-ghost" onClick={() => setDialog('force-deliver')}>
              <Icon name="check" size={18} />
              Valider la livraison
            </button>
          )}
          {canAssign && (
            <button type="button" className="btn btn-primary" onClick={() => setDialog('assign')}>
              <Icon name="user" size={18} />
              {o.status === 'ASSIGNED' ? 'Réaffecter' : 'Affecter un livreur'}
            </button>
          )}
        </div>
      </div>
      <ErrorBanner message={order.error} />
      {notice && (
        <Banner tone="success" role="status">
          {notice}
        </Banner>
      )}
      <DeliveryHero o={o} nowMs={now} stageText={leg.stage} details={leg.details} />
      <div className="detail-grid">
        <div className="stack">
          <Card title="Trajet" aside={o.distanceKm !== null ? <span className="tnum">{formatKm(o.distanceKm)}</span> : undefined}>
            <DeliveryMap order={o} />
            <KeyValue
              items={[
                ['Véhicule', <Vehicle key="v" type={o.vehicleType} />],
                [business ? 'Retrait (entreprise)' : 'Retrait', <Address key="p" a={o.pickup} />],
                ['Livraison', <Address key="d" a={o.dropoff} />],
                ['Distance', formatKm(o.distanceKm)],
                ...(o.parcelDescription ? ([['Colis', o.parcelDescription]] as Array<[string, ReactNode]>) : []),
                ...(o.notes ? ([['Instructions', o.notes]] as Array<[string, ReactNode]>) : []),
                ...(o.cancelReason ? ([['Motif d’annulation', o.cancelReason]] as Array<[string, ReactNode]>) : []),
              ]}
            />
          </Card>
          <Card title="Montants">{business ? <BusinessAmounts o={o} /> : <LegacyAmounts o={o} />}</Card>
        </div>
        <div className="stack">
          <Card title="Intervenants">
            <Parties o={o} />
          </Card>
          {business && (
            <Card title="Suivi du destinataire">
              {o.trackingUrl ? (
                <>
                  <TrackingLink url={o.trackingUrl} />
                  <p className="hint">
                    Lien public envoyé au destinataire (sans compte) : carte en direct, livreur et code de livraison.
                    Ne le transmettez qu’au destinataire. Il expire 24 h après la livraison ou l’annulation.
                  </p>
                </>
              ) : (
                <p className="muted">Lien de suivi indisponible.</p>
              )}
            </Card>
          )}
          <Card title="Chronologie" aside={<span className="tnum">Créée le {formatDateTime(o.createdAt)}</span>}>
            <Timeline events={o.events ?? []} business={business} />
          </Card>
        </div>
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
          title={`Annuler la livraison #${o.number}`}
          confirmLabel="Annuler la livraison"
          cancelLabel="Retour"
          required={false}
          placeholder="Ex. : destinataire injoignable"
          description={
            pickedUp
              ? `Le colis est déjà chez le livreur : un incident « récupérer la marchandise auprès du livreur » sera ouvert et le livreur libéré.${
                  cash.atPickup > 0 ? ` Les frais encaissés au retrait (${formatFcfa(cash.atPickup)}) restent dans la caisse du livreur : à régler avec l’entreprise.` : ''
                } Action enregistrée dans le journal d’audit.`
              : o.status === 'ASSIGNED'
                ? 'Le livreur en route est libéré. Action enregistrée dans le journal d’audit.'
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
          placeholder="Ex. : destinataire joint par téléphone, colis bien reçu"
          description={`La livraison passe à « Livrée » sans code. ${
            cash.atDropoff > 0
              ? `Les espèces à encaisser à la livraison (${formatFcfa(cash.atDropoff)}) sont comptées comme encaissées par le livreur. `
              : 'Aucune somme n’est à encaisser à la livraison. '
          }Action enregistrée dans le journal d’audit.`}
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            await api.forceDeliver(o.id, reason);
            setNotice(`Livraison #${o.number} validée comme livrée.`);
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
          placeholder="Ex. : le destinataire a donné un mauvais code"
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
          notice="Consultation enregistrée dans le journal d’audit."
          load={() => api.proofPhoto(o.id)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
