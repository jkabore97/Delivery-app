import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LABELS, type IncidentDto } from '@yaar/shared';
import { useAuth } from '../auth/AuthContext';
import { useAppConfig } from '../realtime/AppConfigContext';
import { useDashboard } from '../hooks/DashboardContext';
import { useIncidents } from '../hooks/IncidentsContext';
import { useMinuteNow } from '../hooks/useAsync';
import { formatTime } from '../lib/format';
import { useLiveIntervalMs, useRealtime, useSocketEvent } from '../realtime/RealtimeContext';
import { Icon, type IconName } from './Icon';
import { PageTitleSlot } from './PageTitle';
import { Avatar, isModalOpen } from './ui';

interface NavItem {
  to: string;
  icon: IconName;
  label: string;
  badge?: number;
  /** Pastille corail (problème à traiter) au lieu de cobalt (file d'attente). */
  alert?: boolean;
  end?: boolean;
  adminOnly?: boolean;
}

/**
 * Destination de la recherche globale : une plaque d'immatriculation mène aux livreurs ;
 * le reste (n° de livraison, nom ou téléphone du compte demandeur) aux livraisons, qui proposent aussi
 * « chercher parmi les livreurs ».
 */
export function searchTarget(q: string): string {
  if (!q) return '/courses';
  const compact = q.replace(/[\s.-]/g, '');
  const isPlate = /^\d{1,2}[A-Za-z]{1,3}\d{2,5}$/.test(compact);
  const target = isPlate ? '/livreurs' : '/courses';
  return `${target}?q=${encodeURIComponent(q)}`;
}

const dayFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Ouagadougou',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** « lundi 9 novembre · 21:42 » (heure de Ouagadougou), mis à jour à chaque changement de minute. */
function LiveClock() {
  const now = useMinuteNow();
  const iso = new Date(now).toISOString();
  return (
    <span className="tnum">
      {dayFmt.format(now)} · <time dateTime={iso}>{formatTime(iso)}</time>
    </span>
  );
}

/**
 * État du rafraîchissement : temps réel (socket) ou actualisation périodique (mode poll), en pause après inactivité. Le
 * point et son texte forment un bloc insécable : à la ligne ensemble, jamais un point orphelin en fin de ligne.
 */
function LiveState() {
  const { connected, mode, idlePaused } = useRealtime();
  const liveIntervalMs = useLiveIntervalMs();
  if (mode === 'poll') {
    return (
      <span className="live-status">
        <span className={`live-dot${idlePaused ? ' is-paused' : ''}`} aria-hidden="true" />
        <span className="live-state" title="Mode sans temps réel : les données sont rechargées régulièrement">
          {idlePaused ? 'Actualisation en pause' : `Actualisation automatique toutes les ${Math.round(liveIntervalMs / 1000)} s`}
        </span>
      </span>
    );
  }
  return (
    <span className="live-status">
      <span className={`live-dot${connected ? '' : ' is-off'}`} aria-hidden="true" />
      <span className="live-state" title={connected ? 'Temps réel connecté' : 'Temps réel déconnecté'}>
        {connected ? 'Temps réel' : 'Hors ligne'}
      </span>
    </span>
  );
}

/** SOS masqués dans cet onglet (sessionStorage) : un SOS encore ouvert au rechargement n'est pas ré-affiché. */
const SOS_DISMISSED_KEY = 'yaar.console.sosDismissed';

function dismissedSos(): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(SOS_DISMISSED_KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function rememberDismissedSos(id: string): void {
  try {
    const ids = [...dismissedSos(), id].slice(-50);
    window.sessionStorage.setItem(SOS_DISMISSED_KEY, JSON.stringify(ids));
  } catch {
    /* stockage indisponible (navigation privée) : le SOS pourra réapparaître au rechargement */
  }
}

export function Layout() {
  const { user, logout } = useAuth();
  const { dashboard, pendingStores } = useDashboard();
  const { mode, idlePaused, resume } = useRealtime();
  const { config } = useAppConfig();
  const { incidents } = useIncidents();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sosToasts, setSosToasts] = useState<IncidentDto[]>([]);
  const [titleSlot, setTitleSlot] = useState<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  useSocketEvent('sos', ({ incident }) => {
    setSosToasts((prev) => [incident, ...prev.filter((i) => i.id !== incident.id)].slice(0, 3));
  });
  useSocketEvent('incident.updated', ({ incident }) => {
    if (incident.status === 'RESOLVED') setSosToasts((prev) => prev.filter((i) => i.id !== incident.id));
  });

  // Les SOS ouverts arrivent avec les alertes partagées (IncidentsProvider, une requête pour toute la console).
  // Premier chargement : un SOS encore ouvert (que personne n'a pris en charge) s'affiche aussi, sauf s'il a déjà été
  // masqué dans cet onglet. Ensuite, en mode poll, chaque nouveau SOS ouvre une alerte, comme l'événement `sos` du socket.
  const seenSos = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!incidents) return;
    const open = incidents.filter((i) => i.type === 'SOS' && i.status === 'OPEN');
    const ids = new Set(open.map((i) => i.id));
    const seen = seenSos.current;
    seenSos.current = ids;
    if (seen === null) {
      const dismissed = dismissedSos();
      const initial = open.filter((i) => !dismissed.has(i.id));
      if (initial.length > 0) {
        setSosToasts((prev) => [...prev, ...initial.filter((i) => !prev.some((p) => p.id === i.id))].slice(0, 3));
      }
      return;
    }
    if (mode !== 'poll') return;
    const fresh = open.filter((i) => !seen.has(i.id));
    setSosToasts((prev) => {
      const kept = prev.filter((i) => ids.has(i.id));
      return [...fresh, ...kept.filter((k) => !fresh.some((f) => f.id === k.id))].slice(0, 3);
    });
  }, [incidents, mode]);

  function dismissToast(id: string) {
    rememberDismissedSos(id);
    setSosToasts((prev) => prev.filter((x) => x.id !== id));
  }

  // « / » (hors d'un champ, aucune fenêtre ouverte) place le curseur dans la recherche, comme l'indique la touche affichée.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || isModalOpen()) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Menu des petits écrans (≤ 820 px) : le focus entre dans le menu à l'ouverture ; Échap le ferme et rend le focus au
  // bouton « Menu » (un clic sur le voile le ferme aussi).
  useEffect(() => {
    if (!menuOpen) return undefined;
    const first = sidebarRef.current?.querySelector<HTMLElement>('.nav-link.active, .nav-link');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const groups: Array<{ label: string; items: NavItem[] }> = [
    {
      label: 'Opérations',
      items: [
        { to: '/', icon: 'map', label: 'Carte en direct', end: true },
        { to: '/courses', icon: 'package', label: 'Livraisons', badge: dashboard?.waitingForDriver },
        { to: '/incidents', icon: 'alert', label: 'Litiges & SOS', badge: dashboard?.openIncidents, alert: true },
      ],
    },
    {
      label: 'Partenaires',
      items: [
        { to: '/entreprises', icon: 'store', label: 'Entreprises', badge: pendingStores ?? undefined },
        { to: '/livreurs', icon: 'moto', label: 'Livreurs' },
        { to: '/kyc', icon: 'id', label: 'Validation KYC', badge: dashboard?.pendingKyc },
      ],
    },
    {
      label: 'Finances',
      items: [
        { to: '/caisse', icon: 'wallet', label: 'Caisse', badge: dashboard?.driversAtCashLimit, alert: true },
        { to: '/tarifs', icon: 'tag', label: 'Tarifs' },
      ],
    },
    {
      label: 'Administration',
      items: [
        { to: '/audit', icon: 'shield', label: 'Journal d’audit' },
        { to: '/clients', icon: 'user', label: 'Anciens clients' },
        { to: '/equipe', icon: 'users', label: 'Équipe', adminOnly: true },
      ],
    },
  ];

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const q = search.trim();
    navigate(searchTarget(q));
  }

  return (
    <div className={`shell ${menuOpen ? 'menu-open' : ''}`}>
      {menuOpen && <div className="menu-backdrop" aria-hidden="true" onClick={() => setMenuOpen(false)} />}
      <aside className="sidebar" ref={sidebarRef}>
        {/* Barre étroite (821 à 1279 px) : « Y » et le point cobalt seulement, menu en pictogrammes. */}
        <Link to="/" className="brand" aria-label="Yaar Console : carte en direct" onClick={() => setMenuOpen(false)}>
          <span className="brand-word">
            <span className="brand-text">
              Y<span className="brand-rest">aar</span>
            </span>
            <span className="brand-dot" aria-hidden="true" />
          </span>
          <span className="brand-tag">Console</span>
        </Link>
        <nav className="nav" aria-label="Navigation principale">
          {groups.map((g) => {
            const items = g.items.filter((i) => !i.adminOnly || user?.role === 'ADMIN');
            if (items.length === 0) return null;
            return (
              <div key={g.label} className="nav-group">
                <div className="nav-group-label" id={`nav-${g.label}`}>
                  {g.label}
                </div>
                <ul className="nav-list" aria-labelledby={`nav-${g.label}`}>
                  {items.map((i) => (
                    <li key={i.to}>
                      <NavLink to={i.to} end={i.end} className="nav-link" title={i.label} onClick={() => setMenuOpen(false)}>
                        <Icon name={i.icon} size={20} />
                        <span className="nav-label">{i.label}</span>
                        {i.badge ? (
                          <span className={`nav-badge${i.alert ? ' is-alert' : ''}`} aria-label={`${i.badge} à traiter`}>
                            {i.badge}
                          </span>
                        ) : null}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-user">
          <Avatar name={user?.name ?? null} />
          <div className="sidebar-user-text">
            <b>{user?.name ?? user?.phone}</b>
            <small>{user ? LABELS.role[user.role] : ''}</small>
          </div>
          <button type="button" className="icon-btn" aria-label="Se déconnecter" title="Se déconnecter" onClick={() => logout()}>
            <Icon name="logout" size={20} />
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button
            ref={menuButtonRef}
            type="button"
            className="icon-btn menu-btn"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <Icon name="menu" size={20} />
          </button>
          <div className="topbar-heading">
            <div className="topbar-title" ref={setTitleSlot} />
            <div className="topbar-meta">
              <LiveClock />
              <LiveState />
            </div>
          </div>
          <div className="topbar-actions">
            <form className="search-pill" role="search" onSubmit={onSearch}>
              <Icon name="search" size={20} />
              <input
                ref={searchRef}
                type="search"
                aria-label="Rechercher"
                placeholder="N° de livraison, compte, plaque…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd className="kbd" title="Raccourci : touche « / »">
                /
              </kbd>
            </form>
            {config?.demoMode ? (
              <span
                className="demo-badge"
                title="Mode démonstration : données fictives, ne saisissez pas de vraies données personnelles"
              >
                <Icon name="info" size={16} />
                Démo
              </span>
            ) : null}
          </div>
        </header>
        {idlePaused ? (
          <div className="idle-banner" role="status">
            <button type="button" onClick={() => resume()}>
              <Icon name="refresh" size={18} />
              Actualisation en pause (inactivité) — cliquez pour reprendre
            </button>
          </div>
        ) : null}
        {sosToasts.length > 0 && (
          <div className="toasts" aria-live="assertive">
            {sosToasts.map((i) => (
              <SosToast
                key={i.id}
                incident={i}
                onDismiss={() => dismissToast(i.id)}
                onHandle={() => {
                  dismissToast(i.id);
                  if (location.pathname !== '/incidents') navigate(`/incidents?focus=${i.id}`);
                }}
              />
            ))}
          </div>
        )}
        <PageTitleSlot value={titleSlot}>
          <main className="content">
            <Outlet />
          </main>
        </PageTitleSlot>
      </div>
    </div>
  );
}

/** Délai avant qu'une alerte SOS se replie en pastille : assez pour la lire, sans cacher la page ensuite. */
export const SOS_COLLAPSE_MS = 10_000;

/**
 * Alerte SOS en bas à droite. Elle s'ouvre en grand, puis se replie après SOS_COLLAPSE_MS en une pastille
 * « SOS · nom » qui reste visible tant que l'alerte n'est pas traitée ou masquée, sans couvrir les boutons
 * ni les montants de la page. Un clic sur la pastille la rouvre.
 */
function SosToast({ incident, onDismiss, onHandle }: { incident: IncidentDto; onDismiss: () => void; onHandle: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    if (collapsed || hovered) return;
    const t = window.setTimeout(() => setCollapsed(true), SOS_COLLAPSE_MS);
    return () => window.clearTimeout(t);
  }, [collapsed, hovered]);
  const name = incident.reporter.name ?? 'Livreur';
  if (collapsed) {
    return (
      <button
        type="button"
        className="toast toast-sos toast-pill"
        aria-label={`SOS · ${name} : afficher l’alerte`}
        aria-expanded={false}
        onClick={() => setCollapsed(false)}
        data-testid="sos-toast-pill"
      >
        <span className="toast-icon" aria-hidden="true">
          <Icon name="alert" size={16} />
        </span>
        <strong className="toast-title">SOS · {name}</strong>
      </button>
    );
  }
  return (
    <div
      className="toast toast-sos"
      role="alert"
      data-testid="sos-toast"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <div className="toast-head">
        <span className="toast-icon" aria-hidden="true">
          <Icon name="alert" size={20} />
        </span>
        <strong className="toast-title">SOS · {name}</strong>
        <button type="button" className="icon-btn" aria-label="Réduire" title="Réduire" onClick={() => setCollapsed(true)}>
          <Icon name="chevronDown" size={18} />
        </button>
        <button type="button" className="icon-btn" aria-label="Masquer" title="Masquer" onClick={onDismiss}>
          <Icon name="close" size={18} />
        </button>
      </div>
      {incident.description && <span className="toast-desc">{incident.description}</span>}
      <span className="toast-actions">
        <a className="btn btn-small btn-light" href={`tel:${incident.reporter.phone}`}>
          <Icon name="phone" size={16} />
          Appeler
        </a>
        <button type="button" className="btn btn-small btn-on-coral" onClick={onHandle}>
          Traiter
        </button>
      </span>
    </div>
  );
}
