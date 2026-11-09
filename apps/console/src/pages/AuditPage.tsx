import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LABELS } from '@yaar/shared';
import { useApi } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { PageTitle } from '../components/PageTitle';
import { Avatar, Card, DateTimeCell, Empty, ErrorBanner, FilterSelect, Loading, Pagination } from '../components/ui';
import { useAsync } from '../hooks/useAsync';

/** Libellés des actions auditées (docs/API.md §8.9). */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  DRIVER_DOCUMENT_VIEWED: 'Consultation d’une pièce livreur',
  DRIVER_APPROVED: 'Dossier livreur validé',
  DRIVER_REJECTED: 'Dossier livreur refusé',
  DRIVER_SUSPENDED: 'Livreur suspendu',
  DRIVER_REINSTATED: 'Livreur réintégré',
  USER_SUSPENDED: 'Compte suspendu',
  USER_UNSUSPENDED: 'Compte réactivé',
  STAFF_CREATED: 'Membre de l’équipe créé',
  PRICING_RULE_UPDATED: 'Tarif modifié',
  STORE_UPDATED_BY_CONTROLLER: 'Entreprise modifiée',
  STORE_APPROVED: 'Entreprise validée',
  STORE_SUSPENDED: 'Entreprise refusée ou suspendue',
  CASH_DEPOSIT_RECORDED: 'Versement enregistré',
  ORDER_MANUALLY_ASSIGNED: 'Livraison affectée manuellement',
  ORDER_CANCELLED_BY_CONTROLLER: 'Livraison annulée par un contrôleur',
  ORDER_FORCE_DELIVERED: 'Livraison validée sans code',
  ORDER_DELIVERY_CODE_RESET: 'Code de livraison réinitialisé',
  ORDER_PROOF_VIEWED: 'Consultation d’une photo de livraison',
  INCIDENT_UPDATED: 'Incident mis à jour',
  DATA_EXPORTED: 'Export de données',
};

/** Libellés français des objets audités (noms d'entités côté API). */
export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  DriverDocument: 'Pièce livreur',
  DriverProfile: 'Dossier livreur',
  User: 'Compte',
  Order: 'Livraison',
  PricingRule: 'Tarif',
  Store: 'Entreprise',
  Incident: 'Incident',
};

export function auditEntityLabel(entityType: string): string {
  return AUDIT_ENTITY_LABELS[entityType] ?? entityType;
}

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

function formatMetadata(meta: Record<string, unknown> | null): string {
  if (!meta) return '';
  return Object.entries(meta)
    .map(([k, v]) => `${k}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
}

export function AuditPage() {
  const api = useApi();
  // Filtres initiaux depuis l'URL (liens « journal d'audit » des fiches livreur).
  const [params] = useSearchParams();
  const [action, setAction] = useState(() => params.get('action') ?? '');
  const [entityType, setEntityType] = useState(() => params.get('entityType') ?? '');
  const [entityId, setEntityId] = useState(() => params.get('entityId') ?? '');
  const [page, setPage] = useState(1);
  const logs = useAsync(
    () =>
      api.auditLogs({
        action: action || undefined,
        entityType: entityType || undefined,
        entityId: entityId || undefined,
        page,
        pageSize: 30,
      }),
    [api, action, entityType, entityId, page],
  );

  return (
    <div className="page">
      <PageTitle>Journal d’audit</PageTitle>
      <p className="page-lead">Toutes les actions sensibles du back office, dont chaque consultation de pièce d’identité.</p>
      <Card>
        <div className="filters">
          <FilterSelect
            label="Action"
            value={action}
            onChange={(v) => {
              setPage(1);
              setAction(v);
            }}
          >
            <option value="">Toutes</option>
            {Object.entries(AUDIT_ACTION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Objet"
            value={entityType}
            onChange={(v) => {
              setPage(1);
              setEntityType(v);
            }}
          >
            <option value="">Tous</option>
            {Object.entries(AUDIT_ENTITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </FilterSelect>
          {entityId && (
            <span className="filter-chip">
              Objet n° <span className="mono">{entityId}</span>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setPage(1);
                  setEntityId('');
                }}
              >
                <Icon name="close" size={14} />
                Retirer ce filtre
              </button>
            </span>
          )}
          {logs.data && (
            <span className="filters-note tnum">
              {logs.data.total} entrée{logs.data.total > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <ErrorBanner message={logs.error} onRetry={() => logs.reload()} />
        {logs.loading && !logs.data ? (
          <Loading />
        ) : !logs.data || logs.data.items.length === 0 ? (
          <Empty icon="shield">Aucune entrée.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Auteur</th>
                  <th>Action</th>
                  <th>Objet</th>
                  <th>Détails</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.data.items.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <DateTimeCell iso={l.createdAt} />
                    </td>
                    <td>
                      {l.actor ? (
                        <span className="person">
                          <Avatar name={l.actor.name} size="sm" />
                          <span className="person-text">
                            <span className="person-name">{l.actor.name ?? 'Sans nom'}</span>
                            <div className="muted small">{LABELS.role[l.actor.role]}</div>
                          </span>
                        </span>
                      ) : (
                        <span className="person">
                          <span className="avatar avatar-small avatar-system" aria-hidden="true">
                            <Icon name="settings" size={16} />
                          </span>
                          <span className="person-name">Système</span>
                        </span>
                      )}
                    </td>
                    <td className="strong">{auditActionLabel(l.action)}</td>
                    <td className="small">
                      {auditEntityLabel(l.entityType)}
                      {l.entityId && <div className="muted mono">{l.entityId}</div>}
                    </td>
                    <td className="small break audit-meta">{formatMetadata(l.metadata)}</td>
                    <td className="small mono muted">{l.ip ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {logs.data && (
          <Pagination page={logs.data.page} pageSize={logs.data.pageSize} total={logs.data.total} onPage={setPage} />
        )}
      </Card>
    </div>
  );
}
