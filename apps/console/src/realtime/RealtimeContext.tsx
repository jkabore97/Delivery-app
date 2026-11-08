import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, RealtimeMode, ServerToClientEvents } from '@yaar/shared';
import { POLL_MS } from '../config';
import { useAppConfig } from './AppConfigContext';
import { documentVisibility, PollScheduler, type PollTask, type VisibilitySource } from './pollScheduler';

export type ConsoleSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type ServerEventName = keyof ServerToClientEvents;

/** Petite interface d'abonnement, indépendante de socket.io (facile à simuler en test). */
export interface RealtimeBus {
  on<E extends ServerEventName>(event: E, handler: ServerToClientEvents[E]): () => void;
  /**
   * Appelé à chaque reconnexion (pas à la première connexion) : les événements manqués pendant
   * la coupure doivent être rattrapés par un rechargement REST (docs/API.md §9.3).
   */
  onReconnect(handler: () => void): () => void;
}

/** Codes d'erreur d'authentification renvoyés par le serveur Socket.IO dans `connect_error`. */
export const SOCKET_AUTH_ERRORS = ['UNAUTHENTICATED', 'ACCOUNT_SUSPENDED'] as const;

interface RealtimeValue {
  bus: RealtimeBus | null;
  /** Socket connecté (mode socket) ; toujours vrai en mode poll (REST). */
  connected: boolean;
  /** null tant que GET /config n'a pas répondu. */
  mode: RealtimeMode | null;
  /** Mode poll : planificateur des rafraîchissements (null en mode socket). */
  scheduler: PollScheduler | null;
  /** Intervalle minimal conseillé par l'API (GET /config). */
  pollIntervalMs: number;
}

const RealtimeContext = createContext<RealtimeValue>({
  bus: null,
  connected: false,
  mode: null,
  scheduler: null,
  pollIntervalMs: 4000,
});

function busFromSocket(socket: ConsoleSocket): RealtimeBus {
  const reconnectHandlers = new Set<() => void>();
  let connectedOnce = false;
  socket.on('connect', () => {
    if (connectedOnce) reconnectHandlers.forEach((h) => h());
    connectedOnce = true;
  });
  return {
    onReconnect(handler) {
      reconnectHandlers.add(handler);
      return () => {
        reconnectHandlers.delete(handler);
      };
    },
    on(event, handler) {
      // Les signatures sont garanties par le typage de ServerToClientEvents.
      const s = socket as unknown as {
        on: (e: string, h: (...args: unknown[]) => void) => void;
        off: (e: string, h: (...args: unknown[]) => void) => void;
      };
      const h = handler as unknown as (...args: unknown[]) => void;
      s.on(event, h);
      return () => s.off(event, h);
    },
  };
}

export interface RealtimeProviderProps {
  url: string;
  token: string | null;
  children: ReactNode;
  /** Pour les tests : bus injecté (aucune connexion réseau). */
  busOverride?: RealtimeBus;
  /** Jeton refusé ou compte suspendu à la connexion du socket : la session doit être fermée. */
  onAuthError?: (code: (typeof SOCKET_AUTH_ERRORS)[number]) => void;
  /** Pour les tests : source de visibilité de l'onglet (mode poll). */
  visibility?: VisibilitySource;
}

interface SocketState {
  bus: RealtimeBus | null;
  connected: boolean;
}

export function RealtimeProvider({ url, token, children, busOverride, onAuthError, visibility }: RealtimeProviderProps) {
  const onAuthErrorRef = useRef(onAuthError);
  onAuthErrorRef.current = onAuthError;
  const { config } = useAppConfig();
  const mode: RealtimeMode | null = busOverride ? 'socket' : (config?.realtime ?? null);
  const pollIntervalMs = config?.pollIntervalMs ?? 4000;
  const [socketState, setValue] = useState<SocketState>({ bus: busOverride ?? null, connected: Boolean(busOverride) });
  const [scheduler, setScheduler] = useState<PollScheduler | null>(null);

  // Mode poll : aucun socket ; un planificateur suspendu quand l'onglet est masqué.
  useEffect(() => {
    if (mode !== 'poll' || !token) return undefined;
    const s = new PollScheduler(visibility ?? documentVisibility());
    setScheduler(s);
    return () => {
      s.dispose();
      setScheduler(null);
    };
  }, [mode, token, visibility]);

  useEffect(() => {
    if (busOverride || !token || mode !== 'socket') return undefined;
    const socket: ConsoleSocket = io(url, { auth: { token }, transports: ['websocket', 'polling'] });
    const bus = busFromSocket(socket);
    setValue({ bus, connected: false });
    socket.on('connect', () => setValue({ bus, connected: true }));
    socket.on('disconnect', () => setValue({ bus, connected: false }));
    socket.on('connect_error', (err: Error) => {
      setValue({ bus, connected: false });
      const code = SOCKET_AUTH_ERRORS.find((c) => c === err.message);
      if (code) {
        // Inutile de réessayer avec un jeton mort : on coupe et on renvoie vers la connexion.
        socket.disconnect();
        onAuthErrorRef.current?.(code);
      }
    });
    return () => {
      socket.disconnect();
      setValue({ bus: null, connected: false });
    };
  }, [url, token, busOverride, mode]);

  const value = useMemo<RealtimeValue>(
    () =>
      mode === 'poll'
        ? { bus: null, connected: true, mode, scheduler, pollIntervalMs }
        : { ...socketState, mode, scheduler: null, pollIntervalMs },
    [mode, scheduler, pollIntervalMs, socketState],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeValue {
  return useContext(RealtimeContext);
}

/** S'abonne à un événement serveur ; le gestionnaire le plus récent est toujours utilisé. */
export function useSocketEvent<E extends ServerEventName>(event: E, handler: ServerToClientEvents[E]): void {
  const { bus } = useRealtime();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!bus) return undefined;
    const stable = ((...args: Parameters<ServerToClientEvents[E]>) =>
      (ref.current as (...a: Parameters<ServerToClientEvents[E]>) => void)(...args)) as ServerToClientEvents[E];
    return bus.on(event, stable);
  }, [bus, event]);
}

/** Exécute `handler` à chaque reconnexion du temps réel (rattrapage de l'état). */
export function useReconnect(handler: () => void): void {
  const { bus } = useRealtime();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!bus) return undefined;
    return bus.onReconnect(() => ref.current());
  }, [bus]);
}

/**
 * Mode poll uniquement : appelle `task` toutes les `intervalMs` (jamais plus vite que `pollIntervalMs`
 * de GET /config), en pause quand l'onglet est masqué, immédiatement au retour. Sans effet en mode
 * socket (les événements Socket.IO font le travail). `task` peut renvoyer `false` ou rejeter :
 * l'intervalle est alors doublé (30 s au plus).
 */
export function usePolling(task: PollTask, intervalMs: number, enabled = true): void {
  const { scheduler, pollIntervalMs } = useRealtime();
  const ref = useRef(task);
  ref.current = task;
  const every = Math.max(intervalMs, pollIntervalMs);
  useEffect(() => {
    if (!scheduler || !enabled) return undefined;
    return scheduler.add(() => ref.current(), every);
  }, [scheduler, every, enabled]);
}

/** Intervalle affiché dans l'en-tête en mode poll (celui de la carte en direct). */
export function useLiveIntervalMs(): number {
  const { pollIntervalMs } = useRealtime();
  return Math.max(POLL_MS.map, pollIntervalMs);
}

/** Bus en mémoire (tests, démonstration) : `emit` déclenche les gestionnaires abonnés. */
export function createMemoryBus(): RealtimeBus & {
  emit<E extends ServerEventName>(event: E, ...args: Parameters<ServerToClientEvents[E]>): void;
  /** Simule une reconnexion du socket. */
  reconnect(): void;
} {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const reconnectHandlers = new Set<() => void>();
  return {
    onReconnect(handler) {
      reconnectHandlers.add(handler);
      return () => {
        reconnectHandlers.delete(handler);
      };
    },
    reconnect() {
      reconnectHandlers.forEach((h) => h());
    },
    on(event, handler) {
      const set = handlers.get(event) ?? new Set();
      const h = handler as unknown as (...args: unknown[]) => void;
      set.add(h);
      handlers.set(event, set);
      return () => set.delete(h);
    },
    emit(event, ...args) {
      handlers.get(event)?.forEach((h) => h(...(args as unknown[])));
    },
  };
}
