import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { PendingOrderDto } from '@yaar/shared';
import { useNow } from '../hooks/useAsync';
import { formatWaiting } from '../lib/format';
import { AssignDialog } from './AssignDialog';
import { Card, Empty, Vehicle } from './ui';

export const LONG_WAIT_SECONDS = 5 * 60;

/** Attente actuelle = attente au chargement + temps écoulé depuis. */
export function currentWaitingSeconds(o: PendingOrderDto, fetchedAt: number, now: number): number {
  return o.waitingSeconds + Math.max(0, Math.floor((now - fetchedAt) / 1000));
}

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
      title="Commandes en attente"
      aside={
        <span className="muted">
          {orders.length > 0 ? `${orders.length} en attente · ` : ''}Affectation auto activée
        </span>
      }
    >
      {orders.length === 0 ? (
        <Empty>Aucune commande en attente de livreur.</Empty>
      ) : (
        <table className="table table-compact">
          <thead>
            <tr>
              <th>#</th>
              <th>Trajet</th>
              <th>Véh.</th>
              <th>Attente</th>
              <th aria-label="Action" />
            </tr>
          </thead>
          <tbody>
            {shown.map((o) => {
              const waiting = currentWaitingSeconds(o, fetchedAt, now);
              const offerLeft = o.currentOffer
                ? Math.max(0, Math.ceil((new Date(o.currentOffer.expiresAt).getTime() - now) / 1000))
                : 0;
              return (
                <tr key={o.id}>
                  <td>
                    <Link to={`/courses/${o.id}`} className="strong">
                      {o.number}
                    </Link>
                  </td>
                  <td className="cell-route">
                    {o.pickupAddress} → {o.dropoffAddress}
                  </td>
                  <td>
                    <Vehicle type={o.vehicleType} withLabel={false} />
                  </td>
                  <td className={waiting >= LONG_WAIT_SECONDS ? 'tone-red strong' : ''} data-testid={`wait-${o.number}`}>
                    {formatWaiting(waiting)}
                  </td>
                  <td className="cell-action">
                    {o.currentOffer && offerLeft > 0 ? (
                      <button
                        type="button"
                        className="btn btn-small btn-soft"
                        title={`Offre en cours à ${o.currentOffer.driverName ?? 'un livreur'} (${offerLeft} s) · cliquer pour forcer`}
                        onClick={() => setAssigning(o)}
                      >
                        Auto… {offerLeft}s
                      </button>
                    ) : (
                      <button type="button" className="btn btn-small btn-primary" onClick={() => setAssigning(o)}>
                        Affecter
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {limit && orders.length > limit && (
        <p className="card-foot">
          <Link to="/courses?status=SEARCHING_DRIVER">Voir les {orders.length} commandes en attente →</Link>
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
