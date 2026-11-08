import { describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { App } from '../src/App';
import { searchTarget } from '../src/components/Layout';
import { enumParam, pageParam } from '../src/lib/params';
import { AuditPage } from '../src/pages/AuditPage';
import { CashPage } from '../src/pages/CashPage';
import { DriverDetailPage } from '../src/pages/DriverDetailPage';
import { IncidentsPage } from '../src/pages/IncidentsPage';
import { LoginPage } from '../src/pages/LoginPage';
import { OrderDetailPage } from '../src/pages/OrderDetailPage';
import { OrdersPage } from '../src/pages/OrdersPage';
import { PricingPage } from '../src/pages/PricingPage';
import { StaffPage, UsersTable } from '../src/pages/UsersPage';
import { createMemoryBus } from '../src/realtime/RealtimeContext';
import { adminUser, apiCalls, controllerUser, renderWithProviders, type FakeCall } from './helpers';
import {
  cashOverview,
  dashboard,
  driverProfile,
  mapData,
  order,
  page,
  pendingOrder,
  pricingRules,
  sos,
  user,
} from './fixtures';

vi.mock('../src/components/LiveMap', () => ({
  LiveMap: ({ data }: { data: { drivers: unknown[]; openSos: unknown[] } }) => (
    <div data-testid="map">
      {data.drivers.length} livreurs · {data.openSos.length} SOS
    </div>
  ),
}));

const posts = (calls: FakeCall[]) => calls.filter((c) => c.method !== 'GET');

function onRoute(path: string, element: React.ReactElement, pattern: string) {
  return {
    ui: (
      <Routes>
        <Route path={pattern} element={element} />
        <Route path="*" element={<div>Ailleurs</div>} />
      </Routes>
    ),
    path,
  };
}

/* ------------------------------ Carte en direct ------------------------------ */

const liveRoutes = {
  'GET /controller/dashboard': dashboard,
  'GET /controller/map': mapData,
  'GET /controller/orders/pending': [pendingOrder],
  'GET /controller/drivers': { items: [driverProfile()], total: 1, page: 1, pageSize: 4 },
  'GET /controller/incidents': page([sos, { ...sos, id: 'inc-old', status: 'IN_PROGRESS' as const }]),
};

describe('Carte en direct : resynchronisation et alertes', () => {
  it('recharge carte, commandes, dossiers et alertes après une reconnexion du temps réel', async () => {
    const bus = createMemoryBus();
    const { calls } = renderWithProviders(<App socketUrl="http://api.test" busOverride={bus} />, { routes: liveRoutes, bus });
    expect(await screen.findByTestId('map')).toBeInTheDocument();
    const count = (p: string) => calls.filter((c) => c.path.startsWith(p)).length;
    await waitFor(() => expect(count('/controller/incidents')).toBe(1));
    const before = {
      map: count('/controller/map'),
      pending: count('/controller/orders/pending'),
      drivers: count('/controller/drivers'),
      dash: count('/controller/dashboard'),
    };
    act(() => bus.reconnect());
    await waitFor(() => expect(count('/controller/map')).toBe(before.map + 1));
    expect(count('/controller/orders/pending')).toBe(before.pending + 1);
    expect(count('/controller/drivers')).toBe(before.drivers + 1);
    await waitFor(() => expect(count('/controller/incidents')).toBe(2));
    await waitFor(() => expect(count('/controller/dashboard')).toBe(before.dash + 1));
  });

  it('charge les incidents ouverts ET en cours en une seule requête, sans dépendre des incidents résolus', async () => {
    const { calls } = renderWithProviders(<App socketUrl="http://api.test" busOverride={createMemoryBus()} />, {
      routes: liveRoutes,
    });
    await waitFor(() => expect(calls.filter((c) => c.path.startsWith('/controller/incidents'))).toHaveLength(1));
    const path = calls.find((c) => c.path.startsWith('/controller/incidents'))!.path;
    expect(new URL(path, 'http://x').searchParams.get('status')).toBe('OPEN,IN_PROGRESS');
    // Le panneau « Alertes » montre les deux.
    await waitFor(() => expect(document.querySelectorAll('.alerts li')).toHaveLength(2));
  });

  it('ne valide jamais un dossier KYC en un clic depuis la carte : lien vers la fiche', async () => {
    const { calls } = renderWithProviders(<App socketUrl="http://api.test" busOverride={createMemoryBus()} />, {
      routes: liveRoutes,
    });
    const link = await screen.findByRole('link', { name: 'Vérifier' });
    expect(link).toHaveAttribute('href', '/kyc/drv-ousmane');
    expect(screen.queryByRole('button', { name: 'Valider' })).not.toBeInTheDocument();
    expect(posts(calls)).toHaveLength(0);
  });
});

/* ------------------------------ Session ------------------------------ */

describe('Session', () => {
  it('un 401 sur n’importe quel appel renvoie à la connexion avec « Votre session a expiré »', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/connexion" element={<LoginPage />} />
        <Route path="/*" element={<App socketUrl="http://api.test" busOverride={createMemoryBus()} />} />
      </Routes>,
      {
        routes: {
          ...liveRoutes,
          'GET /controller/dashboard': () => ({
            status: 401,
            body: { error: { code: 'UNAUTHENTICATED', message: 'Jeton expiré' } },
          }),
        },
      },
    );
    expect(await screen.findByText(/Votre session a expiré/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recevoir le code' })).toBeInTheDocument();
  });

  it('revalide le profil au démarrage et déconnecte un compte qui n’est plus du back office', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/connexion" element={<LoginPage />} />
        <Route path="/*" element={<App socketUrl="http://api.test" busOverride={createMemoryBus()} />} />
      </Routes>,
      { routes: { ...liveRoutes, 'GET /me': user({ id: controllerUser.id, role: 'CLIENT' }) } },
    );
    expect(await screen.findByText(/Accès réservé aux contrôleurs/)).toBeInTheDocument();
  });

  it('un administrateur voit le menu Équipe ; un contrôleur non', async () => {
    renderWithProviders(<App socketUrl="http://api.test" busOverride={createMemoryBus()} />, {
      routes: liveRoutes,
      user: adminUser(),
    });
    const nav = await screen.findByRole('navigation', { name: 'Navigation principale' });
    expect(within(nav).getByRole('link', { name: /Équipe/ })).toBeInTheDocument();
  });
});

/* ------------------------------ Courses ------------------------------ */

describe('Fiche course', () => {
  it('annule une course avec motif', async () => {
    const u = userEvent.setup();
    const r = onRoute('/courses/ord-1', <OrderDetailPage />, '/courses/:id');
    const { calls } = renderWithProviders(r.ui, {
      path: r.path,
      routes: {
        'GET /orders/ord-1': order(),
        'POST /orders/ord-1/cancel': order({ status: 'CANCELLED', cancelReason: 'Client injoignable' }),
      },
    });
    await u.click(await screen.findByRole('button', { name: 'Annuler la course' }));
    const dialog = screen.getByRole('dialog');
    await u.type(within(dialog).getByRole('textbox'), 'Client injoignable');
    await u.click(within(dialog).getByRole('button', { name: 'Annuler la course' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(posts(calls)).toEqual([
      expect.objectContaining({ method: 'POST', path: '/orders/ord-1/cancel', body: { reason: 'Client injoignable' } }),
    ]);
  });

  it('réaffecte une course déjà affectée', async () => {
    const u = userEvent.setup();
    const r = onRoute('/courses/ord-1', <OrderDetailPage />, '/courses/:id');
    const assigned = order({
      status: 'ASSIGNED',
      driver: { id: 'drv-karim', name: 'Karim D.', phone: '+22673000002', vehicleType: 'MOTO', plate: '11 AB 1234', ratingAvg: 4.6, lastLocation: null },
    });
    const { calls } = renderWithProviders(r.ui, {
      path: r.path,
      routes: {
        'GET /orders/ord-1': assigned,
        'GET /controller/orders/ord-1/candidates': [
          { id: 'drv-ali', name: 'Ali S.', phone: '+22673000009', vehicleType: 'MOTO', isOnline: true, isBusy: false, cashBlocked: false, distanceKm: 1.2 },
        ],
        'POST /controller/orders/ord-1/assign': assigned,
      },
    });
    await u.click(await screen.findByRole('button', { name: 'Réaffecter' }));
    const dialog = screen.getByRole('dialog');
    await u.click(await within(dialog).findByRole('button', { name: 'Affecter' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(posts(calls)).toEqual([
      expect.objectContaining({ path: '/controller/orders/ord-1/assign', body: { driverId: 'drv-ali' } }),
    ]);
  });

  it('ignore un filtre de type invalide dans l’URL', async () => {
    const { calls } = renderWithProviders(<OrdersPage />, {
      path: '/courses?type=FOO&page=-3',
      routes: { 'GET /orders': page([order()]) },
    });
    expect(await screen.findByText('#1052')).toBeInTheDocument();
    const list = apiCalls(calls).find((c) => c.path.startsWith('/orders'));
    expect(list?.path).not.toContain('type=');
    expect(list?.path).toContain('page=1');
  });
});

/* ------------------------------ Livreurs / KYC ------------------------------ */

describe('Décisions sur un livreur', () => {
  const detail = (profile = driverProfile(), extra: Record<string, unknown> = {}) => {
    const r = onRoute('/kyc/drv-ousmane', <DriverDetailPage />, '/kyc/:id');
    return renderWithProviders(r.ui, {
      path: r.path,
      routes: { 'GET /controller/drivers/drv-ousmane': profile, ...extra },
    });
  };

  it('demande une confirmation avant de valider et signale les pièces non consultées', async () => {
    const u = userEvent.setup();
    const { calls } = detail(driverProfile(), {
      'POST /controller/drivers/drv-ousmane/approve': driverProfile({ status: 'APPROVED' }),
    });
    await u.click(await screen.findByRole('button', { name: 'Valider le dossier' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Vous n’avez pas ouvert toutes les pièces');
    expect(posts(calls)).toHaveLength(0);
    await u.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(posts(calls)).toHaveLength(0);
    await u.click(screen.getByRole('button', { name: 'Valider le dossier' }));
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Je confirme, valider' }));
    expect(await screen.findByText(/Dossier validé/)).toBeInTheDocument();
    expect(posts(calls)).toEqual([expect.objectContaining({ path: '/controller/drivers/drv-ousmane/approve', body: {} })]);
  });

  it('suspend un livreur approuvé avec motif', async () => {
    const u = userEvent.setup();
    const { calls } = detail(driverProfile({ status: 'APPROVED' }), {
      'POST /controller/drivers/drv-ousmane/suspend': driverProfile({ status: 'SUSPENDED', suspensionReason: 'Plainte client' }),
    });
    await u.click(await screen.findByRole('button', { name: 'Suspendre' }));
    const dialog = screen.getByRole('dialog');
    await u.type(within(dialog).getByRole('textbox'), 'Plainte client');
    await u.click(within(dialog).getByRole('button', { name: 'Suspendre' }));
    expect(await screen.findByText('Livreur suspendu et mis hors ligne.')).toBeInTheDocument();
    expect(posts(calls)).toEqual([
      expect.objectContaining({ path: '/controller/drivers/drv-ousmane/suspend', body: { reason: 'Plainte client' } }),
    ]);
  });

  it('réintègre un livreur suspendu', async () => {
    const u = userEvent.setup();
    const { calls } = detail(driverProfile({ status: 'SUSPENDED' }), {
      'POST /controller/drivers/drv-ousmane/reinstate': driverProfile({ status: 'APPROVED' }),
    });
    await u.click(await screen.findByRole('button', { name: 'Réintégrer' }));
    expect(await screen.findByText('Livreur réintégré.')).toBeInTheDocument();
    expect(posts(calls)).toEqual([expect.objectContaining({ path: '/controller/drivers/drv-ousmane/reinstate' })]);
  });

  it('propose les liens vers le journal d’audit des consultations', async () => {
    detail();
    expect(await screen.findByRole('link', { name: 'journal d’audit' })).toHaveAttribute(
      'href',
      '/audit?action=DRIVER_DOCUMENT_VIEWED&entityType=DriverDocument',
    );
    expect(screen.queryByText(/chiffrées/)).not.toBeInTheDocument();
  });
});

/* ------------------------------ Caisse ------------------------------ */

describe('Caisse livreurs', () => {
  it('enregistre un versement (montant + note)', async () => {
    const u = userEvent.setup();
    const { calls } = renderWithProviders(<CashPage />, {
      path: '/caisse',
      routes: {
        'GET /controller/cash': cashOverview,
        'GET /controller/cash/ledger': page([]),
        'POST /controller/drivers/drv-karim/cash-deposits': {},
      },
    });
    const row = (await screen.findByRole('link', { name: 'Karim D.' })).closest('tr') as HTMLElement;
    await u.click(within(row).getByRole('button', { name: 'Versement' }));
    const dialog = screen.getByRole('dialog');
    const amount = within(dialog).getByLabelText('Montant versé (FCFA)');
    await u.clear(amount);
    await u.type(amount, '60000');
    await u.click(within(dialog).getByRole('button', { name: 'Enregistrer le versement' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('dépasse le cash détenu');
    await u.clear(amount);
    await u.type(amount, '50 000');
    await u.type(within(dialog).getByLabelText('Note'), 'Agence Zogona');
    await u.click(within(dialog).getByRole('button', { name: 'Enregistrer le versement' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(posts(calls)).toEqual([
      expect.objectContaining({
        path: '/controller/drivers/drv-karim/cash-deposits',
        body: { amount: 50000, note: 'Agence Zogona' },
      }),
    ]);
  });

  it('recharge soldes et grand livre quand une course est livrée', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const bus = createMemoryBus();
      const { calls } = renderWithProviders(<CashPage />, {
        path: '/caisse',
        bus,
        routes: { 'GET /controller/cash': cashOverview, 'GET /controller/cash/ledger': page([]) },
      });
      await screen.findByRole('link', { name: 'Karim D.' });
      const before = calls.filter((c) => c.path === '/controller/cash').length;
      act(() =>
        bus.emit('order.updated', { orderId: 'o', number: 1, status: 'DELIVERED', driverId: 'drv-karim', updatedAt: '2026-11-06T20:00:00.000Z' }),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1600);
      });
      await waitFor(() => expect(calls.filter((c) => c.path === '/controller/cash').length).toBe(before + 1));
    } finally {
      vi.useRealTimers();
    }
  });
});

/* ------------------------------ Tarifs ------------------------------ */

describe('Tarifs', () => {
  it('enregistre la grille moto avec PUT', async () => {
    const u = userEvent.setup();
    const { calls } = renderWithProviders(<PricingPage />, {
      routes: {
        'GET /controller/pricing-rules': pricingRules,
        'PUT /controller/pricing-rules/MOTO': { ...pricingRules[1], perKm: 250 },
      },
    });
    const form = await screen.findByRole('form', { name: 'Tarif Moto' });
    const perKm = within(form).getByLabelText('Prix par km');
    await u.clear(perKm);
    await u.type(perKm, '250');
    await u.click(within(form).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(form).findByText(/Tarif enregistré/)).toBeInTheDocument();
    expect(posts(calls)).toEqual([
      expect.objectContaining({
        method: 'PUT',
        path: '/controller/pricing-rules/MOTO',
        body: { baseFare: 700, perKm: 250, minimumFare: 1500, commissionPercent: 15, isActive: true },
      }),
    ]);
  });
});

/* ------------------------------ Incidents ------------------------------ */

describe('Litiges & SOS', () => {
  it('affiche par défaut les incidents ouverts, prend en charge puis résout', async () => {
    const u = userEvent.setup();
    const { calls } = renderWithProviders(<IncidentsPage />, {
      routes: {
        'GET /controller/incidents': page([sos]),
        'PATCH /controller/incidents/inc-1': (c: FakeCall) => ({
          body: { ...sos, ...(c.body as object) },
        }),
      },
    });
    await u.click(await screen.findByRole('button', { name: 'Prendre en charge' }));
    await u.click(screen.getByRole('button', { name: 'Marquer résolu' }));
    const dialog = screen.getByRole('dialog');
    await u.type(within(dialog).getByRole('textbox'), 'Livreur dépanné');
    await u.click(within(dialog).getByRole('button', { name: 'Marquer résolu' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(apiCalls(calls)[0]?.path).toContain('status=OPEN');
    expect(posts(calls)).toEqual([
      expect.objectContaining({ method: 'PATCH', path: '/controller/incidents/inc-1', body: { status: 'IN_PROGRESS' } }),
      expect.objectContaining({
        method: 'PATCH',
        path: '/controller/incidents/inc-1',
        body: { status: 'RESOLVED', resolutionNote: 'Livreur dépanné' },
      }),
    ]);
  });
});

/* ------------------------------ Comptes ------------------------------ */

describe('Comptes', () => {
  it('suspend puis réactive un client', async () => {
    const u = userEvent.setup();
    const { calls } = renderWithProviders(<UsersTable role="CLIENT" title="Clients" />, {
      routes: {
        'GET /controller/users': page([user()]),
        'POST /controller/users/cli-1/suspend': user({ isSuspended: true, suspensionReason: 'Fraude' }),
        'POST /controller/users/cli-1/unsuspend': user(),
      },
    });
    await u.click(await screen.findByRole('button', { name: 'Suspendre' }));
    const dialog = screen.getByRole('dialog');
    await u.type(within(dialog).getByRole('textbox'), 'Fraude');
    await u.click(within(dialog).getByRole('button', { name: 'Suspendre le compte' }));
    await u.click(await screen.findByRole('button', { name: 'Réactiver' }));
    expect(await screen.findByRole('button', { name: 'Suspendre' })).toBeInTheDocument();
    expect(posts(calls)).toEqual([
      expect.objectContaining({ path: '/controller/users/cli-1/suspend', body: { reason: 'Fraude' } }),
      expect.objectContaining({ path: '/controller/users/cli-1/unsuspend' }),
    ]);
  });

  it('un contrôleur ne peut pas suspendre un compte du back office', async () => {
    renderWithProviders(<UsersTable role="CONTROLLER" title="Contrôleurs" />, {
      routes: { 'GET /controller/users': page([user({ id: 'u-other', role: 'CONTROLLER', name: 'Paul O.' })]) },
    });
    expect(await screen.findByText('Paul O.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspendre' })).not.toBeInTheDocument();
  });

  it('la page Équipe est réservée aux administrateurs', () => {
    renderWithProviders(<StaffPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Réservé aux administrateurs.');
  });

  it('un administrateur crée un compte contrôleur', async () => {
    const u = userEvent.setup();
    const { calls } = renderWithProviders(<StaffPage />, {
      user: adminUser(),
      routes: {
        'GET /controller/users': page([]),
        'POST /controller/staff': user({ id: 'u-new', role: 'CONTROLLER', name: 'Issa K.', phone: '+22670998877' }),
      },
    });
    await u.type(screen.getByLabelText('Nom'), 'Issa K.');
    await u.type(screen.getByLabelText('Téléphone'), '70 99 88 77');
    await u.click(screen.getByRole('button', { name: 'Créer le compte' }));
    expect(await screen.findByText(/Compte contrôleur créé pour Issa K\./i)).toBeInTheDocument();
    expect(posts(calls)).toEqual([
      expect.objectContaining({
        path: '/controller/staff',
        body: { phone: '+22670998877', name: 'Issa K.', role: 'CONTROLLER' },
      }),
    ]);
  });
});

/* ------------------------------ Audit ------------------------------ */

describe('Journal d’audit', () => {
  it('reprend les filtres de l’URL et affiche les objets en français', async () => {
    const { calls } = renderWithProviders(<AuditPage />, {
      path: '/audit?action=DRIVER_DOCUMENT_VIEWED&entityType=DriverDocument',
      routes: {
        'GET /controller/audit-logs': page([
          {
            id: 'a1',
            actor: { id: 'u-ctrl', name: 'Salif K.', role: 'CONTROLLER' },
            action: 'DRIVER_DOCUMENT_VIEWED',
            entityType: 'DriverDocument',
            entityId: 'd1',
            metadata: { driverId: 'drv-ousmane' },
            ip: '127.0.0.1',
            createdAt: '2026-11-06T19:00:00.000Z',
          },
        ]),
      },
    });
    expect(await screen.findByText('d1')).toBeInTheDocument();
    expect(screen.getAllByText('Pièce livreur').length).toBeGreaterThan(0);
    const q = apiCalls(calls)[0]?.path ?? '';
    expect(q).toContain('action=DRIVER_DOCUMENT_VIEWED');
    expect(q).toContain('entityType=DriverDocument');
  });
});

/* ------------------------------ Utilitaires ------------------------------ */

describe('Paramètres et recherche', () => {
  it('enumParam / pageParam écartent les valeurs invalides', () => {
    expect(enumParam('MOTO', ['BIKE', 'MOTO'] as const)).toBe('MOTO');
    expect(enumParam('FOO', ['BIKE', 'MOTO'] as const)).toBe('');
    expect(enumParam(null, ['BIKE'] as const)).toBe('');
    expect(pageParam('3')).toBe(3);
    expect(pageParam('-1')).toBe(1);
    expect(pageParam('abc')).toBe(1);
  });

  it('la recherche globale envoie une plaque vers les livreurs, le reste vers les courses', () => {
    expect(searchTarget('')).toBe('/courses');
    expect(searchTarget('#1048')).toBe('/courses?q=%231048');
    expect(searchTarget('11 KM 2280')).toBe('/livreurs?q=11%20KM%202280');
    expect(searchTarget('70 11 11 11')).toBe('/courses?q=70%2011%2011%2011');
  });
});
