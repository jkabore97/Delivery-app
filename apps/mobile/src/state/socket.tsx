import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ServerToClientEvents } from '@yaar/shared';
import { API_URL } from '../config';
import { createSocket, type YaarSocket } from '../lib/socket';
import { useAuth } from './auth';

interface SocketContextValue {
  socket: YaarSocket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextValue>({ socket: null, connected: false });

/** Une connexion Socket.IO par session (authentifiée par le JWT). */
export function SocketProvider({ children }: { children: ReactNode }) {
  const { token, signOut } = useAuth();
  const [socket, setSocket] = useState<YaarSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) {
      setSocket(null);
      setConnected(false);
      return;
    }
    const s = createSocket(API_URL, token);
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', (err) => {
      setConnected(false);
      if (err.message === 'ACCOUNT_SUSPENDED') void signOut('Votre compte est suspendu.');
      if (err.message === 'UNAUTHENTICATED') void signOut('Session expirée, reconnectez-vous.');
    });
    setSocket(s);
    return () => {
      s.removeAllListeners();
      s.disconnect();
    };
  }, [token, signOut]);

  return <SocketContext.Provider value={{ socket, connected }}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  return useContext(SocketContext);
}

/** Écoute un événement serveur ; le gestionnaire le plus récent est toujours utilisé. */
export function useSocketEvent<E extends keyof ServerToClientEvents>(
  event: E,
  handler: ServerToClientEvents[E],
): void {
  const { socket } = useSocket();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!socket) return;
    const listener = ((...args: Parameters<ServerToClientEvents[E]>) => {
      (ref.current as (...a: Parameters<ServerToClientEvents[E]>) => void)(...args);
    }) as ServerToClientEvents[E];
    // Les types génériques de socket.io ne se combinent pas avec une clé générique : cast local.
    (socket as unknown as { on: (e: string, l: unknown) => void }).on(event, listener);
    return () => {
      (socket as unknown as { off: (e: string, l: unknown) => void }).off(event, listener);
    };
  }, [socket, event]);
}

/**
 * Rejoint la salle `order:<id>` (et la rejoint de nouveau après chaque reconnexion).
 */
export function useOrderRoom(orderId: string | null | undefined): void {
  const { socket, connected } = useSocket();
  useEffect(() => {
    if (!socket || !connected || !orderId) return;
    socket.emit('order.subscribe', { orderId }, () => undefined);
    return () => {
      socket.emit('order.unsubscribe', { orderId });
    };
  }, [socket, connected, orderId]);
}
