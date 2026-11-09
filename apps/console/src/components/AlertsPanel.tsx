import { Link } from 'react-router-dom';
import type { IncidentDto } from '@yaar/shared';
import { formatRelative } from '../lib/format';
import { Icon } from './Icon';
import { Card, Empty } from './ui';

export function alertText(i: IncidentDto): string {
  const who = i.reporter.name ?? 'Inconnu';
  if (i.type === 'SOS') return `SOS · Livreur ${who}${i.description ? ` · ${i.description}` : ''}`;
  const order = i.orderNumber ? ` #${i.orderNumber}` : '';
  return `${i.type === 'DISPUTE' ? 'Litige' : 'Incident'}${order} : ${i.description}`;
}

/** Alertes ouvertes : SOS en premier (fond corail pâle, bouton d'appel corail), puis litiges. */
export function AlertsPanel({ incidents, now }: { incidents: IncidentDto[]; now?: Date }) {
  const sorted = incidents
    .filter((i) => i.status !== 'RESOLVED')
    .slice()
    .sort((a, b) => (a.type === 'SOS' ? 0 : 1) - (b.type === 'SOS' ? 0 : 1) || b.createdAt.localeCompare(a.createdAt));
  const sos = sorted.filter((i) => i.type === 'SOS').length;
  return (
    <Card
      title={
        <>
          Alertes
          {sorted.length > 0 && (
            <span className={`count${sos ? ' count-alert' : ''}`} aria-hidden="true">
              {sorted.length}
            </span>
          )}
        </>
      }
      aside={
        <Link to="/incidents" className="card-link">
          Tout voir
          <Icon name="chevronRight" size={16} />
        </Link>
      }
    >
      {sorted.length === 0 ? (
        <Empty icon="check" compact>
          Aucune alerte ouverte.
        </Empty>
      ) : (
        <ul className="alerts">
          {sorted.slice(0, 6).map((i) => (
            <li key={i.id} className={`alert-row ${i.type === 'SOS' ? 'alert-sos' : ''}`}>
              <span className="alert-disc" aria-hidden="true">
                <Icon name={i.type === 'SOS' ? 'alert' : i.type === 'DISPUTE' ? 'flag' : 'info'} size={18} />
              </span>
              <span className="alert-text">
                <Link to={`/incidents?focus=${i.id}`}>{alertText(i)}</Link>
                <span className="alert-time">{formatRelative(i.createdAt, now)}</span>
              </span>
              {i.type === 'SOS' && (
                <a className="btn btn-small btn-danger" href={`tel:${i.reporter.phone}`}>
                  <Icon name="phone" size={16} />
                  Appeler
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
