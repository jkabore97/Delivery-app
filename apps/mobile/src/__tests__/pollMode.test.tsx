import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import type { PublicConfigDto } from '@yaar/shared';
import { PollScheduler, type VisibilitySource } from '../lib/pollScheduler';
import { fetchPublicConfig, parsePublicConfig } from '../lib/publicConfig';
import { AppConfigProvider, useAppConfig } from '../state/config';
import { SocketProvider, usePolling, useRealtimeMode } from '../state/socket';

const mockCreateSocket = jest.fn();
jest.mock('../lib/socket', () => ({ createSocket: (...args: unknown[]) => mockCreateSocket(...args) }));
jest.mock('../config', () => ({ API_URL: 'http://test' }));
jest.mock('../state/auth', () => ({ useAuth: () => ({ token: 'jwt', signOut: jest.fn() }) }));

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

const poll: PublicConfigDto = { realtime: 'poll', pollIntervalMs: 4000, demoMode: true, otpChannel: 'console' };

beforeEach(() => {
  jest.useFakeTimers();
  mockCreateSocket.mockReset();
});
afterEach(() => jest.useRealTimers());

describe('PollScheduler (application)', () => {
  it('rythme régulier, pause en arrière-plan, rafraîchissement immédiat au retour, ralentit sur erreur', async () => {
    const vis = fakeVisibility();
    const s = new PollScheduler(vis.source);
    let fail = false;
    const task = jest.fn(async () => {
      if (fail) throw new Error('réseau');
      return true;
    });
    s.add(task, 4000);
    await act(async () => jest.advanceTimersByTimeAsync(4000));
    expect(task).toHaveBeenCalledTimes(1);
    vis.set(false);
    await act(async () => jest.advanceTimersByTimeAsync(60_000));
    expect(task).toHaveBeenCalledTimes(1);
    vis.set(true);
    await act(async () => jest.advanceTimersByTimeAsync(0));
    expect(task).toHaveBeenCalledTimes(2);
    fail = true;
    await act(async () => jest.advanceTimersByTimeAsync(4000)); // échec → prochain dans 8 s
    expect(task).toHaveBeenCalledTimes(3);
    await act(async () => jest.advanceTimersByTimeAsync(7999));
    expect(task).toHaveBeenCalledTimes(3);
    await act(async () => jest.advanceTimersByTimeAsync(1));
    expect(task).toHaveBeenCalledTimes(4);
    s.dispose();
  });
});

describe('GET /config', () => {
  it('lit la configuration et retombe sur le mode poll sans réponse', async () => {
    expect(parsePublicConfig({ realtime: 'poll', pollIntervalMs: 4000, demoMode: true, otpChannel: 'console' })).toEqual(poll);
    expect(parsePublicConfig({ realtime: 'bizarre' }).realtime).toBe('socket');
    const ok = jest.fn(async () => new Response(JSON.stringify(poll), { status: 200 })) as unknown as typeof fetch;
    await expect(fetchPublicConfig('http://api/', ok)).resolves.toEqual(poll);
    expect(ok).toHaveBeenCalledWith('http://api/config', expect.anything());
    const down = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    const p = fetchPublicConfig('http://api', down, 2, 10);
    await act(async () => jest.advanceTimersByTimeAsync(50));
    await expect(p).resolves.toMatchObject({ realtime: 'poll', demoMode: false });
  });

  it('AppConfigProvider expose la configuration chargée', async () => {
    const fetchFn = jest.fn(async () => new Response(JSON.stringify(poll), { status: 200 })) as unknown as typeof fetch;
    function Probe() {
      const { config } = useAppConfig();
      return <Text>{config ? `${config.realtime}/${String(config.demoMode)}` : 'chargement'}</Text>;
    }
    const r = await render(
      <AppConfigProvider fetchFn={fetchFn}>
        <Probe />
      </AppConfigProvider>,
    );
    await act(async () => jest.advanceTimersByTimeAsync(0));
    expect(r.getByText('poll/true')).toBeTruthy();
  });
});

describe('SocketProvider en mode poll', () => {
  function Poller({ task, every }: { task: () => unknown; every: number }) {
    usePolling(task, every);
    return <Text>{useRealtimeMode() ?? 'inconnu'}</Text>;
  }

  it('n’ouvre pas de socket et appelle les tâches usePolling, en pause en arrière-plan', async () => {
    const vis = fakeVisibility();
    const task = jest.fn(async () => true);
    const r = await render(
      <AppConfigProvider initialConfig={poll}>
        <SocketProvider visibility={vis.source}>
          <Poller task={task} every={0} />
        </SocketProvider>
      </AppConfigProvider>,
    );
    expect(r.getByText('poll')).toBeTruthy();
    expect(mockCreateSocket).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTimeAsync(4000)); // 0 → pollIntervalMs
    expect(task).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTimeAsync(4000));
    expect(task).toHaveBeenCalledTimes(2);
    await act(async () => vis.set(false));
    await act(async () => jest.advanceTimersByTimeAsync(30_000));
    expect(task).toHaveBeenCalledTimes(2);
    await act(async () => vis.set(true));
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('mode socket : socket créé, usePolling sans effet', async () => {
    const socket = { on: jest.fn(), removeAllListeners: jest.fn(), disconnect: jest.fn() };
    mockCreateSocket.mockReturnValue(socket);
    const task = jest.fn();
    await render(
      <AppConfigProvider initialConfig={{ ...poll, realtime: 'socket' }}>
        <SocketProvider>
          <Poller task={task} every={1000} />
        </SocketProvider>
      </AppConfigProvider>,
    );
    expect(mockCreateSocket).toHaveBeenCalledWith('http://test', 'jwt');
    await act(async () => jest.advanceTimersByTimeAsync(20_000));
    expect(task).not.toHaveBeenCalled();
  });
});
