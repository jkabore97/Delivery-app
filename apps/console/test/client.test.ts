import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError, buildQuery } from '../src/api/client';
import { fakeFetch } from './helpers';

describe('buildQuery', () => {
  it('ignore les valeurs vides et joint les tableaux', () => {
    expect(buildQuery({ status: ['ASSIGNED', 'PICKED_UP'], q: '', page: 2, online: false, x: undefined })).toBe(
      '?status=ASSIGNED%2CPICKED_UP&page=2&online=false',
    );
    expect(buildQuery({ status: [] })).toBe('');
  });
});

describe('ApiClient', () => {
  it('envoie le jeton et le corps JSON', async () => {
    const { impl, calls } = fakeFetch({ 'POST /controller/orders/o1/assign': { id: 'o1' } });
    const api = new ApiClient({ baseUrl: 'http://api.test/', getToken: () => 'abc', fetchImpl: impl });
    await api.assignOrder('o1', 'd1');
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/controller/orders/o1/assign', body: { driverId: 'd1' } });
    expect(calls[0]?.headers.Authorization).toBe('Bearer abc');
  });

  it('construit les filtres de liste', async () => {
    const { impl, calls } = fakeFetch({ 'GET /orders': { items: [], total: 0, page: 1, pageSize: 20 } });
    const api = new ApiClient({ baseUrl: 'http://api.test', getToken: () => null, fetchImpl: impl });
    await api.listOrders({ status: ['SEARCHING_DRIVER'], q: '#1048', page: 1 });
    expect(calls[0]?.path).toBe('/orders?status=SEARCHING_DRIVER&q=%231048&page=1');
    expect(calls[0]?.headers.Authorization).toBeUndefined();
  });

  it("transforme les erreurs de l'API en ApiError", async () => {
    const { impl } = fakeFetch({
      'POST /controller/drivers/d1/approve': () => ({
        status: 409,
        body: { error: { code: 'KYC_INCOMPLETE', message: 'Dossier incomplet : Selfie manquant' } },
      }),
    });
    const onUnauthorized = vi.fn();
    const api = new ApiClient({ baseUrl: 'http://api.test', getToken: () => 't', fetchImpl: impl, onUnauthorized });
    const err = await api.approveDriver('d1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: 'KYC_INCOMPLETE', message: 'Dossier incomplet : Selfie manquant' });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('signale une session expirée (401)', async () => {
    const { impl } = fakeFetch({
      'GET /controller/dashboard': () => ({ status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'Session expirée' } } }),
    });
    const onUnauthorized = vi.fn();
    const api = new ApiClient({ baseUrl: 'http://api.test', getToken: () => 't', fetchImpl: impl, onUnauthorized });
    await expect(api.dashboard()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('gère les réponses 204 et les erreurs réseau', async () => {
    const { impl } = fakeFetch({ 'DELETE /x': () => ({ status: 204 }) });
    const api = new ApiClient({ baseUrl: 'http://api.test', getToken: () => 't', fetchImpl: impl });
    await expect(api.request('DELETE', '/x')).resolves.toBeUndefined();
    const down = new ApiClient({
      baseUrl: 'http://api.test',
      getToken: () => 't',
      fetchImpl: () => Promise.reject(new TypeError('Failed to fetch')),
    });
    await expect(down.dashboard()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
