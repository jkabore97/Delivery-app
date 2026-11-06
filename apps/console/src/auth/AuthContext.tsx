import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BACK_OFFICE_ROLES, type Role, type UserDto } from '@yaar/shared';
import { ApiClient } from '../api/client';
import { readStorage, writeStorage } from '../lib/storage';

const TOKEN_KEY = 'yaar.console.token';
const USER_KEY = 'yaar.console.user';

export function isBackOffice(role: Role): boolean {
  return (BACK_OFFICE_ROLES as readonly Role[]).includes(role);
}

export interface AuthState {
  token: string | null;
  user: UserDto | null;
  api: ApiClient;
  /** Enregistre la session après vérification OTP ; refuse les rôles hors back office. */
  login: (token: string, user: UserDto) => void;
  logout: (reason?: string) => void;
  /** Message affiché sur l'écran de connexion après une déconnexion forcée. */
  logoutReason: string | null;
}

const AuthContext = createContext<AuthState | null>(null);

function readUser(): UserDto | null {
  const raw = readStorage(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserDto;
  } catch {
    return null;
  }
}

export interface AuthProviderProps {
  baseUrl: string;
  children: ReactNode;
  /** Pour les tests : client API injecté. */
  apiOverride?: ApiClient;
  /** Pour les tests : fetch simulé, avec le câblage réel de la déconnexion sur 401. */
  fetchImpl?: typeof fetch;
  initialToken?: string | null;
  initialUser?: UserDto | null;
}

export function AuthProvider({ baseUrl, children, apiOverride, fetchImpl, initialToken, initialUser }: AuthProviderProps) {
  const [token, setToken] = useState<string | null>(() =>
    initialToken !== undefined ? initialToken : readStorage(TOKEN_KEY),
  );
  const [user, setUser] = useState<UserDto | null>(() => (initialUser !== undefined ? initialUser : readUser()));
  const [logoutReason, setLogoutReason] = useState<string | null>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const logout = useCallback((reason?: string) => {
    writeStorage(TOKEN_KEY, null);
    writeStorage(USER_KEY, null);
    tokenRef.current = null;
    setToken(null);
    setUser(null);
    setLogoutReason(reason ?? null);
  }, []);

  const api = useMemo(
    () =>
      apiOverride ??
      new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        fetchImpl,
        onUnauthorized: (err) =>
          logout(err.code === 'ACCOUNT_SUSPENDED' ? err.message : 'Votre session a expiré. Reconnectez-vous.'),
      }),
    [apiOverride, baseUrl, fetchImpl, logout],
  );

  // Le profil gardé dans le navigateur peut être périmé (rôle changé, compte suspendu) :
  // on le revalide une fois au démarrage. Un 401 / ACCOUNT_SUSPENDED déconnecte via onUnauthorized.
  const revalidated = useRef(false);
  useEffect(() => {
    if (revalidated.current || !tokenRef.current) return;
    revalidated.current = true;
    let cancelled = false;
    api
      .me()
      .then((fresh) => {
        if (cancelled || !tokenRef.current) return;
        if (!isBackOffice(fresh.role)) {
          logout('Accès réservé aux contrôleurs. Utilisez l’application mobile.');
          return;
        }
        writeStorage(USER_KEY, JSON.stringify(fresh));
        setUser(fresh);
      })
      .catch(() => {
        // Erreur réseau ou serveur : on garde la session locale ; les appels suivants trancheront.
      });
    return () => {
      cancelled = true;
    };
  }, [api, logout]);

  const login = useCallback((newToken: string, newUser: UserDto) => {
    if (!isBackOffice(newUser.role)) {
      throw new Error('Accès réservé aux contrôleurs. Utilisez l’application mobile.');
    }
    writeStorage(TOKEN_KEY, newToken);
    writeStorage(USER_KEY, JSON.stringify(newUser));
    tokenRef.current = newToken;
    setToken(newToken);
    setUser(newUser);
    setLogoutReason(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ token, user, api, login, logout, logoutReason }),
    [token, user, api, login, logout, logoutReason],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}

export function useApi(): ApiClient {
  return useAuth().api;
}
