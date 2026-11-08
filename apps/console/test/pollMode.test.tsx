import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { PublicConfigDto } from '@yaar/shared';
import { AuthProvider } from '../src/auth/AuthContext';
import { Layout } from '../src/components/Layout';
import { LivePage } from '../src/pages/LivePage';
import { LoginPage } from '../src/pages/LoginPage';
import { AppConfigProvider, fetchPublicConfig, parsePublicConfig } from '../src/realtime/AppConfigContext';
import { PollScheduler, type VisibilitySource } from '../src/realtime/pollScheduler';
import { RealtimeProvider } from '../src/realtime/RealtimeContext';
import { dashboard, mapData, page, pendingOrder } from './fixtures';
import { controllerUser, fakeFetch } from './helpers';

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

function renderPoll(ui: React.ReactElement, vis = fakeVisibility(), path = '/') {
  const routes = {
    'GET /controller/map': mapData,
    'GET /controller/orders/pending': [pendingOrder],
    'GET /controller/drivers': page([]),
    'GET /controller/incidents': page([]),
    'GET /controller/dashboard': dashboard,
    'GET /controller/stores': page([]),
    'GET /me': controllerUser,
  };
  const { impl, calls } = fakeFetch(routes);
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <AppConfigProvider baseUrl="http://api.test" initialConfig={pollConfig}>
        <AuthProvider baseUrl="http://api.test" fetchImpl={impl} initialToken="tok" initialUser={controllerUser}>
          <RealtimeProvider url="http://api.test" token="tok" visibility={vis.source}>
            {ui}
          </RealtimeProvider>
        </AuthProvider>
      </AppConfigProvider>
    </MemoryRouter>,
  );
  return { ...utils, calls, vis };
}

const count = (calls: { path: string }[], prefix: string) => calls.filter((c) => c.path.startsWith(prefix)).length;

describe('Console en mode poll', () => {
  it('n’ouvre pas de socket et recharge la carte et la file toutes les 5 s, en pause onglet masqué', async () => {
    const { calls, vis } = renderPoll(<LivePage />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(io).not.toHaveBeenCalled();
    expect(count(calls, '/controller/map')).toBe(1);
    expect(count(calls, '/controller/orders/pending')).toBe(1);

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
    expect(count(calls, '/controller/incidents')).toBeGreaterThanOrEqual(4); // 2 au chargement + 2 au retour
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
    expect(screen.getByText('Actualisation automatique toutes les 5 s')).toBeInTheDocument();
    expect(screen.getByText('DÉMO')).toBeInTheDocument();
    expect(screen.queryByText('Temps réel')).not.toBeInTheDocument();
  });
});

describe('Écran de connexion en mode démo', () => {
  it('affiche le code 123456 et remplit le numéro d’un compte de démonstration en un clic', async () => {
    const { impl } = fakeFetch({});
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
    expect(screen.getByText('Mode démo : utilisez le code 123456')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Contrôleur · Salif K\./ }));
    expect(screen.getByLabelText('Numéro de téléphone')).toHaveValue('70000002');
  });
});
