import { ApiError, buildQuery, createApiClient, errorMessage, isApiError, NETWORK_ERROR_CODE } from './api';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  } as Response;
}

function setup(responses: Response[], token: string | null = 'tok') {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (!r) throw new Error('pas de réponse');
    return r;
  });
  const onAuthError = jest.fn();
  const api = createApiClient({
    baseUrl: 'http://api.test',
    getToken: () => token,
    fetchFn: fetchFn as unknown as typeof fetch,
    onAuthError,
  });
  return { api, calls, onAuthError };
}

describe('buildQuery', () => {
  it('ignore les valeurs vides et joint les listes par des virgules', () => {
    expect(buildQuery({ status: ['PENDING', 'ACCEPTED'], page: 1, q: undefined, x: '' })).toBe(
      '?status=PENDING%2CACCEPTED&page=1',
    );
    expect(buildQuery({})).toBe('');
  });
});

describe('createApiClient', () => {
  it('envoie le jeton Bearer et le corps JSON', async () => {
    const { api, calls } = setup([jsonResponse(200, { id: 'o1' })]);
    await api.createOrder({
      type: 'PARCEL',
      vehicleType: 'MOTO',
      pickup: { lat: 12.38, lng: -1.49, address: 'Zogona' },
      dropoff: { lat: 12.4, lng: -1.55, address: 'Tampouy' },
    });
    expect(calls[0]?.url).toBe('http://api.test/orders');
    expect(calls[0]?.init.method).toBe('POST');
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(String(calls[0]?.init.body)).vehicleType).toBe('MOTO');
  });

  it('n’envoie pas le jeton sur /auth', async () => {
    const { api, calls } = setup([jsonResponse(200, { sent: true, expiresInSeconds: 300 })]);
    await api.requestOtp('+22670000001');
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('transforme {error:{code,message}} en ApiError', async () => {
    const { api } = setup([
      jsonResponse(409, { error: { code: 'STORE_CLOSED', message: 'La boutique est fermée' } }),
    ]);
    const err = await api.getStore('s1').catch((e: unknown) => e);
    expect(isApiError(err, 'STORE_CLOSED')).toBe(true);
    expect(errorMessage(err)).toBe('La boutique est fermée');
    expect((err as ApiError).status).toBe(409);
  });

  it('signale la session expirée (401) et le compte suspendu', async () => {
    const { api, onAuthError } = setup([
      jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'Session expirée' } }),
      jsonResponse(403, { error: { code: 'ACCOUNT_SUSPENDED', message: 'Compte suspendu' } }),
      jsonResponse(403, { error: { code: 'FORBIDDEN', message: 'Interdit' } }),
    ]);
    await expect(api.me()).rejects.toBeInstanceOf(ApiError);
    await expect(api.me()).rejects.toBeInstanceOf(ApiError);
    await expect(api.me()).rejects.toBeInstanceOf(ApiError);
    expect(onAuthError).toHaveBeenCalledTimes(2);
  });

  it('gère 204 sans contenu', async () => {
    const { api } = setup([{ ok: true, status: 204, text: async () => '' } as Response]);
    await expect(api.sendLocation({ lat: 12.37, lng: -1.52 })).resolves.toBeUndefined();
  });

  it('renvoie une erreur réseau en français', async () => {
    const api = createApiClient({
      baseUrl: 'http://api.test',
      getToken: () => null,
      fetchFn: (async () => {
        throw new TypeError('Network request failed');
      }) as unknown as typeof fetch,
    });
    const err = await api.me().catch((e: unknown) => e);
    expect(isApiError(err, NETWORK_ERROR_CODE)).toBe(true);
    expect(errorMessage(err)).toMatch(/Connexion impossible/);
  });

  it('gère une réponse d’erreur non JSON', async () => {
    const { api } = setup([{ ok: false, status: 502, text: async () => '<html>' } as Response]);
    const err = await api.me().catch((e: unknown) => e);
    expect((err as ApiError).code).toBe('HTTP_ERROR');
  });

  it('construit les listes de commandes avec filtre de statut', async () => {
    const { api, calls } = setup([jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 20 })]);
    await api.listOrders({ status: ['ASSIGNED', 'PICKED_UP'], pageSize: 20 });
    expect(calls[0]?.url).toBe('http://api.test/orders?status=ASSIGNED%2CPICKED_UP&pageSize=20');
  });
});

describe('consentement GPS et messages d’erreur', () => {
  it('POST puis DELETE /driver/consent', async () => {
    const { api, calls } = setup([jsonResponse(200, { userId: 'd' }), jsonResponse(200, { userId: 'd' })]);
    await api.giveTrackingConsent();
    await api.withdrawTrackingConsent();
    expect(calls[0]?.url).toBe('http://api.test/driver/consent');
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[1]?.url).toBe('http://api.test/driver/consent');
    expect(calls[1]?.init.method).toBe('DELETE');
  });

  it('codes récents traduits, autres messages de l’API conservés', () => {
    expect(errorMessage(new ApiError(403, 'CONSENT_REQUIRED', 'x'))).toMatch(/Acceptez le suivi de votre position/);
    expect(errorMessage(new ApiError(415, 'UNSUPPORTED_FILE', 'x'))).toMatch(/Fichier non reconnu/);
    expect(errorMessage(new ApiError(409, 'DRIVER_BUSY', 'x'))).toMatch(/course en cours/);
    expect(errorMessage(new ApiError(403, 'DRIVER_OFFLINE', 'x'))).toMatch(/hors ligne/);
    expect(errorMessage(new ApiError(400, 'DELIVERY_CODE_INVALID', 'Code incorrect (3 essai(s) restant(s))'))).toBe(
      'Code incorrect (3 essai(s) restant(s))',
    );
  });
});
