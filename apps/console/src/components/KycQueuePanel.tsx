import { Link } from 'react-router-dom';
import { LABELS, type DriverProfileDto } from '@yaar/shared';
import { initials } from '../lib/format';
import { kycActions } from '../lib/kyc';
import { DocumentChips } from './DocumentChips';
import { Card, Empty } from './ui';

/**
 * « Dossiers livreurs à valider » : file FIFO des dossiers PENDING.
 * Pas de validation en un clic : la décision se prend sur la fiche, après consultation
 * des pièces (chaque consultation est journalisée dans l'audit).
 */
export function KycQueuePanel({ drivers, total }: { drivers: DriverProfileDto[]; total: number }) {
  return (
    <Card title="Dossiers livreurs à valider" aside={<span className="muted">{total}</span>}>
      {drivers.length === 0 ? (
        <Empty>Aucun dossier en attente.</Empty>
      ) : (
        <ul className="kyc-list">
          {drivers.map((d) => {
            const actions = kycActions(d);
            return (
              <li key={d.userId} className="kyc-item">
                <span className="avatar" aria-hidden="true">
                  {initials(d.name)}
                </span>
                <div className="kyc-main">
                  <div>
                    <Link to={`/kyc/${d.userId}`} className="strong">
                      {d.name ?? 'Sans nom'}
                    </Link>{' '}
                    · {LABELS.vehicleType[d.vehicleType]} {d.plate ?? ''}
                  </div>
                  <DocumentChips profile={d} />
                </div>
                <Link
                  to={`/kyc/${d.userId}`}
                  className={`btn btn-small ${actions.approveDisabledReason ? 'btn-danger-soft' : 'btn-primary'}`}
                  title={actions.approveDisabledReason ?? 'Vérifier les pièces puis valider ou refuser'}
                >
                  {actions.approveDisabledReason ? 'Examiner' : 'Vérifier'}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {total > drivers.length && (
        <p className="card-foot">
          <Link to="/kyc">Voir les {total} dossiers →</Link>
        </p>
      )}
    </Card>
  );
}
