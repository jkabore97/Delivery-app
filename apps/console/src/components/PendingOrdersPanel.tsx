import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LABELS, type PendingOrderDto } from '@yaar/shared';
import { useNow } from '../hooks/useAsync';
import { formatWaiting } from '../lib/format';
import { AssignDialog } from './AssignDialog';
import { Icon } from './Icon';
import { Card, Empty, VEHICLE_ICON } from './ui';

export const LONG_WAIT_SECONDS = 5 * 60;

/** Attente actuelle = attente au chargement + temps écoulé depuis. */
export function currentWaitingSeconds(o: PendingOrderDto, fetchedAt: number, now: number): number {
  return o.waitingSeconds + Math.max(0, Math.floor((now - fetchedAt) / 1000));
}

/**
 * « Livraisons en attente » d'un livreur : une ligne par livraison (véhicule, n°, trajet, attente en grand, corail
 * au-delà de 5 min), affectation manuelle en un clic.
 */
export function PendingOrdersPanel({
  orders,
  fetchedAt,
  onChanged,
  limit,
}: {
  orders: PendingOrderDto[];
  fetchedAt: number;
  onChanged: () => void;
  limit?: number;
}) {
  const now = useNow(1000);
  const [assigning, setAssigning] = useState<PendingOrderDto | null>(null);
  const shown = limit ? orders.slice(0, limit) : orders;

  return (
    <Card
      title={
        <>
          Livraisons en attente
          {orders.length > 0 && (
            <span className="count" aria-hidden="true">
              {orders.length}
            </span>
          )}
        </>
      }
      sub={
        <>
          {orders.length > 0 && <span className="sr-only">{orders.length} en attente · </span>}
          Affectation automatique activée
        </>
      }
    >
      {orders.length === 0 ? (
        <Empty icon="check" compact>
          Aucune livraison en attente de livreur.
        </Empty>
      ) : (
        <ul className="rows" aria-label="Livraisons en attente d’un livreur">
          {shown.map((o) => {
            const waiting = currentWaitingSeconds(o, fetchedAt, now);
            const long = waiting >= LONG_WAIT_SECONDS;
            const offerLeft = o.currentOffer
              ? Math.max(0, Math.ceil((new Date(o.currentOffer.expiresAt).getTime() - now) / 1000))
              : 0;
            return (
              <li key={o.id} className="row row-grid">
                <span className="vehicle-disc row-lead" title={LABELS.vehicleType[o.vehicleType]}>
                  <Icon name={VEHICLE_ICON[o.vehicleType]} size={20} />
                  <span className="sr-only">{LABELS.vehicleType[o.vehicleType]}</span>
                </span>
                <div className="row-head row-title">
                  <Link to={`/courses/${o.id}`} className="tnum">
                    #{o.number}
                  </Link>
                  <span className="sr-only">attente</span>
                  <span
                    className={`wait ${long ? 'tone-red' : ''}`}
                    data-testid={`wait-${o.number}`}
                    title={long ? 'Attente d’un livreur : plus de 5 min' : 'Attente d’un livreur'}
                  >
                    {formatWaiting(waiting)}
                  </span>
                </div>
                <div className="row-end">
                  {o.currentOffer && offerLeft > 0 ? (
                    <button
                      type="button"
                      className="btn btn-small btn-soft"
                      title={`Offre en cours à ${o.currentOffer.driverName ?? 'un livreur'} (${offerLeft} s) · cliquer pour forcer`}
                      onClick={() => setAssigning(o)}
                    >
                      Auto… {offerLeft}{'\u00a0'}s
                    </button>
                  ) : (
                    // Cobalt plein seulement pour une attente longue (l'urgence de la file) ; sinon bouton doux.
                    <button
                      type="button"
                      className={`btn btn-small ${long ? 'btn-primary' : 'btn-soft'}`}
                      onClick={() => setAssigning(o)}
                    >
                      Affecter
                    </button>
                  )}
                </div>
                <div className="row-extra row-sub" title={`${o.pickupAddress} → ${o.dropoffAddress}`}>
                  {o.pickupAddress} → {o.dropoffAddress}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {limit && orders.length > limit && (
        <p className="card-foot">
          <Link to="/courses?status=SEARCHING_DRIVER" className="card-link">
            Voir les {orders.length} livraisons en attente
            <Icon name="chevronRight" size={16} />
          </Link>
        </p>
      )}
      {assigning && (
        <AssignDialog
          orderId={assigning.id}
          orderNumber={assigning.number}
          vehicleType={assigning.vehicleType}
          onClose={() => setAssigning(null)}
          onAssigned={onChanged}
        />
      )}
    </Card>
  );
}
