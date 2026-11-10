import { Link } from 'react-router-dom';
import { LABELS, type DriverProfileDto } from '@yaar/shared';
import { chipText, documentChips, kycActions } from '../lib/kyc';
import { Icon } from './Icon';
import { Avatar, Card, Empty } from './ui';

/** Avancement d'un dossier : une barre par pièce exigée (menthe fournie, corail expirée, grise manquante). */
export function DocsMeter({ profile }: { profile: Pick<DriverProfileDto, 'requiredDocuments' | 'documents'> }) {
  const chips = documentChips(profile);
  const ok = chips.filter((c) => c.state === 'ok').length;
  const problems = chips.filter((c) => c.state !== 'ok');
  const text = problems.length
    ? `${chipText(problems[0]!)}${problems.length > 1 ? ` · ${problems.length - 1} autre${problems.length > 2 ? 's' : ''}` : ''}`
    : `${ok}/${chips.length} pièces fournies`;
  return (
    <div className="docs-meter">
      <span className="docs-meter-bar" aria-hidden="true">
        {chips.map((c) => (
          <i key={c.type} className={c.state} />
        ))}
      </span>
      <span className={`docs-meter-text ${problems.length ? 'tone-red' : ''}`}>{text}</span>
    </div>
  );
}

/**
 * « Dossiers livreurs à valider » : file FIFO des dossiers PENDING.
 * Pas de validation en un clic : la décision se prend sur la fiche, après consultation
 * des pièces (chaque consultation est journalisée dans l'audit).
 */
export function KycQueuePanel({ drivers, total }: { drivers: DriverProfileDto[]; total: number }) {
  return (
    <Card
      title={
        <>
          Dossiers livreurs à valider
          {total > 0 && (
            <span className="count" aria-hidden="true">
              {total}
            </span>
          )}
        </>
      }
    >
      {drivers.length === 0 ? (
        <Empty icon="check" compact>
          Aucun dossier en attente.
        </Empty>
      ) : (
        <ul className="rows kyc-list">
          {drivers.map((d) => {
            const actions = kycActions(d);
            return (
              <li key={d.userId} className="row row-grid kyc-item">
                <span className="row-lead">
                  <Avatar name={d.name} />
                </span>
                <div className="row-head">
                  <div className="row-main">
                    <div className="row-title">
                      <Link to={`/kyc/${d.userId}`}>{d.name ?? 'Sans nom'}</Link>
                    </div>
                    <div className="row-sub">
                      {LABELS.vehicleType[d.vehicleType]}
                      {d.plate ? ` · ${d.plate}` : ''}
                    </div>
                  </div>
                </div>
                <div className="row-end">
                  <Link
                    to={`/kyc/${d.userId}`}
                    className={`btn btn-small ${actions.approveDisabledReason ? 'btn-ghost' : 'btn-soft'}`}
                    title={actions.approveDisabledReason ?? 'Vérifier les pièces puis valider ou refuser'}
                  >
                    {actions.approveDisabledReason ? 'Examiner' : 'Vérifier'}
                  </Link>
                </div>
                <div className="row-extra">
                  <DocsMeter profile={d} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {total > drivers.length && (
        <p className="card-foot">
          <Link to="/kyc" className="card-link">
            Voir les {total} dossiers
            <Icon name="chevronRight" size={16} />
          </Link>
        </p>
      )}
    </Card>
  );
}
