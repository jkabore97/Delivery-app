import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { PublicConfigDto } from '@yaar/shared';
import { API_URL } from '../config';
import { fetchPublicConfig, SOCKET_DEFAULT_CONFIG } from '../lib/publicConfig';

interface AppConfigValue {
  /** null pendant le chargement de GET /config. */
  config: PublicConfigDto | null;
}

const AppConfigContext = createContext<AppConfigValue>({ config: SOCKET_DEFAULT_CONFIG });

export function AppConfigProvider({
  children,
  initialConfig,
  fetchFn,
}: {
  children: ReactNode;
  /** Pour les tests : configuration fixée (aucune requête). */
  initialConfig?: PublicConfigDto;
  fetchFn?: typeof fetch;
}) {
  const [config, setConfig] = useState<PublicConfigDto | null>(initialConfig ?? null);
  useEffect(() => {
    if (initialConfig) return;
    let cancelled = false;
    void fetchPublicConfig(API_URL, fetchFn).then((c) => {
      if (!cancelled) setConfig(c);
    });
    return () => {
      cancelled = true;
    };
  }, [initialConfig, fetchFn]);
  return <AppConfigContext.Provider value={{ config }}>{children}</AppConfigContext.Provider>;
}

export function useAppConfig(): AppConfigValue {
  return useContext(AppConfigContext);
}
