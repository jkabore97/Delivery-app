import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import {
  LABELS,
  type DriverStatus,
  type IncidentStatus,
  type IncidentType,
  type OrderStatus,
  type VehicleType,
} from '@yaar/shared';
import { errorMessage } from '../api/client';

export type Tone = 'green' | 'orange' | 'red' | 'blue' | 'grey';

export function Badge({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  );
}

const ORDER_TONE: Record<OrderStatus, Tone> = {
  PENDING: 'grey',
  ACCEPTED: 'orange',
  READY: 'orange',
  SEARCHING_DRIVER: 'red',
  ASSIGNED: 'blue',
  PICKED_UP: 'blue',
  DELIVERED: 'green',
  CANCELLED: 'grey',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={ORDER_TONE[status]}>{LABELS.orderStatus[status]}</Badge>;
}

const DRIVER_TONE: Record<DriverStatus, Tone> = {
  PENDING: 'orange',
  APPROVED: 'green',
  REJECTED: 'red',
  SUSPENDED: 'red',
};

export function DriverStatusBadge({ status }: { status: DriverStatus }) {
  return <Badge tone={DRIVER_TONE[status]}>{LABELS.driverStatus[status]}</Badge>;
}

const INCIDENT_TONE: Record<IncidentStatus, Tone> = { OPEN: 'red', IN_PROGRESS: 'orange', RESOLVED: 'green' };

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  return <Badge tone={INCIDENT_TONE[status]}>{LABELS.incidentStatus[status]}</Badge>;
}

export function IncidentTypeBadge({ type }: { type: IncidentType }) {
  return <Badge tone={type === 'SOS' ? 'red' : type === 'DISPUTE' ? 'orange' : 'grey'}>{LABELS.incidentType[type]}</Badge>;
}

export const VEHICLE_ICON: Record<VehicleType, string> = { BIKE: '🚲', MOTO: '🏍️', CAR: '🚗' };

export function Vehicle({ type, withLabel = true }: { type: VehicleType; withLabel?: boolean }) {
  return (
    <span className="vehicle" title={LABELS.vehicleType[type]}>
      <span aria-hidden="true">{VEHICLE_ICON[type]}</span>
      {withLabel ? ` ${LABELS.vehicleType[type]}` : <span className="sr-only">{LABELS.vehicleType[type]}</span>}
    </span>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <div className="alert alert-error" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn btn-small btn-ghost" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  );
}

export function Loading({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      {label}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Card({
  title,
  aside,
  children,
  className,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className ?? ''}`}>
      {(title || aside) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {aside && <div className="card-aside">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" className="btn btn-small btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ← Précédent
      </button>
      <span>
        Page {page} / {pages} · {total} résultat{total > 1 ? 's' : ''}
      </span>
      <button
        type="button"
        className="btn btn-small btn-ghost"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        Suivant →
      </button>
    </nav>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Fermer" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/**
 * Fenêtre de confirmation avec motif (refus KYC, suspension, annulation…).
 * `onConfirm` peut échouer : l'erreur de l'API est affichée dans la fenêtre.
 */
export function ReasonDialog({
  title,
  label = 'Motif',
  confirmLabel,
  danger = true,
  required = true,
  placeholder,
  description,
  onConfirm,
  onClose,
}: {
  title: string;
  /** Texte d'avertissement affiché au-dessus du motif (conséquences de l'action). */
  description?: ReactNode;
  label?: string;
  confirmLabel: string;
  danger?: boolean;
  required?: boolean;
  placeholder?: string;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = reason.trim();
    if (required && !value) {
      setError('Le motif est obligatoire.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(value);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="form">
        {description && <div className="muted">{description}</div>}
        <label htmlFor={inputId}>
          {label}
          {required ? '' : ' (facultatif)'}
        </label>
        <textarea
          id={inputId}
          value={reason}
          maxLength={500}
          rows={3}
          placeholder={placeholder}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
        <ErrorBanner message={error} />
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="submit" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy}>
            {busy ? 'Envoi…' : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function KeyValue({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="kv">
      {items.map(([k, v]) => (
        <div key={k} className="kv-row">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
