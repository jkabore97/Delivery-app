import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  LABELS,
  type DriverStatus,
  type IncidentStatus,
  type IncidentType,
  type OrderStatus,
  type VehicleType,
} from '@yaar/shared';
import { errorMessage } from '../api/client';
import { statusLabel } from '../lib/delivery';
import { formatDate, formatTime, initials } from '../lib/format';
import { markerInitials } from '../lib/map/initials';
import { Icon, type IconName } from './Icon';

/**
 * Puces d'état Cobalt (24 px, 12/700, fond teinté + texte assorti, contrastes ≥ 4,5:1) :
 * green = livrée / réussite (mint) · orange = à valider, attention (sunTint) · red = annulée, problème (coralTint) ·
 * blue = en livraison, en cours (cobaltTint) · grey = neutre (raised) · sun = livreur vers le retrait (soleil plein,
 * texte encre) · search = recherche d'un livreur (gris, point cobalt) · coral = SOS (corail plein, texte blanc).
 */
export type Tone = 'green' | 'orange' | 'red' | 'blue' | 'grey' | 'sun' | 'search' | 'coral';

export function Badge({ tone, children, title, dot }: { tone: Tone; children: ReactNode; title?: string; dot?: boolean }) {
  return (
    <span className={`badge badge-${tone}${dot ? ' badge-dot' : ''}`} title={title}>
      {children}
    </span>
  );
}

const ORDER_TONE: Record<OrderStatus, Tone> = {
  PENDING: 'grey',
  ACCEPTED: 'grey',
  READY: 'grey',
  SEARCHING_DRIVER: 'search',
  ASSIGNED: 'sun',
  PICKED_UP: 'blue',
  DELIVERED: 'green',
  CANCELLED: 'red',
};

/** `business` : livraison d'entreprise (l'étape PENDING n'attend pas de vendeur). */
export function OrderStatusBadge({ status, business = false }: { status: OrderStatus; business?: boolean }) {
  return <Badge tone={ORDER_TONE[status]}>{statusLabel(status, business)}</Badge>;
}

const DRIVER_TONE: Record<DriverStatus, Tone> = {
  PENDING: 'orange',
  APPROVED: 'green',
  REJECTED: 'red',
  SUSPENDED: 'red',
};

/** `short` (listes) : « À valider » au lieu de « En attente de validation ». */
export function DriverStatusBadge({ status, short = false }: { status: DriverStatus; short?: boolean }) {
  return <Badge tone={DRIVER_TONE[status]}>{short && status === 'PENDING' ? 'À valider' : LABELS.driverStatus[status]}</Badge>;
}

const INCIDENT_TONE: Record<IncidentStatus, Tone> = { OPEN: 'red', IN_PROGRESS: 'blue', RESOLVED: 'green' };

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  return <Badge tone={INCIDENT_TONE[status]}>{LABELS.incidentStatus[status]}</Badge>;
}

/**
 * Nom d'un type d'incident dans toute la console (filtre, puce, alertes, fenêtre de résolution) : « Autre incident »
 * plutôt que le seul « Autre » des libellés partagés, qui ne se lit pas seul (« Autre : le livreur demande… »).
 */
export function incidentTypeLabel(type: IncidentType): string {
  return type === 'OTHER' ? 'Autre incident' : LABELS.incidentType[type];
}

export function IncidentTypeBadge({ type }: { type: IncidentType }) {
  return <Badge tone={type === 'SOS' ? 'coral' : type === 'DISPUTE' ? 'orange' : 'grey'}>{incidentTypeLabel(type)}</Badge>;
}

/** Pictogramme de chaque véhicule (de profil, comme sur la carte et dans l'application). */
export const VEHICLE_ICON: Record<VehicleType, IconName> = { BIKE: 'bike', MOTO: 'moto', CAR: 'car' };

export function Vehicle({ type, withLabel = true, size = 18 }: { type: VehicleType; withLabel?: boolean; size?: number }) {
  return (
    <span className="vehicle" title={LABELS.vehicleType[type]}>
      <Icon name={VEHICLE_ICON[type]} size={size} />
      {withLabel ? LABELS.vehicleType[type] : <span className="sr-only">{LABELS.vehicleType[type]}</span>}
    </span>
  );
}

/**
 * Avatar rond aux initiales : cobaltTint dans les listes (par défaut) ; `sun` pour LE livreur mis en avant (tuile héros
 * d'une livraison, fiche du livreur), comme sur la planche Cobalt.
 */
export function Avatar({
  name,
  size = 'md',
  tone,
}: {
  name: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'sun' | 'mint';
}) {
  const cls = ['avatar', size === 'sm' ? 'avatar-small' : size === 'lg' ? 'avatar-large' : '', tone ? `avatar-${tone}` : '']
    .filter(Boolean)
    .join(' ');
  return (
    <span className={cls} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/**
 * Marque d'une entreprise (carré encre arrondi aux initiales blanches), avec les MÊMES initiales que son carré sur les
 * cartes (`markerInitials` : « Grillades de Pissy » → GP), ou le pictogramme boutique sans nom exploitable. Les initiales
 * sont dessinées en CSS (`attr(data-initials)`) : elles ne s'ajoutent pas au texte de la cellule ni à ce que lit un
 * lecteur d'écran, qui lit déjà le nom à côté.
 */
export function BizMark({ name, large }: { name: string | null | undefined; large?: boolean }) {
  const letters = markerInitials(name);
  return (
    <span className={`biz-mark${large ? ' biz-mark-large' : ''}`} data-initials={letters ?? undefined} aria-hidden="true">
      {letters ? null : <Icon name="store" size={large ? 20 : 16} />}
    </span>
  );
}

/**
 * Enveloppe d'un tableau : défile horizontalement DANS sa carte quand le tableau est plus large qu'elle (jamais la page
 * entière), et seulement dans ce cas : un tableau qui tient garde son en-tête collant (`position: sticky` ne colle plus
 * dans un conteneur qui défile). Mesuré par ResizeObserver (taille de la carte et du tableau) ; défilant, le conteneur
 * est une région nommée que le clavier peut atteindre (flèches gauche / droite).
 */
export function TableWrap({ children, label = 'Tableau' }: { children: ReactNode; label?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scroll, setScroll] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const check = () => {
      const table = el.firstElementChild as HTMLElement | null;
      setScroll(!!table && table.offsetWidth > el.clientWidth + 1);
    };
    const observer = new ResizeObserver(check);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    check();
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`table-wrap${scroll ? ' is-scroll' : ''}`}
      {...(scroll ? { role: 'region', 'aria-label': `${label} (défilement horizontal)`, tabIndex: 0 } : {})}
    >
      {children}
    </div>
  );
}

/** Date d'un tableau : heure en avant, date en dessous (chiffres tabulaires). */
export function DateTimeCell({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <span className="muted">-</span>;
  return (
    <span className="datetime">
      <time dateTime={iso}>{formatTime(iso)}</time>
      <span className="muted small">{formatDate(iso)}</span>
    </span>
  );
}

/** Note d'un livreur : étoile dessinée (la police n'a pas « ★ »), chiffres tabulaires. */
export function Rating({ avg, count }: { avg: number | null; count?: number }) {
  if (avg === null) return <span className="muted">-</span>;
  return (
    <span className="rating" title={`Note moyenne ${avg.toFixed(1).replace('.', ',')} sur 5`}>
      <Icon name="star" size={14} />
      {avg.toFixed(1).replace('.', ',')}
      {count !== undefined && <span className="muted"> ({count})</span>}
    </span>
  );
}

const BANNER_ICON: Record<'info' | 'warn' | 'error' | 'success', IconName> = {
  info: 'info',
  warn: 'alert',
  error: 'alertCircle',
  success: 'checkCircle',
};

/** Bandeau Cobalt (rayon 16, pictogramme à gauche) : info cobalt, avertissement soleil, erreur corail, réussite mint. */
export function Banner({
  tone,
  children,
  role,
  action,
}: {
  tone: 'info' | 'warn' | 'error' | 'success';
  children: ReactNode;
  role?: 'alert' | 'status' | 'note';
  action?: ReactNode;
}) {
  return (
    <div className={`alert alert-${tone}`} role={role}>
      <Icon name={BANNER_ICON[tone]} size={20} />
      <div className="alert-text">{children}</div>
      {action}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <Banner
      tone="error"
      role="alert"
      action={
        onRetry && (
          <button type="button" className="btn btn-small btn-ghost" onClick={onRetry}>
            <Icon name="refresh" size={16} />
            Réessayer
          </button>
        )
      }
    >
      {message}
    </Banner>
  );
}

export function Loading({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

/** État vide : pictogramme dans un disque gris et phrase courte. */
export function Empty({ children, icon = 'list', compact }: { children: ReactNode; icon?: IconName; compact?: boolean }) {
  return (
    <div className={`empty${compact ? ' empty-compact' : ''}`}>
      <span className="empty-icon" aria-hidden="true">
        <Icon name={icon} size={compact ? 18 : 20} />
      </span>
      <span>{children}</span>
    </div>
  );
}

export function Card({
  title,
  aside,
  sub,
  children,
  className,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  /** Ligne d'information sous le titre (13/600, gris). */
  sub?: ReactNode;
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
      {sub && <p className="card-sub">{sub}</p>}
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
      <span>
        Page {page} / {pages} · {total} résultat{total > 1 ? 's' : ''}
      </span>
      {pages > 1 && (
        <span className="actions">
          <button type="button" className="btn btn-small btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <Icon name="chevronLeft" size={16} />
            Précédent
          </button>
          <button type="button" className="btn btn-small btn-ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            Suivant
            <Icon name="chevronRight" size={16} />
          </button>
        </span>
      )}
    </nav>
  );
}

const TABBABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), ' +
  'textarea:not([disabled]), iframe, object, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

/** Éléments atteignables au clavier dans `root`, dans l'ordre du document. */
export function tabbables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter(
    (el) => el.tabIndex >= 0 && !el.closest('[hidden], [inert], [aria-hidden="true"]'),
  );
}

/** Fenêtres ouvertes, de la plus ancienne à la plus récente : seule la dernière répond à Échap. */
const openDialogs: HTMLElement[] = [];

/** Une fenêtre modale est-elle ouverte ? (raccourcis clavier de la page désactivés pendant ce temps) */
export function isModalOpen(): boolean {
  return openDialogs.length > 0;
}

/**
 * Fenêtre modale accessible : rendue dans <body> (portail), le reste de la page devient inerte (ni clic, ni Tab, ni
 * lecteur d'écran) ; le focus entre dans la fenêtre (élément `autoFocus`, sinon la fenêtre elle-même, qui annonce son
 * titre), Tab et Maj+Tab y tournent en boucle, Échap ou un clic sur le voile la ferment, et le focus revient à l'élément
 * qui l'a ouverte.
 */
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Élément qui avait le focus à l'ouverture, lu au premier rendu : un champ `autoFocus` le déplace avant les effets.
  const [opener] = useState<HTMLElement | null>(() =>
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    const backdrop = dialog?.parentElement;
    if (!dialog || !backdrop) return undefined;
    // Fond inerte : tout ce qui, dans <body>, n'est pas cette fenêtre (l'application, les autres portails).
    const inerted: Element[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === backdrop || el.contains(backdrop) || el.hasAttribute('inert') || el.tagName === 'SCRIPT') continue;
      el.setAttribute('inert', '');
      inerted.push(el);
    }
    openDialogs.push(dialog);
    if (!dialog.contains(document.activeElement)) dialog.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && openDialogs[openDialogs.length - 1] === dialog) onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      openDialogs.splice(openDialogs.indexOf(dialog), 1);
      for (const el of inerted) el.removeAttribute('inert');
      if (opener && opener.isConnected) opener.focus();
    };
  }, [opener]);

  /** Tab / Maj+Tab restent dans la fenêtre. */
  function trapTab(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const items = tabbables(dialog);
    if (items.length === 0) {
      e.preventDefault();
      dialog.focus();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialog || !dialog.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className={`modal ${wide ? 'modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapTab}
      >
        <header className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Fermer" title="Fermer" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
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
  cancelLabel = 'Annuler',
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
  /** Bouton qui ferme sans rien faire (« Retour » quand l'action elle-même s'appelle « Annuler… »). */
  cancelLabel?: string;
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
        {description && <p className="hint">{description}</p>}
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
            {cancelLabel}
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

/** Liste déroulante d'un filtre : libellé au-dessus, flèche dessinée (le `select` natif n'en a plus). */
export function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label>
      {label}
      <span className="select-wrap">
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {children}
        </select>
      </span>
    </label>
  );
}
