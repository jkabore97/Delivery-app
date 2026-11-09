import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { PublicConfigDto } from '@yaar/shared';
import { DEMO_DATA_WARNING } from '@yaar/shared';
import { AuthProvider } from '../src/auth/AuthContext';
import { Layout } from '../src/components/Layout';
import { IDLE_PAUSE_MS } from '../src/config';
import { DashboardProvider } from '../src/hooks/DashboardContext';
import { IncidentsProvider } from '../src/hooks/IncidentsContext';
import { LivePage } from '../src/pages/LivePage';
import { LoginPage } from '../src/pages/LoginPage';
import { AppConfigProvider, fetchPublicConfig, parsePublicConfig } from '../src/realtime/AppConfigContext';
import { IdleMonitor } from '../src/realtime/idle';
import { PollScheduler, type VisibilitySource } from '../src/realtime/pollScheduler';
import { RealtimeProvider } from '../src/realtime/RealtimeContext';
import { dashboard, mapData, page, pendingOrder, sos } from './fixtures';
import { controllerUser, fakeFetch, type FakeCall } from './helpers';

const io = vi.hoisted(() => vi.fn());
vi.mock('socket.io-client', () => ({ io }));
vi.mock('../src/components/LiveMap', () => ({
  LiveMap: () => <div data-testid="live-map" />,
}));

/** Visibilité d'onglet pilotable depuis le test. */
function fakeVisibility(initial = true) {
  let visible = initial;
  const listeners = new Set<(v: boolean) => void>();
  const source: VisibilitySource = {
    isVisible: () => visible,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  return {
    source,
    set(v: boolean) {
      visible = v;
      listeners.forEach((l) => l(v));
    },
  };
}

const pollConfig: PublicConfigDto = { realtime: 'poll', pollIntervalMs: 4000, demoMode: true, otpChannel: 'console' };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
});
afterEach(() => {
  vi.useRealTimers();
  io.mockClear();
});

describe('PollScheduler', () => {
  it('appelle la tâche à intervalle régulier, en pause quand l’onglet est masqué, immédiatement au retour', async () => {
    const vis = fakeVisibility();
    const s = new PollScheduler(vis.source);
    const task = vi.fn(async () => true);
    s.add(task, 5000);
    await vi.advanceTimersByTimeAsync(4999);
    expect(task).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(task).toHaveBeenCalledTimes(2);

    vis.set(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(task).toHaveBeenCalledTimes(2);

    vis.set(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(5000);
    expect(task).toHaveBeenCalledTimes(4);
    s.dispose();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(task).toHaveBeenCalledTimes(4);
  });

  it('double l’intervalle sur erreur (30 s au plus) puis revient au rythme normal', async () => {
    const s = new PollScheduler(fakeVisibility().source);
    let fail = true;
    const times: number[] = [];
    const start = Date.now();
    s.add(async () => {
      times.push(Date.now() - start);
      if (fail) throw new Error('réseau');
      return true;
    }, 5000);
    await vi.advanceTimersByTimeAsync(5000 + 10_000 + 20_000 + 30_000 + 30_000);
    expect(times).toEqual([5000, 15_000, 35_000, 65_000, 95_000]);
    fail = false;
    await vi.advanceTimersByTimeAsync(30_000 + 5000);
    expect(times.slice(-2)).toEqual([125_000, 130_000]);
    s.dispose();
  });

  it('une tâche retirée n’est plus appelée', async () => {
    const s = new PollScheduler(fakeVisibility().source);
    const task = vi.fn();
    const remove = s.add(task, 1000);
    remove();
    await vi.advanceTimersByTimeAsync(5000);
    expect(task).not.toHaveBeenCalled();
    expect(s.size).toBe(0);
  });

  it('pause : plus aucun appel ; reprise : appel immédiat puis rythme normal', async () => {
    const s = new PollScheduler(fakeVisibility().source);
    const task = vi.fn(async () => true);
    s.add(task, 10_000);
    s.setPaused(true);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(task).toHaveBeenCalledTimes(0);
    // Ajoutée pendant la pause : attend la reprise.
    const other = vi.fn(async () => true);
    s.add(other, 10_000);
    s.setPaused(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(task).toHaveBeenCalledTimes(2);
    s.dispose();
  });
});

describe('IdleMonitor', () => {
  it('inactif après le délai sans interaction ; une interaction le réveille et relance le délai', async () => {
    const changes: boolean[] = [];
    const m = new IdleMonitor(15 * 60_000, (idle) => changes.push(idle));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    fireEvent.pointerMove(window, { clientX: 10, clientY: 10 });
    await vi.advanceTimersByTimeAsync(10 * 60_000); // 10 min après le mouvement : toujours actif
    expect(changes).toEqual([]);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(changes).toEqual([true]);
    expect(m.isIdle).toBe(true);
    // Mouvement « simulé » sans déplacement (mise à jour du survol par le navigateur) : ignoré.
    fireEvent.pointerMove(window, { clientX: 10, clientY: 10 });
    expect(changes).toEqual([true]);
    fireEvent.keyDown(window, { key: 'a' });
    expect(changes).toEqual([true, false]);
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(changes).toEqual([true, false, true]);
    fireEvent.touchStart(window);
    fireEvent(document, new Event('visibilitychange'));
    expect(changes).toEqual([true, false, true, false]);
    m.dispose();
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(changes).toHaveLength(4);
  });
});

describe('GET /config', () => {
  it('valide la réponse et retombe sur le mode poll si l’API est injoignable', async () => {
    expect(parsePublicConfig({ realtime: 'poll', pollIntervalMs: 5000, demoMode: true, otpChannel: 'whatsapp' })).toEqual({
      realtime: 'poll',
      pollIntervalMs: 5000,
      demoMode: true,
      otpChannel: 'whatsapp',
    });
    expect(parsePublicConfig({}).realtime).toBe('socket');
    const failing = vi.fn(async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    const p = fetchPublicConfig('http://api.test', failing, 2, 10);
    await vi.advanceTimersByTimeAsync(50);
    await expect(p).resolves.toMatchObject({ realtime: 'poll', demoMode: false });
    expect(failing).toHaveBeenCalledTimes(2);
  });
});

const pollRoutes = {
  'GET /controller/map': mapData,
  'GET /controller/orders/pending': [pendingOrder],
  'GET /controller/drivers': page([]),
  'GET /controller/incidents': page([]),
  'GET /controller/dashboard': dashboard,
  'GET /controller/stores': page([]),
  'GET /me': controllerUser,
};

function renderPoll(
  ui: React.ReactElement,
  vis = fakeVisibility(),
  path = '/',
  { idlePauseMs, routes = {} }: { idlePauseMs?: number; routes?: Record<string, unknown> } = {},
) {
  const { impl, calls } = fakeFetch({ ...pollRoutes, ...routes });
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <AppConfigProvider baseUrl="http://api.test" initialConfig={pollConfig}>
        <AuthProvider baseUrl="http://api.test" fetchImpl={impl} initialToken="tok" initialUser={controllerUser}>
          <RealtimeProvider url="http://api.test" token="tok" visibility={vis.source} idlePauseMs={idlePauseMs}>
            <DashboardProvider>
              <IncidentsProvider>{ui}</IncidentsProvider>
            </DashboardProvider>
          </RealtimeProvider>
        </AuthProvider>
      </AppConfigProvider>
    </MemoryRouter>,
  );
  return { ...utils, calls, vis };
}

/** Console complète sur la carte en direct (comme App : en-tête + page). */
const liveConsole = (
  <Routes>
    <Route element={<Layout />}>
      <Route index element={<LivePage />} />
    </Route>
  </Routes>
);

const count = (calls: { path: string }[], prefix: string) => calls.filter((c) => c.path.startsWith(prefix)).length;

describe('Console en mode poll', () => {
  it('n’ouvre pas de socket et recharge la carte et la file toutes les 10 s, en pause onglet masqué', async () => {
    const { calls, vis } = renderPoll(<LivePage />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(io).not.toHaveBeenCalled();
    expect(count(calls, '/controller/map')).toBe(1);
    expect(count(calls, '/controller/orders/pending')).toBe(1);
    expect(count(calls, '/controller/incidents')).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(count(calls, '/controller/map')).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(count(calls, '/controller/map')).toBe(2);
    expect(count(calls, '/controller/orders/pending')).toBe(2);

    act(() => vis.set(false));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(count(calls, '/controller/map')).toBe(2);

    act(() => vis.set(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(count(calls, '/controller/map')).toBe(3);
    expect(count(calls, '/controller/orders/pending')).toBe(3);
    // Alertes : une requête partagée (chargement + 15 s + retour), jamais de doublon avec l'en-tête.
    expect(count(calls, '/controller/incidents')).toBe(2);
  });

  it('budget Vercel : une console inactive sur la carte en direct fait au plus ~0,35 requête/s', async () => {
    const { calls } = renderPoll(liveConsole);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    const start = calls.length;
    const windowMs = 300_000;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(windowMs);
    });
    const made = calls.slice(start);
    const perSecond = made.length / (windowMs / 1000);
    // carte 30 + file 30 + alertes 20 + indicateurs 10 + boutiques 5 = 95 requêtes en 5 min ≈ 0,32/s.
    expect(perSecond).toBeLessThanOrEqual(0.35);
    expect(count(made, '/controller/map')).toBe(30);
    expect(count(made, '/controller/orders/pending')).toBe(30);
    expect(count(made, '/controller/incidents')).toBe(20);
    expect(count(made, '/controller/dashboard')).toBe(10);
    expect(count(made, '/controller/stores')).toBe(5);
    expect(count(made, '/controller/drivers')).toBe(0); // file KYC : rechargée seulement si sa pastille change
    expect(made.every((c) => c.method === 'GET')).toBe(true);
  });

  it('course livrée (disparue de la carte) : indicateurs rechargés aussitôt, sans attendre leur rythme de 30 s', async () => {
    const active = {
      id: 'ord-1008', number: 1008, type: 'PARCEL' as const, status: 'PICKED_UP' as const, vehicleType: 'MOTO' as const,
      pickup: { lat: 12.3686, lng: -1.5275, address: 'Centre' }, dropoff: { lat: 12.3226, lng: -1.4977, address: 'Ouaga 2000' },
      driverId: 'drv-karim', createdAt: '2026-11-09T03:10:00.000Z', route: null,
    };
    let delivered = false;
    const { calls } = renderPoll(liveConsole, fakeVisibility(), '/', {
      routes: {
        'GET /controller/map': () => ({ body: { ...mapData, orders: delivered ? [] : [active] } }),
        'GET /controller/dashboard': () => ({ body: { ...dashboard, deliveredToday: delivered ? 2 : 1 } }),
      },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    const deliveredKpi = () => within(screen.getByRole('article', { name: "Livrées aujourd'hui" })).getByText(/^\d+$/).textContent;
    expect(count(calls, '/controller/dashboard')).toBe(1);
    expect(deliveredKpi()).toBe('1');
    // Carte inchangée au rafraîchissement suivant : pas de requête de plus.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    expect(count(calls, '/controller/dashboard')).toBe(1);
    // La course est livrée : elle quitte la carte au rafraîchissement suivant, les indicateurs suivent dans la seconde.
    delivered = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(count(calls, '/controller/map')).toBe(3);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(count(calls, '/controller/dashboard')).toBe(2);
    expect(deliveredKpi()).toBe('2');
  });

  it('inactivité de 15 min : bandeau « Actualisation en pause », plus aucune requête ; un clic reprend aussitôt', async () => {
    expect(IDLE_PAUSE_MS).toBe(15 * 60_000);
    const { calls } = renderPoll(liveConsole);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDLE_PAUSE_MS - 1000);
    });
    expect(screen.queryByText(/Actualisation en pause/)).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    const banner = screen.getByRole('button', { name: 'Actualisation en pause (inactivité) — cliquez pour reprendre' });
    expect(screen.getByText('Actualisation en pause')).toBeInTheDocument();
    const paused = calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60_000);
    });
    expect(calls.length).toBe(paused);

    const maps = count(calls, '/controller/map');
    fireEvent.pointerDown(banner);
    fireEvent.click(banner);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    // Reprise : un rafraîchissement immédiat de chaque écran, puis le rythme normal.
    expect(count(calls, '/controller/map')).toBe(maps + 1);
    expect(count(calls, '/controller/incidents')).toBeGreaterThan(0);
    expect(screen.queryByText(/Actualisation en pause/)).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(count(calls, '/controller/map')).toBe(maps + 2);
  });

  it('toute interaction (clavier) reprend aussi ; l’activité régulière empêche la pause', async () => {
    const { calls } = renderPoll(liveConsole, fakeVisibility(), '/', { idlePauseMs: 60_000 });
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50_000);
      });
      fireEvent.pointerMove(window, { clientX: 100 + i * 20, clientY: 40 });
    }
    expect(screen.queryByText(/Actualisation en pause/)).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByText(/cliquez pour reprendre/)).toBeInTheDocument();
    const before = count(calls, '/controller/orders/pending');
    fireEvent.keyDown(window, { key: 'Tab' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(count(calls, '/controller/orders/pending')).toBe(before + 1);
    expect(screen.queryByText(/cliquez pour reprendre/)).not.toBeInTheDocument();
  });

  it('SOS : une seule source pour l’en-tête et la carte ; un nouveau SOS ouvre une alerte', async () => {
    let incidents: unknown[] = [];
    const { calls } = renderPoll(liveConsole, fakeVisibility(), '/', {
      routes: { 'GET /controller/incidents': (_c: FakeCall) => ({ body: page(incidents) }) },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.queryByText('SOS · Karim D.')).not.toBeInTheDocument();
    incidents = [sos];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.getByText('SOS · Karim D.')).toBeInTheDocument();
    const paths = calls.filter((c) => c.path.startsWith('/controller/incidents')).map((c) => c.path);
    expect(paths).toHaveLength(2);
    expect(paths.every((p) => new URL(p, 'http://x').searchParams.get('status') === 'OPEN,IN_PROGRESS')).toBe(true);
  });

  it('en-tête : indicateur d’actualisation automatique et badge DÉMO', async () => {
    renderPoll(
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<div>accueil</div>} />
        </Route>
      </Routes>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByText('Actualisation automatique toutes les 10 s')).toBeInTheDocument();
    expect(screen.getByText('Démo')).toBeInTheDocument();
    expect(screen.queryByText('Temps réel')).not.toBeInTheDocument();
  });
});

describe('Écran de connexion en mode démo', () => {
  function renderLogin(routes: Record<string, unknown> = {}) {
    const { impl, calls } = fakeFetch(routes);
    render(
      <MemoryRouter initialEntries={['/connexion']}>
        <AppConfigProvider baseUrl="http://api.test" initialConfig={pollConfig}>
          <AuthProvider baseUrl="http://api.test" fetchImpl={impl} initialToken={null} initialUser={null}>
            <Routes>
              <Route path="/connexion" element={<LoginPage />} />
            </Routes>
          </AuthProvider>
        </AppConfigProvider>
      </MemoryRouter>,
    );
    return calls;
  }

  it('annonce le code d’accès démo fourni par Yaar, l’avertissement, et remplit seulement le numéro', async () => {
    const calls = renderLogin({ 'POST /auth/otp/request': { sent: true, expiresInSeconds: 300 } });
    expect(screen.getByText(/code d’accès démo fourni par Yaar/)).toBeInTheDocument();
    expect(screen.getByText(DEMO_DATA_WARNING)).toBeInTheDocument();
    expect(screen.queryByText(/123456/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Contrôleur · Salif K\./ }));
    expect(screen.getByLabelText('Numéro de téléphone')).toHaveValue('70000002');
    fireEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(calls.map((c) => c.path)).toEqual(['/auth/otp/request']);
    // Aucun code pré-rempli : le code d'accès est saisi à la main.
    const input = screen.getByLabelText('Code d’accès démo (fourni par Yaar)');
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', '6 chiffres');
    expect(screen.getByText(/saisissez le code d’accès démo fourni par Yaar/)).toBeInTheDocument();
    expect(screen.queryByText(/123456/)).not.toBeInTheDocument();
  });
});
