import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { PublicConfigDto } from '@yaar/shared';

/**
 * Configuration publique de l'API (GET /config, docs/API.md §1.8), lue au démarrage avant la connexion :
 * mode temps réel (socket / poll), intervalle de rafraîchissement, mode démo.
 */

/** Hors de tout <AppConfigProvider> (tests) : comportement historique, Socket.IO. */
export const SOCKET_DEFAULT_CONFIG: PublicConfigDto = {
  realtime: 'socket',
  pollIntervalMs: 4000,
  demoMode: false,
  otpChannel: 'sms',
};

/** /config injoignable : le polling REST fonctionne avec tous les serveurs, c'est le choix sûr. */
export const FALLBACK_CONFIG: PublicConfigDto = {
  realtime: 'poll',
  pollIntervalMs: 4000,
  demoMode: false,
  otpChannel: 'sms',
};

interface AppConfigValue {
  /** null pendant le chargement. */
  config: PublicConfigDto | null;
}

const AppConfigContext = createContext<AppConfigValue>({ config: SOCKET_DEFAULT_CONFIG });

/** Valide la réponse de /config (valeurs par défaut pour les champs absents ou invalides). */
export function parsePublicConfig(raw: unknown): PublicConfigDto {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const interval = typeof o.pollIntervalMs === 'number' && o.pollIntervalMs >= 1000 ? o.pollIntervalMs : 4000;
  const channel = o.otpChannel === 'whatsapp' || o.otpChannel === 'console' || o.otpChannel === 'sms' ? o.otpChannel : 'sms';
  return {
    realtime: o.realtime === 'poll' ? 'poll' : 'socket',
    pollIntervalMs: interval,
    demoMode: o.demoMode === true,
    otpChannel: channel,
  };
}

export async function fetchPublicConfig(
  baseUrl: string,
  fetchImpl: typeof fetch = (i, init) => fetch(i, init),
  attempts = 3,
  retryDelayMs = 1000,
): Promise<PublicConfigDto> {
  const url = `${baseUrl.replace(/\/+$/, '')}/config`;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
      if (res.ok) return parsePublicConfig(await res.json());
      if (res.status === 404) return SOCKET_DEFAULT_CONFIG; // ancienne API sans /config
    } catch {
      /* réseau : on réessaie */
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, retryDelayMs * (i + 1)));
  }
  return FALLBACK_CONFIG;
}

export interface AppConfigProviderProps {
  baseUrl: string;
  children: ReactNode;
  /** Pour les tests : configuration fixée (aucune requête). */
  initialConfig?: PublicConfigDto;
  fetchImpl?: typeof fetch;
}

export function AppConfigProvider({ baseUrl, children, initialConfig, fetchImpl }: AppConfigProviderProps) {
  const [config, setConfig] = useState<PublicConfigDto | null>(initialConfig ?? null);
  useEffect(() => {
    if (initialConfig) return undefined;
    let cancelled = false;
    void fetchPublicConfig(baseUrl, fetchImpl).then((c) => {
      if (!cancelled) setConfig(c);
    });
    return () => {
      cancelled = true;
    };
  }, [baseUrl, fetchImpl, initialConfig]);
  return <AppConfigContext.Provider value={{ config }}>{children}</AppConfigContext.Provider>;
}

export function useAppConfig(): AppConfigValue {
  return useContext(AppConfigContext);
}
