import { describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { App } from '../src/App';
import { createMemoryBus } from '../src/realtime/RealtimeContext';
import { LoginPage } from '../src/pages/LoginPage';
import { DriverDetailPage } from '../src/pages/DriverDetailPage';
import { controllerUser, renderWithProviders } from './helpers';
import { dashboard, driverProfile, mapData, pendingOrder, sos } from './fixtures';

// Leaflet a besoin d'un vrai moteur de rendu : la carte est remplacée par un résumé testable.
vi.mock('../src/components/LiveMap', () => ({
  LiveMap: ({ data, filter }: { data: { drivers: unknown[]; openSos: Array<{ id: string }> }; filter: string }) => (
    <div data-testid="map">
      {data.drivers.length} livreurs · filtre {filter} · {data.openSos.length} SOS
    </div>
  ),
}));

describe('LoginPage', () => {
  function routes(role: string) {
    return {
      'POST /auth/otp/request': { sent: true, expiresInSeconds: 300 },
      'POST /auth/otp/verify': {
        accessToken: 'jwt',
        tokenType: 'Bearer',
        expiresIn: 604800,
        isNewUser: false,
        user: { ...controllerUser, role },
      },
    };
  }

  it('valide le numéro avant envoi', async () => {
    const user = userEvent.setup();
    const { calls } = renderWithProviders(<LoginPage />, { loggedIn: false, routes: routes('CONTROLLER') });
    await user.type(screen.getByLabelText('Numéro de téléphone'), '1234');
    await user.click(screen.getByRole('button', { name: 'Recevoir le code' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Numéro de téléphone invalide');
    expect(calls).toHaveLength(0);
  });

  it('refuse un compte qui n’est pas du back office', async () => {
    const user = userEvent.setup();
    const { calls } = renderWithProviders(<LoginPage />, { loggedIn: false, routes: routes('CLIENT') });
    await user.type(screen.getByLabelText('Numéro de téléphone'), '72 00 00 01');
    await user.click(screen.getByRole('button', { name: 'Recevoir le code' }));
    expect(calls[0]).toMatchObject({ path: '/auth/otp/request', body: { phone: '+22672000001' } });
    await user.type(await screen.findByLabelText('Code reçu par SMS'), '123456');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Accès réservé aux contrôleurs');
  });

  it('connecte un contrôleur et ouvre la console', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/connexion" element={<LoginPage />} />
        <Route path="/" element={<div>Console ouverte</div>} />
      </Routes>,
      { loggedIn: false, routes: routes('CONTROLLER'), path: '/connexion' },
    );
    await user.type(screen.getByLabelText('Numéro de téléphone'), '70000002');
    await user.click(screen.getByRole('button', { name: 'Recevoir le code' }));
    await user.type(await screen.findByLabelText('Code reçu par SMS'), '123456');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByText('Console ouverte')).toBeInTheDocument();
  });
});

const liveRoutes = {
  'GET /controller/dashboard': dashboard,
  'GET /controller/map': mapData,
  'GET /controller/orders/pending': [pendingOrder],
  'GET /controller/drivers': { items: [driverProfile()], total: 7, page: 1, pageSize: 4 },
  'GET /controller/incidents': { items: [], total: 0, page: 1, pageSize: 20 },
};

describe('Carte en direct (App)', () => {
  it('affiche KPI, carte, commandes, dossiers et réagit aux événements temps réel', async () => {
    const user = userEvent.setup();
    const bus = createMemoryBus();
    renderWithProviders(<App socketUrl="http://api.test" busOverride={bus} />, { routes: liveRoutes, bus });

    expect(await screen.findByRole('heading', { name: 'Carte en direct · Ouagadougou' })).toBeInTheDocument();
    expect(await screen.findByText('318')).toBeInTheDocument();
    expect(await screen.findByTestId('map')).toHaveTextContent('2 livreurs · filtre ALL · 0 SOS');
    expect(await screen.findByText('Zogona → Tampouy')).toBeInTheDocument();
    expect(await screen.findByText('Ousmane B.')).toBeInTheDocument();
    expect(screen.getByText('Voir les 7 dossiers →')).toBeInTheDocument();

    // Pastilles du menu (KYC = 7, litiges = 2)
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(within(nav).getByLabelText('7 à traiter')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '🚲 Vélo' }));
    expect(screen.getByTestId('map')).toHaveTextContent('filtre BIKE');

    // Un livreur se déconnecte, puis un SOS arrive
    act(() => bus.emit('driver.status', { driverId: 'drv-karim', isOnline: false, isBusy: false }));
    expect(screen.getByTestId('map')).toHaveTextContent('1 livreurs');
    act(() => bus.emit('sos', { incident: sos }));
    expect(screen.getByTestId('map')).toHaveTextContent('1 SOS');
    const toast = screen.getByText('🆘 SOS · Karim D.').closest('.toast') as HTMLElement;
    expect(within(toast).getByRole('link', { name: 'Appeler' })).toHaveAttribute('href', 'tel:+22673000002');
  });

  it('redirige vers la connexion sans session', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/connexion" element={<div>Écran de connexion</div>} />
        <Route path="/*" element={<App socketUrl="http://api.test" busOverride={createMemoryBus()} />} />
      </Routes>,
      { loggedIn: false },
    );
    expect(await screen.findByText('Écran de connexion')).toBeInTheDocument();
  });
});

describe('Revue KYC', () => {
  it('refuse un dossier avec motif obligatoire', async () => {
    const user = userEvent.setup();
    const { calls } = renderWithProviders(
      <Routes>
        <Route path="/kyc/:id" element={<DriverDetailPage />} />
      </Routes>,
      {
        path: '/kyc/drv-ousmane',
        routes: {
          'GET /controller/drivers/drv-ousmane': driverProfile(),
          'POST /controller/drivers/drv-ousmane/reject': driverProfile({ status: 'REJECTED', rejectionReason: 'Photo illisible' }),
        },
      },
    );
    expect(await screen.findByRole('button', { name: 'Valider le dossier' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Refuser' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Refuser le dossier' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Le motif est obligatoire.');
    await user.type(within(dialog).getByRole('textbox'), 'Photo illisible');
    await user.click(within(dialog).getByRole('button', { name: 'Refuser le dossier' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({ body: { reason: 'Photo illisible' } });
    expect(screen.getByText('Dossier refusé.')).toBeInTheDocument();
    expect(screen.getAllByText('Photo illisible').length).toBeGreaterThan(0);
  });

  it('désactive la validation si une pièce manque et ouvre la visionneuse', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => 'blob:doc');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const { calls } = renderWithProviders(
      <Routes>
        <Route path="/kyc/:id" element={<DriverDetailPage />} />
      </Routes>,
      {
        path: '/kyc/drv-ousmane',
        routes: {
          'GET /controller/drivers/drv-ousmane': driverProfile({
            documents: driverProfile().documents.filter((d) => d.type !== 'SELFIE'),
            missingDocuments: ['SELFIE'],
            kycComplete: false,
          }),
          'GET /controller/drivers/drv-ousmane/documents/d1': { fake: 'image' },
        },
      },
    );
    expect(await screen.findByRole('button', { name: 'Valider le dossier' })).toBeDisabled();
    expect(screen.getByText(/Dossier incomplet/)).toBeInTheDocument();
    const cnibRow = screen.getByText('CNIB', { selector: 'td' }).closest('tr') as HTMLElement;
    await user.click(within(cnibRow).getByRole('button', { name: 'Voir' }));
    expect(await screen.findByRole('img', { name: /CNIB/ })).toHaveAttribute('src', 'blob:doc');
    expect(calls.some((c) => c.path === '/controller/drivers/drv-ousmane/documents/d1')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:doc');
  });
});
