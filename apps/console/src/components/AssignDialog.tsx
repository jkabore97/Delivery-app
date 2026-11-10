import { useState } from 'react';
import { LABELS, type DriverCandidateDto, type VehicleType } from '@yaar/shared';
import { errorMessage } from '../api/client';
import { useApi } from '../auth/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { formatKm, formatPhone } from '../lib/format';
import { Avatar, Badge, Empty, ErrorBanner, Loading, Modal, TableWrap } from './ui';

/** Raison pour laquelle un livreur ne peut pas être affecté (null = affectable). */
export function candidateBlocker(c: DriverCandidateDto): string | null {
  // L'API refuse l'affectation d'un livreur hors ligne (409 DRIVER_OFFLINE) : il ne voit pas la livraison.
  if (!c.isOnline) return 'Hors ligne : appelez-le pour qu’il se connecte';
  if (c.isBusy) return 'Déjà en course';
  if (c.cashBlocked) return 'Plafond de cash atteint';
  return null;
}

export interface AssignDialogProps {
  orderId: string;
  orderNumber: number;
  vehicleType: VehicleType;
  /** Réaffectation d'une livraison déjà ASSIGNED. */
  reassign?: boolean;
  onClose: () => void;
  onAssigned: () => void;
}

/** Affectation manuelle (docs/API.md §8.2) : candidats approuvés du même véhicule, du plus proche au plus loin. */
export function AssignDialog({ orderId, orderNumber, vehicleType, reassign, onClose, onAssigned }: AssignDialogProps) {
  const api = useApi();
  const candidates = useAsync(() => api.candidates(orderId), [api, orderId]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function assign(driverId: string) {
    setBusyId(driverId);
    setError(null);
    try {
      await api.assignOrder(orderId, driverId);
      onAssigned();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusyId(null);
      candidates.reload(true);
    }
  }

  return (
    <Modal
      title={`${reassign ? 'Réaffecter' : 'Affecter'} la livraison #${orderNumber} · ${LABELS.vehicleType[vehicleType]}`}
      onClose={onClose}
      wide
    >
      <ErrorBanner message={error ?? candidates.error} />
      {candidates.loading && !candidates.data ? (
        <Loading />
      ) : candidates.data && candidates.data.length === 0 ? (
        <Empty icon="users">Aucun livreur {LABELS.vehicleType[vehicleType].toLowerCase()} approuvé disponible.</Empty>
      ) : (
        <TableWrap label="Livreurs candidats">
        <table className="table">
          <thead>
            <tr>
              <th>Livreur</th>
              <th>Téléphone</th>
              <th>Distance</th>
              <th>État</th>
              <th aria-label="Action" />
            </tr>
          </thead>
          <tbody>
            {(candidates.data ?? []).map((c) => {
              const blocker = candidateBlocker(c);
              return (
                <tr key={c.id}>
                  <td>
                    <span className="person">
                      <Avatar name={c.name} size="sm" />
                      <span className="person-name">{c.name ?? 'Sans nom'}</span>
                    </span>
                  </td>
                  <td>
                    <a href={`tel:${c.phone}`} className="phone">
                      {formatPhone(c.phone)}
                    </a>
                  </td>
                  <td className="tnum strong">{formatKm(c.distanceKm)}</td>
                  <td>
                    <span className="inline-badges">
                      {c.isOnline ? (
                        <Badge tone="green" dot>
                          En ligne
                        </Badge>
                      ) : (
                        <Badge tone="grey">Hors ligne</Badge>
                      )}
                      {c.isBusy && <Badge tone="blue">En course</Badge>}
                      {c.cashBlocked && <Badge tone="red">Plafond cash</Badge>}
                    </span>
                    {blocker && (
                      <span className="blocker" id={`blocker-${c.id}`}>
                        {blocker}
                      </span>
                    )}
                  </td>
                  <td className="cell-action">
                    <button
                      type="button"
                      className="btn btn-small btn-primary"
                      disabled={blocker !== null || busyId !== null}
                      aria-describedby={blocker ? `blocker-${c.id}` : undefined}
                      onClick={() => void assign(c.id)}
                    >
                      {busyId === c.id ? 'Affectation…' : 'Affecter'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </TableWrap>
      )}
      <p className="hint">
        Seul un livreur en ligne, libre et sous le plafond de cash peut être affecté : un livreur hors ligne doit d’abord se
        connecter (appelez-le). Les offres automatiques en cours sont retirées.
      </p>
    </Modal>
  );
}
