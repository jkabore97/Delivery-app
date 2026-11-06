import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { UserDto } from '@yaar/shared';
import { AuthProvider } from '../src/auth/AuthContext';
import { RealtimeProvider, createMemoryBus } from '../src/realtime/RealtimeContext';

export interface FakeCall {
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string>;
}

type Handler = (call: FakeCall) => { status?: number; body?: unknown } | undefined;

/** fetch simulé : routes « METHOD /chemin » (sans query string) -> réponse JSON. */
export function fakeFetch(routes: Record<string, unknown | Handler>) {
  const calls: FakeCall[] = [];
  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const call: FakeCall = {
      method,
      path: url.pathname + url.search,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
    calls.push(call);
    const route = routes[`${method} ${url.pathname}`];
    if (route === undefined) {
      return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Route inconnue' } }), { status: 404 });
    }
    const res = typeof route === 'function' ? (route as Handler)(call) ?? {} : { body: route };
    const status = res.status ?? 200;
    if (status === 204) return new Response(null, { status });
    return new Response(JSON.stringify(res.body ?? {}), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { impl: impl as typeof fetch, calls };
}

/** Appels hors revalidation du profil (GET /me au démarrage). */
export function apiCalls(calls: FakeCall[]): FakeCall[] {
  return calls.filter((c) => c.path !== '/me');
}

export const adminUser = (): UserDto => ({ ...controllerUser, id: 'u-admin', name: 'Awa T.', role: 'ADMIN' });

export const controllerUser: UserDto = {
  id: 'u-ctrl',
  phone: '+22670000002',
  name: 'Salif K.',
  role: 'CONTROLLER',
  isSuspended: false,
  suspensionReason: null,
  createdAt: '2026-11-01T10:00:00.000Z',
};

export function renderWithProviders(
  ui: ReactElement,
  {
    routes = {},
    path = '/',
    loggedIn = true,
    bus = createMemoryBus(),
    user = controllerUser,
  }: {
    routes?: Record<string, unknown>;
    path?: string;
    loggedIn?: boolean;
    bus?: ReturnType<typeof createMemoryBus>;
    user?: UserDto;
  } = {},
) {
  const { impl, calls } = fakeFetch(routes);
  // Vrai ApiClient de l'AuthProvider (déconnexion sur 401 comprise), avec un fetch simulé.
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider
        baseUrl="http://api.test"
        fetchImpl={impl}
        initialToken={loggedIn ? 'tok' : null}
        initialUser={loggedIn ? user : null}
      >
        <RealtimeProvider url="http://api.test" token="tok" busOverride={bus}>
          {ui}
        </RealtimeProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
  return { ...utils, calls, bus };
}
