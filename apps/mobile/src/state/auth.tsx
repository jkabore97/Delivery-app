import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AuthResponse, UserDto } from '@yaar/shared';
import { API_URL } from '../config';
import { createApiClient, type ApiClient } from '../lib/api';
import { clearSession, loadSession, saveSession } from '../lib/storage';

type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: AuthStatus;
  token: string | null;
  user: UserDto | null;
  api: ApiClient;
  /** Message affiché sur l'écran de connexion après une déconnexion forcée (jeton expiré, compte suspendu). */
  notice: string | null;
  signIn: (auth: AuthResponse) => Promise<void>;
  signOut: (notice?: string) => Promise<void>;
  setUser: (user: UserDto) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [user, setUserState] = useState<UserDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const expiresAtRef = useRef<number>(0);

  const signOut = useCallback(async (message?: string) => {
    tokenRef.current = null;
    setToken(null);
    setUserState(null);
    setNotice(message ?? null);
    setStatus('signedOut');
    await clearSession().catch(() => undefined);
  }, []);

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: API_URL,
        getToken: () => tokenRef.current,
        onAuthError: (err) => {
          void signOut(err.code === 'ACCOUNT_SUSPENDED' ? err.message : 'Session expirée, reconnectez-vous.');
        },
      }),
    [signOut],
  );

  useEffect(() => {
    let cancelled = false;
    void loadSession().then((s) => {
      if (cancelled) return;
      if (s) {
        tokenRef.current = s.token;
        expiresAtRef.current = s.expiresAt;
        setToken(s.token);
        setUserState(s.user);
        setStatus('signedIn');
        // Rafraîchit le profil (rôle, suspension) en arrière-plan.
        api.me().then(
          (u) => {
            if (!cancelled) {
              setUserState(u);
              void saveSession({ token: s.token, user: u, expiresAt: s.expiresAt });
            }
          },
          () => undefined,
        );
      } else {
        setStatus('signedOut');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const signIn = useCallback(async (auth: AuthResponse) => {
    const expiresAt = Date.now() + auth.expiresIn * 1000;
    tokenRef.current = auth.accessToken;
    expiresAtRef.current = expiresAt;
    setToken(auth.accessToken);
    setUserState(auth.user);
    setNotice(null);
    setStatus('signedIn');
    await saveSession({ token: auth.accessToken, user: auth.user, expiresAt });
  }, []);

  const setUser = useCallback((u: UserDto) => {
    setUserState(u);
    if (tokenRef.current) {
      void saveSession({ token: tokenRef.current, user: u, expiresAt: expiresAtRef.current });
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, token, user, api, notice, signIn, signOut, setUser }),
    [status, token, user, api, notice, signIn, signOut, setUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}

export function useApi(): ApiClient {
  return useAuth().api;
}
