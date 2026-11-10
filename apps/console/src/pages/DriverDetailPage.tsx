import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LABELS, type DriverDocumentDto, type DriverProfileDto } from '@yaar/shared';
import { errorMessage } from '../api/client';
import { useApi } from '../auth/AuthContext';
import { BlobViewer } from '../components/BlobViewer';
import { Icon } from '../components/Icon';
import { DocsMeter } from '../components/KycQueuePanel';
import { PageTitle } from '../components/PageTitle';
import {
  Avatar,
  Badge,
  Banner,
  Card,
  DriverStatusBadge,
  ErrorBanner,
  KeyValue,
  Loading,
  Modal,
  Rating,
  ReasonDialog,
  TableWrap,
  Vehicle,
} from '../components/ui';
import { useDashboard } from '../hooks/DashboardContext';
import { useAsync } from '../hooks/useAsync';
import { formatDate, formatDateTime, formatFcfa, formatPhone, formatTime } from '../lib/format';
import { documentLabel, kycActions } from '../lib/kyc';

type DialogState =
  | { kind: 'approve' }
  | { kind: 'reject' }
  | { kind: 'suspend' }
  | { kind: 'doc'; doc: DriverDocumentDto }
  | null;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

/** Fiche livreur et revue KYC : visionneuse de pièces, valider / refuser / suspendre / réintégrer. */
export function DriverDetailPage() {
  const { id = '' } = useParams();
  const api = useApi();
  const { refresh: refreshDashboard } = useDashboard();
  const driver = useAsync<DriverProfileDto>(() => api.getDriver(id), [api, id]);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Pièces ouvertes dans cette session (rappel avant validation). */
  const [viewed, setViewed] = useState<ReadonlySet<string>>(() => new Set());

  if (!driver.data) {
    const notFound = driver.errorStatus === 404;
    return (
      <div className="page">
        <PageTitle docTitle="Livreur">{notFound ? 'Livreur introuvable' : 'Livreur'}</PageTitle>
        <div className="page-toolbar">
          <Link to="/livreurs" className="back-link">
            <Icon name="chevronLeft" size={18} />
            Livreurs
          </Link>
        </div>
        {driver.loading ? (
          <Loading label="Chargement du dossier…" />
        ) : (
          <ErrorBanner
            message={notFound ? 'Ce livreur n’existe pas ou n’est plus accessible.' : (driver.error ?? 'Livreur introuvable')}
            onRetry={notFound ? undefined : () => driver.reload()}
          />
        )}
      </div>
    );
  }
  const d = driver.data;
  const actions = kycActions(d);

  function applied(updated: DriverProfileDto, message: string) {
    driver.setData(updated);
    setNotice(message);
    refreshDashboard();
  }

  async function run(fn: () => Promise<DriverProfileDto>, message: string) {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      applied(await fn(), message);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const docsByType = new Map(d.documents.map((doc) => [doc.type, doc]));
  const docTypes = [...new Set([...d.requiredDocuments, ...d.documents.map((doc) => doc.type)])];

  return (
    <div className="page">
      <PageTitle docTitle={d.name ?? 'Livreur'}>
        <span className="profile-title">
          <Avatar name={d.name} tone="sun" />
          {d.name ?? 'Sans nom'}
        </span>
        <DriverStatusBadge status={d.status} />
        {d.isSuspendedUser && <Badge tone="red">Compte suspendu</Badge>}
      </PageTitle>
      <div className="page-toolbar">
        <Link to={d.status === 'PENDING' ? '/kyc' : '/livreurs'} className="back-link">
          <Icon name="chevronLeft" size={18} />
          {d.status === 'PENDING' ? 'Validation KYC' : 'Livreurs'}
        </Link>
        <div className="actions">
          {actions.canReject && (
            <button type="button" className="btn btn-danger-soft" disabled={busy} onClick={() => setDialog({ kind: 'reject' })}>
              <Icon name="close" size={18} />
              Refuser
            </button>
          )}
          {actions.canSuspend && (
            <button type="button" className="btn btn-danger-soft" disabled={busy} onClick={() => setDialog({ kind: 'suspend' })}>
              Suspendre
            </button>
          )}
          {actions.canReinstate && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void run(() => api.reinstateDriver(d.userId), 'Livreur réintégré.')}
            >
              Réintégrer
            </button>
          )}
          {actions.canApprove && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || actions.approveDisabledReason !== null}
              title={actions.approveDisabledReason ?? undefined}
              onClick={() => setDialog({ kind: 'approve' })}
            >
              <Icon name="check" size={18} />
              Valider le dossier
            </button>
          )}
        </div>
      </div>
      {actions.approveDisabledReason && <Banner tone="warn">{actions.approveDisabledReason}.</Banner>}
      <ErrorBanner message={actionError} />
      {notice && (
        <Banner tone="success" role="status">
          {notice}
        </Banner>
      )}
      <div className="grid-2">
        <Card title="Profil">
          <KeyValue
            items={[
              [
                'Téléphone',
                <a key="p" href={`tel:${d.phone}`} className="phone">
                  {formatPhone(d.phone)}
                </a>,
              ],
              ['Véhicule', <Vehicle key="v" type={d.vehicleType} />],
              [
                'Immatriculation',
                d.plate ? (
                  <span key="pl" className="plate">
                    {d.plate}
                  </span>
                ) : d.vehicleType === 'BIKE' ? (
                  'Non requise (vélo)'
                ) : (
                  <span className="tone-red strong">Manquante</span>
                ),
              ],
              ['Statut', LABELS.driverStatus[d.status]],
              ...(d.rejectionReason ? ([['Motif du refus', d.rejectionReason]] as Array<[string, string]>) : []),
              ...(d.suspensionReason ? ([['Motif de suspension', d.suspensionReason]] as Array<[string, string]>) : []),
              ['Disponibilité', d.isOnline ? (d.isBusy ? 'En ligne · en course' : 'En ligne') : 'Hors ligne'],
              [
                'Suivi GPS',
                d.trackingConsentAt ? (
                  `Consentement donné le ${formatDateTime(d.trackingConsentAt)}`
                ) : (
                  <span key="g" className="tone-orange strong">Consentement non donné (ne peut pas passer en ligne)</span>
                ),
              ],
              ['Note', d.ratingAvg === null ? '-' : <Rating key="r" avg={d.ratingAvg} count={d.ratingCount} />],
              [
                'Cash détenu',
                <span key="c" className={d.cashBlocked ? 'tone-red strong' : ''}>
                  <span className="money">{formatFcfa(d.cashHeld)}</span> / <span className="money">{formatFcfa(d.cashLimit)}</span>
                  {d.cashBlocked ? ' · plafond atteint' : ''} · <Link to={`/caisse?driverId=${d.userId}`}>Caisse</Link>
                </span>,
              ],
              ['Inscrit le', formatDate(d.createdAt)],
              ['Validé le', formatDate(d.approvedAt)],
            ]}
          />
        </Card>
        <Card title="Pièces du dossier" aside={<DocsMeter profile={d} />}>
          <p className="hint">
            Les pièces sont protégées et ne sont jamais préchargées. Chaque consultation est enregistrée dans le{' '}
            <Link to="/audit?action=DRIVER_DOCUMENT_VIEWED&entityType=DriverDocument">journal d’audit</Link> ·{' '}
            <Link to={`/audit?entityType=DriverProfile&entityId=${encodeURIComponent(d.userId)}`}>historique du dossier</Link>.
          </p>
          <TableWrap label="Pièces du dossier">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Pièce</th>
                  <th>État</th>
                  <th>Expiration</th>
                  <th>Déposée</th>
                  <th aria-label="Action" />
                </tr>
              </thead>
              <tbody>
                {docTypes.map((type) => {
                  const doc = docsByType.get(type);
                  return (
                    <tr key={type}>
                      <td className="strong">{documentLabel(type)}</td>
                      <td>
                        {!doc ? (
                          <Badge tone="grey">Manquante</Badge>
                        ) : doc.isExpired ? (
                          <Badge tone="red">Expirée</Badge>
                        ) : (
                          <Badge tone="green">Fournie</Badge>
                        )}
                      </td>
                      <td className={`tnum ${doc?.isExpired ? 'tone-red strong' : ''}`}>{doc?.expiresAt ? formatDate(doc.expiresAt) : '-'}</td>
                      <td className="tnum nowrap">
                        {doc ? (
                          <span className="datetime">
                            <time dateTime={doc.uploadedAt}>{formatDate(doc.uploadedAt)}</time>
                            <span className="muted small">
                              {formatTime(doc.uploadedAt)} · {formatSize(doc.sizeBytes)}
                            </span>
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="cell-action">
                        {doc && (
                          <button
                            type="button"
                            className={`btn btn-small ${viewed.has(doc.id) ? 'btn-ghost' : 'btn-soft'}`}
                            onClick={() => {
                              setViewed((prev) => new Set(prev).add(doc.id));
                              setDialog({ kind: 'doc', doc });
                            }}
                          >
                            <Icon name={viewed.has(doc.id) ? 'check' : 'eye'} size={16} />
                            {viewed.has(doc.id) ? 'Revoir' : 'Voir'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      </div>
      {dialog?.kind === 'approve' && (
        <Modal title={`Valider le dossier de ${d.name ?? 'ce livreur'}`} onClose={() => setDialog(null)}>
          <div className="form">
            {d.documents.some((doc) => !viewed.has(doc.id)) && (
              <Banner tone="warn" role="alert">
                Vous n’avez pas ouvert toutes les pièces :{' '}
                {d.documents
                  .filter((doc) => !viewed.has(doc.id))
                  .map((doc) => documentLabel(doc.type))
                  .join(', ')}
                .
              </Banner>
            )}
            <p>
              Vous confirmez avoir vérifié les pièces (identité, permis, carte grise, assurance, selfie) de ce livreur.
              Une fois validé, il pourra se mettre en ligne et recevoir des livraisons.
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setDialog(null)} disabled={busy}>
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => {
                  setDialog(null);
                  void run(() => api.approveDriver(d.userId), 'Dossier validé : le livreur peut se mettre en ligne.');
                }}
              >
                <Icon name="check" size={18} />
                Je confirme, valider
              </button>
            </div>
          </div>
        </Modal>
      )}
      {dialog?.kind === 'reject' && (
        <ReasonDialog
          title={`Refuser le dossier de ${d.name ?? 'ce livreur'}`}
          label="Motif du refus (communiqué au livreur)"
          placeholder="Ex. : assurance expirée, photo illisible"
          confirmLabel="Refuser le dossier"
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => applied(await api.rejectDriver(d.userId, reason), 'Dossier refusé.')}
        />
      )}
      {dialog?.kind === 'suspend' && (
        <ReasonDialog
          title={`Suspendre ${d.name ?? 'ce livreur'}`}
          label="Motif de la suspension"
          confirmLabel="Suspendre"
          description={
            d.isBusy
              ? 'Ce livreur est en course : réaffectez, validez ou annulez sa livraison avant de le suspendre (sinon l’API refuse).'
              : undefined
          }
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => applied(await api.suspendDriver(d.userId, reason), 'Livreur suspendu et mis hors ligne.')}
        />
      )}
      {dialog?.kind === 'doc' && (
        <BlobViewer
          title={`${documentLabel(dialog.doc.type)} · ${d.name ?? ''}`}
          notice="Consultation enregistrée dans le journal d’audit (DRIVER_DOCUMENT_VIEWED)."
          load={() => api.driverDocument(d.userId, dialog.doc.id)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
