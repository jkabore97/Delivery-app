import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { StoreDto } from '@yaar/shared';
import { ApiClient, ApiError, errorMessage } from '../src/api/client';
import { exportFilename, nextDay } from '../src/components/CsvExport';
import { OrderDetailPage } from '../src/pages/OrderDetailPage';
import { StoresTable } from '../src/pages/UsersPage';
import { fakeFetch, renderWithProviders, type FakeCall } from './helpers';
import { order, page } from './fixtures';

const writes = (calls: FakeCall[]) => calls.filter((c) => c.method !== 'GET');

function store(over: Partial<StoreDto> = {}): StoreDto {
  return {
    id: 'st-1',
    ownerId: 'u-seller',
    name: 'Grillades de Pissy',
    description: 'Poulet braisé',
    phone: '+22671000009',
    address: 'Pissy, route de Bobo',
    landmark: 'Face au marché',
    lat: 12.35,
    lng: -1.57,
    isOpen: false,
    prepTimeMinutes: 20,
    openingHours: 'Lun-Sam 11h-22h',
    commissionPercent: null,
    distanceKm: null,
    approvalStatus: 'PENDING',
    approvalNote: null,
    createdAt: '2026-11-05T10:00:00.000Z',
    ...over,
  };
}

describe('ApiClient : routes ajoutées par la correction de l’API', () => {
  it('validation / suspension de boutique, livraison forcée, code, exports', async () => {
    const { impl, calls } = fakeFetch({
      'GET /controller/stores': page([]),
      'POST /controller/stores/s1/approve': store(),
      'POST /controller/stores/s1/suspend': store(),
      'POST /controller/orders/o1/force-deliver': order(),
      'POST /controller/orders/o1/reset-delivery-code': order(),
      'GET /controller/exports/orders.csv': 'x',
      'GET /controller/exports/cash-ledger.csv': 'x',
    });
    const api = new ApiClient({ baseUrl: 'http://api.test', getToken: () => 't', fetchImpl: impl });
    await api.listStores({ approvalStatus: 'PENDING', page: 2 });
    await api.approveStore('s1');
    await api.suspendStore('s1', 'Hygiène');
    await api.forceDeliver('o1', 'Client joint');
    await api.resetDeliveryCode('o1');
    await api.resetDeliveryCode('o1', 'Erreur client');
    await api.exportCsv('orders', { from: '2026-11-01', to: '2026-11-08' });
    await api.exportCsv('cash-ledger');
    expect(calls.map((c) => [c.method, c.path, c.body])).toEqual([
      ['GET', '/controller/stores?approvalStatus=PENDING&page=2', undefined],
      ['POST', '/controller/stores/s1/approve', {}],
      ['POST', '/controller/stores/s1/suspend', { reason: 'Hygiène' }],
      ['POST', '/controller/orders/o1/force-deliver', { reason: 'Client joint' }],
      ['POST', '/controller/orders/o1/reset-delivery-code', {}],
      ['POST', '/controller/orders/o1/reset-delivery-code', { reason: 'Erreur client' }],
      ['GET', '/controller/exports/orders.csv?from=2026-11-01&to=2026-11-08', undefined],
      ['GET', '/controller/exports/cash-ledger.csv', undefined],
    ]);
  });

  it('traduit les nouveaux codes d’erreur, garde les autres messages de l’API', () => {
    expect(errorMessage(new ApiError(409, 'DRIVER_OFFLINE', 'x'))).toMatch(/hors ligne/);
    expect(errorMessage(new ApiError(409, 'DRIVER_BUSY', 'x'))).toMatch(/en course/);
    expect(errorMessage(new ApiError(403, 'CONSENT_REQUIRED', 'x'))).toMatch(/suivi GPS/);
    expect(errorMessage(new ApiError(415, 'UNSUPPORTED_FILE', 'x'))).toMatch(/Fichier refusé/);
    expect(errorMessage(new ApiError(423, 'DELIVERY_CODE_LOCKED', 'x'))).toMatch(/réinitialisez le code/);
    expect(errorMessage(new ApiError(409, 'KYC_INCOMPLETE', 'Pièce manquante : SELFIE'))).toBe('Pièce manquante : SELFIE');
    expect(errorMessage(new ApiError(0, 'NETWORK_ERROR', 'Impossible de joindre le serveur.'))).toBe(
      'Impossible de joindre le serveur.',
    );
  });

  it('exports : borne de fin incluse pour l’utilisateur, exclue pour l’API', () => {
    expect(nextDay('2026-11-30')).toBe('2026-12-01');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
    expect(exportFilename('orders', '2026-11-01', '2026-11-07')).toBe('yaar-livraisons_2026-11-01_2026-11-07.csv');
    expect(exportFilename('cash-ledger')).toBe('yaar-caisse.csv');
  });
});

describe('Validation des entreprises', () => {
  it('affiche la file « À valider » et valide une entreprise', async () => {
    const u = userEvent.setup();
    const { calls } = renderWithProviders(<StoresTable />, {
      routes: {
        'GET /controller/stores': (c: FakeCall) => ({
          body: page(c.path.includes('approvalStatus=PENDING') ? [store()] : [store({ approvalStatus: 'APPROVED' })]),
        }),
        'POST /controller/stores/st-1/approve': store({ approvalStatus: 'APPROVED' }),
      },
    });
    expect(await screen.findByText('Grillades de Pissy')).toBeInTheDocument();
    expect(calls.find((c) => c.path.startsWith('/controller/stores'))?.path).toContain('approvalStatus=PENDING');
    // Ouverture et commission de boutique (ancien parcours de commande) : plus affichées.
    expect(screen.queryByLabelText('Commission Grillades de Pissy')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Fermée|Ouverte/ })).not.toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Valider' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Entreprise « Grillades de Pissy » validée : elle peut demander des livraisons.',
    );
    expect(writes(calls)).toEqual([expect.objectContaining({ method: 'POST', path: '/controller/stores/st-1/approve' })]);
  });

  it('refuse / suspend avec motif obligatoire et affiche le motif', async () => {
    const u = userEvent.setup();
    const { calls } = renderWithProviders(<StoresTable />, {
      routes: {
        'GET /controller/stores': page([store()]),
        'POST /controller/stores/st-1/suspend': store({ approvalStatus: 'SUSPENDED', approvalNote: 'Adresse introuvable' }),
      },
    });
    await u.click(await screen.findByRole('button', { name: 'Refuser' }));
    const dialog = screen.getByRole('dialog');
    await u.click(within(dialog).getByRole('button', { name: 'Refuser' }));
    expect(within(dialog).getByText('Le motif est obligatoire.')).toBeInTheDocument();
    await u.type(within(dialog).getByRole('textbox'), 'Adresse introuvable');
    await u.click(within(dialog).getByRole('button', { name: 'Refuser' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(writes(calls)).toEqual([
      expect.objectContaining({ path: '/controller/stores/st-1/suspend', body: { reason: 'Adresse introuvable' } }),
    ]);
  });

  it('filtre « Suspendues »', async () => {
    const u = userEvent.setup();
    const { calls } = renderWithProviders(<StoresTable />, { routes: { 'GET /controller/stores': page([]) } });
    expect(await screen.findByText('Aucune entreprise en attente de validation.')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Suspendues' }));
    await waitFor(() =>
      expect(calls.some((c) => c.path.startsWith('/controller/stores?approvalStatus=SUSPENDED'))).toBe(true),
    );
  });
});

describe('Livraison récupérée (PICKED_UP) : reprise par la console', () => {
  const pickedUp = order({
    status: 'PICKED_UP',
    driver: { id: 'drv-1', name: 'Issouf S.', phone: '+22673000001', vehicleType: 'MOTO', plate: '11 JJ 4521', ratingAvg: 4.9, lastLocation: null },
  });
  const onRoute = (
    <Routes>
      <Route path="/courses/:id" element={<OrderDetailPage />} />
    </Routes>
  );
  afterEach(() => vi.restoreAllMocks());

  it('valide la livraison avec un motif obligatoire', async () => {
    const u = userEvent.setup();
    const { calls } = renderWithProviders(onRoute, {
      path: '/courses/ord-1',
      routes: {
        'GET /orders/ord-1': pickedUp,
        'POST /controller/orders/ord-1/force-deliver': order({ status: 'DELIVERED' }),
      },
    });
    await u.click(await screen.findByRole('button', { name: 'Valider la livraison' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/comptées comme encaissées par le livreur/)).toBeInTheDocument();
    await u.click(within(dialog).getByRole('button', { name: 'Valider la livraison' }));
    expect(within(dialog).getByText('Le motif est obligatoire.')).toBeInTheDocument();
    await u.type(within(dialog).getByRole('textbox'), 'Client joint par téléphone');
    await u.click(within(dialog).getByRole('button', { name: 'Valider la livraison' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(writes(calls)).toEqual([
      expect.objectContaining({ path: '/controller/orders/ord-1/force-deliver', body: { reason: 'Client joint par téléphone' } }),
    ]);
    expect(screen.getByRole('status')).toHaveTextContent('validée comme livrée');
  });

  it('réinitialise le code (motif facultatif)', async () => {
    const u = userEvent.setup();
    const { calls } = renderWithProviders(onRoute, {
      path: '/courses/ord-1',
      routes: { 'GET /orders/ord-1': pickedUp, 'POST /controller/orders/ord-1/reset-delivery-code': pickedUp },
    });
    await u.click(await screen.findByRole('button', { name: 'Réinitialiser le code' }));
    const dialog = screen.getByRole('dialog');
    await u.click(within(dialog).getByRole('button', { name: 'Réinitialiser' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(writes(calls)).toEqual([expect.objectContaining({ path: '/controller/orders/ord-1/reset-delivery-code', body: {} })]);
  });

  it('annulation après retrait : avertissement (incident ouvert) puis appel', async () => {
    const u = userEvent.setup();
    const { calls } = renderWithProviders(onRoute, {
      path: '/courses/ord-1',
      routes: { 'GET /orders/ord-1': pickedUp, 'POST /orders/ord-1/cancel': order({ status: 'CANCELLED' }) },
    });
    await u.click(await screen.findByRole('button', { name: 'Annuler la livraison' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/récupérer la marchandise auprès du livreur/)).toBeInTheDocument();
    await u.click(within(dialog).getByRole('button', { name: 'Annuler la livraison' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(writes(calls)).toEqual([expect.objectContaining({ path: '/orders/ord-1/cancel', body: {} })]);
  });

  it('pas d’actions de reprise avant le retrait', async () => {
    renderWithProviders(onRoute, { path: '/courses/ord-1', routes: { 'GET /orders/ord-1': order({ status: 'ASSIGNED' }) } });
    expect(await screen.findByRole('button', { name: 'Réaffecter' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Valider la livraison' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réinitialiser le code' })).not.toBeInTheDocument();
  });
});
