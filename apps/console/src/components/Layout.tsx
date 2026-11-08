import { useEffect, useRef, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LABELS, type IncidentDto } from '@yaar/shared';
import { useAuth } from '../auth/AuthContext';
import { useAppConfig } from '../realtime/AppConfigContext';
import { useDashboard } from '../hooks/DashboardContext';
import { useIncidents } from '../hooks/IncidentsContext';
import { useLiveIntervalMs, useRealtime, useSocketEvent } from '../realtime/RealtimeContext';

interface NavItem {
  to: string;
  icon: string;
  label: string;
  badge?: number;
  end?: boolean;
  adminOnly?: boolean;
}

/**
 * Destination de la recherche globale : une plaque d'immatriculation mène aux livreurs ;
 * le reste (n° de course, nom, téléphone client) aux courses, qui proposent aussi
 * « chercher parmi les livreurs ».
 */
export function searchTarget(q: string): string {
  if (!q) return '/courses';
  const compact = q.replace(/[\s.-]/g, '');
  const isPlate = /^\d{1,2}[A-Za-z]{1,3}\d{2,5}$/.test(compact);
  const target = isPlate ? '/livreurs' : '/courses';
  return `${target}?q=${encodeURIComponent(q)}`;
}

export function Layout() {
  const { user, logout } = useAuth();
  const { dashboard, pendingStores } = useDashboard();
  const { connected, mode, idlePaused, resume } = useRealtime();
  const { config } = useAppConfig();
  const { incidents } = useIncidents();
  const liveIntervalMs = useLiveIntervalMs();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sosToasts, setSosToasts] = useState<IncidentDto[]>([]);

  useSocketEvent('sos', ({ incident }) => {
    setSosToasts((prev) => [incident, ...prev.filter((i) => i.id !== incident.id)].slice(0, 3));
  });
  useSocketEvent('incident.updated', ({ incident }) => {
    if (incident.status === 'RESOLVED') setSosToasts((prev) => prev.filter((i) => i.id !== incident.id));
  });

  // Mode poll : les SOS ouverts arrivent avec les alertes partagées (IncidentsProvider, une requête pour
  // toute la console) ; seuls les nouveaux (après le premier chargement) déclenchent une alerte, comme
  // l'événement `sos` du socket.
  const seenSos = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (mode !== 'poll' || !incidents) return;
    const open = incidents.filter((i) => i.type === 'SOS' && i.status === 'OPEN');
    const ids = new Set(open.map((i) => i.id));
    const seen = seenSos.current;
    seenSos.current = ids;
    const fresh = seen ? open.filter((i) => !seen.has(i.id)) : [];
    setSosToasts((prev) => {
      const kept = prev.filter((i) => ids.has(i.id));
      return [...fresh, ...kept.filter((k) => !fresh.some((f) => f.id === k.id))].slice(0, 3);
    });
  }, [incidents, mode]);

  const items: NavItem[] = [
    { to: '/', icon: '🗺️', label: 'Carte en direct', end: true },
    { to: '/courses', icon: '📦', label: 'Courses', badge: dashboard?.waitingForDriver },
    { to: '/livreurs', icon: '🛵', label: 'Livreurs' },
    { to: '/kyc', icon: '🪪', label: 'Validation KYC', badge: dashboard?.pendingKyc },
    { to: '/vendeurs', icon: '🏪', label: 'Vendeurs', badge: pendingStores ?? undefined },
    { to: '/clients', icon: '👥', label: 'Clients' },
    { to: '/incidents', icon: '⚠️', label: 'Litiges & SOS', badge: dashboard?.openIncidents },
    { to: '/caisse', icon: '💵', label: 'Caisse livreurs', badge: dashboard?.driversAtCashLimit },
    { to: '/tarifs', icon: '🏷️', label: 'Tarifs' },
    { to: '/audit', icon: '🔐', label: "Journal d'audit" },
    { to: '/equipe', icon: '🧑‍💼', label: 'Équipe', adminOnly: true },
  ];

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const q = search.trim();
    navigate(searchTarget(q));
  }

  return (
    <div className={`shell ${menuOpen ? 'menu-open' : ''}`}>
      <aside className="sidebar">
        <div className="logo">
          Yaar<span>·</span>Console
        </div>
        <nav aria-label="Navigation principale">
          <ul>
            {items
              .filter((i) => !i.adminOnly || user?.role === 'ADMIN')
              .map((i) => (
                <li key={i.to}>
                  <NavLink to={i.to} end={i.end} onClick={() => setMenuOpen(false)}>
                    <span aria-hidden="true">{i.icon}</span>
                    <span className="nav-label">{i.label}</span>
                    {i.badge ? (
                      <span className="nav-badge" aria-label={`${i.badge} à traiter`}>
                        {i.badge}
                      </span>
                    ) : null}
                  </NavLink>
                </li>
              ))}
          </ul>
        </nav>
        <div className="sidebar-foot">
          <div>
            {user?.name ?? user?.phone} · {user ? LABELS.role[user.role] : ''}
          </div>
          <button type="button" className="link-btn" onClick={() => logout()}>
            Se déconnecter
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn menu-btn"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            ☰
          </button>
          <form className="search" role="search" onSubmit={onSearch}>
            <input
              type="search"
              aria-label="Rechercher"
              placeholder="🔍 Rechercher une course (n°), un livreur (téléphone, plaque)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>
          {config?.demoMode ? (
            <span
              className="demo-badge"
              title="Mode démonstration : données fictives, ne saisissez pas de vraies données personnelles"
            >
              DÉMO
            </span>
          ) : null}
          {mode === 'poll' ? (
            <span className="poll-info" title="Mode sans temps réel : les données sont rechargées régulièrement">
              {idlePaused
                ? 'Actualisation en pause'
                : `Actualisation automatique toutes les ${Math.round(liveIntervalMs / 1000)} s`}
            </span>
          ) : (
            <span className={`live-dot ${connected ? 'on' : 'off'}`} title={connected ? 'Temps réel connecté' : 'Temps réel déconnecté'}>
              {connected ? 'Temps réel' : 'Hors ligne'}
            </span>
          )}
        </header>
        {idlePaused ? (
          <div className="idle-banner" role="status">
            <button type="button" onClick={() => resume()}>
              Actualisation en pause (inactivité) — cliquez pour reprendre
            </button>
          </div>
        ) : null}
        {sosToasts.length > 0 && (
          <div className="toasts" aria-live="assertive">
            {sosToasts.map((i) => (
              <div key={i.id} className="toast toast-sos" role="alert">
                <strong>🆘 SOS · {i.reporter.name ?? 'Livreur'}</strong>
                <span>{i.description}</span>
                <span className="toast-actions">
                  <a className="btn btn-small btn-light" href={`tel:${i.reporter.phone}`}>
                    Appeler
                  </a>
                  <button
                    type="button"
                    className="btn btn-small btn-light"
                    onClick={() => {
                      setSosToasts((prev) => prev.filter((x) => x.id !== i.id));
                      if (location.pathname !== '/incidents') navigate(`/incidents?focus=${i.id}`);
                    }}
                  >
                    Traiter
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Masquer"
                    onClick={() => setSosToasts((prev) => prev.filter((x) => x.id !== i.id))}
                  >
                    ×
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
