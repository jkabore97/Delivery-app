import { Link } from 'react-router-dom';
import type { IncidentDto } from '@yaar/shared';
import { formatRelative } from '../lib/format';
import { Card, Empty } from './ui';

const DOT: Record<IncidentDto['type'], string> = { SOS: 'dot-red', DISPUTE: 'dot-orange', OTHER: 'dot-orange' };

export function alertText(i: IncidentDto): string {
  const who = i.reporter.name ?? 'Inconnu';
  if (i.type === 'SOS') return `SOS · Livreur ${who}${i.description ? ` · ${i.description}` : ''}`;
  const order = i.orderNumber ? ` #${i.orderNumber}` : '';
  return `Litige${order} : ${i.description}`;
}

/** Alertes ouvertes : SOS en premier, puis litiges. */
export function AlertsPanel({ incidents, now }: { incidents: IncidentDto[]; now?: Date }) {
  const sorted = incidents
    .filter((i) => i.status !== 'RESOLVED')
    .slice()
    .sort((a, b) => (a.type === 'SOS' ? 0 : 1) - (b.type === 'SOS' ? 0 : 1) || b.createdAt.localeCompare(a.createdAt));
  return (
    <Card title="Alertes" aside={<Link to="/incidents">Tout voir</Link>}>
      {sorted.length === 0 ? (
        <Empty>Aucune alerte ouverte.</Empty>
      ) : (
        <ul className="alerts">
          {sorted.slice(0, 6).map((i) => (
            <li key={i.id} className={i.type === 'SOS' ? 'alert-sos' : ''}>
              <span className={`dot ${DOT[i.type]}`} aria-hidden="true" />
              <span className="alert-text">
                <Link to={`/incidents?focus=${i.id}`}>{alertText(i)}</Link>
                <span className="muted"> · {formatRelative(i.createdAt, now)}</span>
              </span>
              {i.type === 'SOS' && (
                <a className="btn btn-small btn-danger-soft" href={`tel:${i.reporter.phone}`}>
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
