import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { RealtimeProvider, useReconnect, useRealtime } from '../src/realtime/RealtimeContext';

const fake = vi.hoisted(() => {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const socket = {
    on(e: string, h: (...args: unknown[]) => void) {
      const set = handlers.get(e) ?? new Set();
      set.add(h);
      handlers.set(e, set);
      return socket;
    },
    off(e: string, h: (...args: unknown[]) => void) {
      handlers.get(e)?.delete(h);
      return socket;
    },
    disconnect: vi.fn(),
    fire(e: string, ...args: unknown[]) {
      handlers.get(e)?.forEach((h) => h(...args));
    },
  };
  return { socket, handlers };
});

vi.mock('socket.io-client', () => ({ io: vi.fn(() => fake.socket) }));

function Probe({ onReconnect }: { onReconnect: () => void }) {
  useReconnect(onReconnect);
  const { connected } = useRealtime();
  return <span>{connected ? 'connecté' : 'déconnecté'}</span>;
}

describe('RealtimeProvider (socket.io simulé)', () => {
  it('signale les reconnexions (pas la première connexion)', () => {
    const onReconnect = vi.fn();
    const { getByText } = render(
      <RealtimeProvider url="http://api.test" token="tok">
        <Probe onReconnect={onReconnect} />
      </RealtimeProvider>,
    );
    act(() => fake.socket.fire('connect'));
    expect(getByText('connecté')).toBeInTheDocument();
    expect(onReconnect).not.toHaveBeenCalled();
    act(() => fake.socket.fire('disconnect'));
    act(() => fake.socket.fire('connect'));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('ferme la session sur une erreur d’authentification du socket', () => {
    const onAuthError = vi.fn<(code: string) => void>();
    render(
      <RealtimeProvider url="http://api.test" token="tok" onAuthError={onAuthError}>
        <Probe onReconnect={() => undefined} />
      </RealtimeProvider>,
    );
    fake.socket.disconnect.mockClear();
    act(() => fake.socket.fire('connect_error', new Error('xhr poll error')));
    expect(onAuthError).not.toHaveBeenCalled();
    expect(fake.socket.disconnect).not.toHaveBeenCalled();
    act(() => fake.socket.fire('connect_error', new Error('ACCOUNT_SUSPENDED')));
    expect(onAuthError).toHaveBeenCalledWith('ACCOUNT_SUSPENDED');
    expect(fake.socket.disconnect).toHaveBeenCalled();
  });
});
