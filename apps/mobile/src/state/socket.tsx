import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { RealtimeMode, ServerToClientEvents } from '@yaar/shared';
import { API_URL } from '../config';
import { appStateVisibility, PollScheduler, type PollTask, type VisibilitySource } from '../lib/pollScheduler';
import type { YaarSocket } from '../lib/socket';
import { loadSocketModule } from '../lib/socketLoader';
import { useAuth } from './auth';
import { useAppConfig } from './config';

interface SocketContextValue {
  socket: YaarSocket | null;
  connected: boolean;
  /** null tant que GET /config n'a pas répondu. */
  mode: RealtimeMode | null;
  /** Mode poll : planificateur des rafraîchissements (null en mode socket). */
  scheduler: PollScheduler | null;
  pollIntervalMs: number;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  connected: false,
  mode: null,
  scheduler: null,
  pollIntervalMs: 4000,
});

/**
 * Temps réel de la session : une connexion Socket.IO (authentifiée par le JWT) en mode « socket » ;
 * en mode « poll » (API sur Vercel), aucun socket mais un planificateur de rafraîchissements REST
 * suspendu quand l'application passe en arrière-plan (voir usePolling). Le client Socket.IO (~50 ko) n'est
 * chargé qu'en mode « socket » et une fois connecté : ni la page publique de suivi ni le mode poll ne le
 * téléchargent.
 */
export function SocketProvider({ children, visibility }: { children: ReactNode; visibility?: VisibilitySource }) {
  const { token, signOut } = useAuth();
  const { config } = useAppConfig();
  const mode = config?.realtime ?? null;
  const pollIntervalMs = config?.pollIntervalMs ?? 4000;
  const [socket, setSocket] = useState<YaarSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [scheduler, setScheduler] = useState<PollScheduler | null>(null);

  useEffect(() => {
    if (!token || mode !== 'poll') return;
    const sched = new PollScheduler(visibility ?? appStateVisibility());
    setScheduler(sched);
    return () => {
      sched.dispose();
      setScheduler(null);
    };
  }, [token, mode, visibility]);

  useEffect(() => {
    if (!token || mode !== 'socket') {
      setSocket(null);
      setConnected(false);
      return;
    }
    let cancelled = false;
    let s: YaarSocket | null = null;
    void loadSocketModule().then(({ createSocket }) => {
      if (cancelled) return;
      const sock = createSocket(API_URL, token);
      s = sock;
      sock.on('connect', () => setConnected(true));
      sock.on('disconnect', () => setConnected(false));
      sock.on('connect_error', (err) => {
        setConnected(false);
        if (err.message === 'ACCOUNT_SUSPENDED') void signOut('Votre compte est suspendu.');
        if (err.message === 'UNAUTHENTICATED') void signOut('Session expirée, reconnectez-vous.');
      });
      setSocket(sock);
    });
    return () => {
      cancelled = true;
      s?.removeAllListeners();
      s?.disconnect();
    };
  }, [token, signOut, mode]);

  const value = useMemo<SocketContextValue>(
    () =>
      mode === 'poll'
        ? { socket: null, connected: true, mode, scheduler, pollIntervalMs }
        : { socket, connected, mode, scheduler: null, pollIntervalMs },
    [mode, scheduler, pollIntervalMs, socket, connected],
  );
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

/** Mode du temps réel ('socket' | 'poll' | null pendant le chargement de /config). */
export function useRealtimeMode(): RealtimeMode | null {
  return useContext(SocketContext).mode;
}

/**
 * Mode poll uniquement : appelle `task` toutes les `intervalMs` (jamais plus vite que `pollIntervalMs`
 * de GET /config ; 0 = `pollIntervalMs`), en pause quand l'application est en arrière-plan et relancée
 * immédiatement au retour. Sans effet en mode socket (les événements font le travail).
 * `task` peut renvoyer `false` ou rejeter : l'intervalle est alors doublé (30 s au plus).
 */
export function usePolling(task: PollTask, intervalMs: number, enabled = true): void {
  const { scheduler, pollIntervalMs } = useContext(SocketContext);
  const ref = useRef(task);
  ref.current = task;
  const every = Math.max(intervalMs, pollIntervalMs);
  useEffect(() => {
    if (!scheduler || !enabled) return;
    return scheduler.add(() => ref.current(), every);
  }, [scheduler, every, enabled]);
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

/** Plusieurs salles `order:<id>` (carte d'ensemble de l'entreprise : positions des livreurs en mode socket). */
export function useOrderRooms(orderIds: readonly string[]): void {
  const { socket, connected } = useSocket();
  const key = [...orderIds].sort().join(',');
  useEffect(() => {
    if (!socket || !connected || !key) return;
    const ids = key.split(',');
    for (const orderId of ids) socket.emit('order.subscribe', { orderId }, () => undefined);
    return () => {
      for (const orderId of ids) socket.emit('order.unsubscribe', { orderId });
    };
  }, [socket, connected, key]);
}
