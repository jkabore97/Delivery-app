import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { PublicConfigDto } from '@yaar/shared';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth/AuthContext';
import { cashSplit, etaCell, isBusinessDelivery, legSummary, statusLabel } from '../src/lib/delivery';
import { CashPage, balanceTotals } from '../src/pages/CashPage';
import { LivePage } from '../src/pages/LivePage';
import { OrderDetailPage } from '../src/pages/OrderDetailPage';
import { OrdersPage } from '../src/pages/OrdersPage';
import { BusinessesPage } from '../src/pages/UsersPage';
import { AppConfigProvider } from '../src/realtime/AppConfigContext';
import { RealtimeProvider, createMemoryBus } from '../src/realtime/RealtimeContext';
import type { VisibilitySource } from '../src/realtime/pollScheduler';
import { controllerUser, fakeFetch, renderWithProviders, type FakeCall } from './helpers';
import {
  businessBalances,
  businessOrder,
  cashOverview,
  dashboard,
  driverProfile,
  legacyFoodOrder,
  mapData,
  page,
  pendingOrder,
  user,
} from './fixtures';

vi.mock('../src/components/LiveMap', () => ({
  LiveMap: () => <div data-testid="map" />,
}));

/** Les montants FCFA utilisent des espaces insécables fines. */
const norm = (s: string | null | undefined) => (s ?? '').replace(/[  ]/g, ' ');
/** Valeur d'une ligne « clé / valeur » d'une fiche. */
function kv(label: string): string {
  const dt = screen.getAllByText(label, { selector: 'dt' })[0]!;
  return norm(dt.nextElementSibling?.textContent);
}

const detail = () => (
  <Routes>
    <Route path="/courses/:id" element={<OrderDetailPage />} />
  </Routes>
);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Fiche d’une livraison d’entreprise', () => {
  it('entreprise expéditrice, retrait, destinataire (entreprise), colis, véhicule, montants et lien de suivi', async () => {
    renderWithProviders(detail(), { path: '/courses/ord-b2b', routes: { 'GET /orders/ord-b2b': businessOrder() } });
    expect(await screen.findByRole('heading', { name: /Livraison #1004/ })).toBeInTheDocument();
    expect(screen.queryByText(/ancien parcours/)).not.toBeInTheDocument();

    // Intervenants
    expect(kv('Entreprise')).toContain('Tech Plus Électronique');
    expect(kv('Entreprise')).toContain('Compte demandeur : Boukary Compaoré');
    expect(screen.getAllByRole('link', { name: '+226 71 00 00 04' })[0]).toHaveAttribute('href', 'tel:+22671000004');
    expect(kv('Destinataire')).toContain('Bureau Faso Conseil');
    expect(kv('Destinataire')).toContain('entreprise');
    expect(screen.getByRole('link', { name: '+226 25 37 00 00' })).toHaveAttribute('href', 'tel:+22625370000');
    expect(screen.getByRole('link', { name: 'Abdoul T.' })).toHaveAttribute('href', '/livreurs/drv-abdoul');

    // Trajet
    expect(kv('Retrait (entreprise)')).toContain('Tampouy, marché');
    expect(kv('Retrait (entreprise)')).toContain('Repère : Entrée principale du marché');
    expect(kv('Livraison')).toContain('Dassasgho, route de Fada');
    expect(kv('Colis')).toBe('Téléphone Tecno Camon (boîte scellée)');
    expect(kv('Véhicule')).toContain('Voiture');
    expect(screen.getByRole('region', { name: 'Carte de la livraison #1004' })).toBeInTheDocument();
    expect(screen.getByText('Livreur en route vers le retrait (Tech Plus Électronique)')).toBeInTheDocument();
    const leg = screen.getByRole('list', { name: 'Étape en cours' });
    expect(norm(leg.textContent)).toMatch(/Itinéraire routier : 2,6 km restants/);
    // L'heure d'arrivée est écrite en très grand : aucune précision ne la répète.
    expect(norm(leg.textContent)).not.toMatch(/Destinataire : Arrivée/);
    expect(screen.getByText('dans 49 min')).toBeInTheDocument();
    // Le n° et le statut sont dans le titre : la puce de la tuile héros dit « En direct » ; l'étape en cours est annoncée.
    const hero = screen.getByRole('region', { name: 'Livraison en cours' });
    expect(within(hero).getByText('En direct')).toHaveClass('hero-chip');
    expect(within(hero).getByRole('list', { name: 'Avancement' }).querySelector('[aria-current="step"]')).toHaveTextContent('Colis récupéré (en cours)');

    // Montants : frais payés par l'entreprise au retrait, marchandise encaissée pour elle à la livraison.
    expect(kv('Frais de livraison')).toBe('5 800 FCFA · payés par : Entreprise au retrait');
    expect(kv('Marchandise à encaisser')).toBe('85 000 FCFA auprès du destinataire');
    expect(kv('Encaissé au retrait')).toBe('5 800 FCFA (frais, auprès de l’entreprise)');
    expect(kv('À encaisser à la livraison')).toBe('85 000 FCFA');
    expect(kv('Dû à l’entreprise')).toBe('85 000 FCFA · une fois encaissé auprès du destinataire');
    expect(kv('Commission plateforme')).toBe('1 160 FCFA');
    // Pas d'interface « repas » : ni articles ni total client.
    expect(screen.queryByText('Article')).not.toBeInTheDocument();
    expect(screen.queryByText('Total client')).not.toBeInTheDocument();

    // Chronologie : pas de « vendeur » pour une livraison d'entreprise.
    const timeline = (screen.getByRole('heading', { name: 'Chronologie' }).closest('section') as HTMLElement).querySelector('ol')!;
    expect(within(timeline).getByText('Création · Demande reçue')).toBeInTheDocument();
    expect(within(timeline).getByText('Demande reçue → Recherche d’un livreur')).toBeInTheDocument();
    expect(within(timeline).getByText('Entreprise')).toBeInTheDocument();
    expect(screen.queryByText(/vendeur/i)).not.toBeInTheDocument();

    // Actions du contrôleur pendant ASSIGNED.
    expect(screen.getByRole('button', { name: 'Réaffecter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuler la livraison' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Valider la livraison' })).not.toBeInTheDocument();
  });

  it('lien de suivi : ouvrir dans un nouvel onglet (sans référent) ou copier', async () => {
    const u = userEvent.setup();
    renderWithProviders(detail(), { path: '/courses/ord-b2b', routes: { 'GET /orders/ord-b2b': businessOrder() } });
    const card = (await screen.findByRole('heading', { name: 'Suivi du destinataire' })).closest('section') as HTMLElement;
    const url = 'https://yaar-livraison.vercel.app/suivi/AbCdEfGhIjKlMnOpQrStUvWx';
    expect(within(card).getByText(url)).toBeInTheDocument();
    const open = within(card).getByRole('link', { name: 'Ouvrir' });
    expect(open).toHaveAttribute('href', url);
    expect(open).toHaveAttribute('target', '_blank');
    expect(open.getAttribute('rel')).toContain('noreferrer');
    await u.click(within(card).getByRole('button', { name: 'Copier le lien' }));
    expect(await within(card).findByText('Lien copié')).toBeInTheDocument();
    await expect(navigator.clipboard.readText()).resolves.toBe(url);
    expect(within(card).getByText(/code de livraison/)).toBeInTheDocument();
  });

  it('frais payés par le destinataire : tout est encaissé à la livraison', async () => {
    renderWithProviders(detail(), {
      path: '/courses/ord-b2b',
      routes: { 'GET /orders/ord-b2b': businessOrder({ feePaidBy: 'RECIPIENT', recipientIsBusiness: false }) },
    });
    await screen.findByRole('heading', { name: /Livraison #1004/ });
    expect(kv('Frais de livraison')).toBe('5 800 FCFA · payés par : Destinataire à la livraison');
    expect(kv('Encaissé au retrait')).toBe('Rien');
    expect(kv('À encaisser à la livraison')).toBe('90 800 FCFA');
    expect(kv('Destinataire')).not.toContain('entreprise');
  });

  it('colis récupéré : valider la livraison (espèces de la livraison seulement), annulation avec frais déjà encaissés', async () => {
    const u = userEvent.setup();
    const picked = businessOrder({ status: 'PICKED_UP', route: null });
    const { calls } = renderWithProviders(detail(), {
      path: '/courses/ord-b2b',
      routes: {
        'GET /orders/ord-b2b': picked,
        'POST /controller/orders/ord-b2b/force-deliver': businessOrder({ status: 'DELIVERED' }),
        'POST /controller/orders/ord-b2b/reset-delivery-code': picked,
      },
    });
    await u.click(await screen.findByRole('button', { name: 'Valider la livraison' }));
    let dialog = screen.getByRole('dialog');
    expect(norm(dialog.textContent)).toContain('Les espèces à encaisser à la livraison (85 000 FCFA) sont comptées comme encaissées par le livreur.');
    await u.type(within(dialog).getByRole('textbox'), 'Destinataire joint');
    await u.click(within(dialog).getByRole('button', { name: 'Valider la livraison' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Livraison #1004 validée comme livrée.')).toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'Annuler la livraison' }));
    dialog = screen.getByRole('dialog');
    expect(norm(dialog.textContent)).toContain('Les frais encaissés au retrait (5 800 FCFA) restent dans la caisse du livreur');
    // « Retour » ferme sans annuler (pas deux boutons « Annuler… » côte à côte).
    expect(within(dialog).queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument();
    await u.click(within(dialog).getByRole('button', { name: 'Retour' }));
    await u.click(screen.getByRole('button', { name: 'Réinitialiser le code' }));
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Réinitialiser' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.path)).toEqual([
      '/controller/orders/ord-b2b/force-deliver',
      '/controller/orders/ord-b2b/reset-delivery-code',
    ]);
  });

  it('livrée : montant dû à l’entreprise à reverser ; annulée : rien', async () => {
    const { unmount } = renderWithProviders(detail(), {
      path: '/courses/ord-b2b',
      routes: { 'GET /orders/ord-b2b': businessOrder({ status: 'DELIVERED', route: null, cashCollected: 90_800, paymentStatus: 'PAID' }) },
    });
    await screen.findByRole('heading', { name: /Livraison #1004/ });
    expect(kv('Dû à l’entreprise')).toMatch(/^85 000 FCFA · encaissé à la livraison, à reverser/);
    expect(kv('Espèces encaissées')).toBe('90 800 FCFA');
    expect(kv('Paiement')).toBe('Espèces · payé');
    unmount();
    renderWithProviders(detail(), {
      path: '/courses/ord-b2b',
      routes: { 'GET /orders/ord-b2b': businessOrder({ status: 'CANCELLED', route: null, cancelReason: 'Destinataire injoignable' }) },
    });
    await screen.findByRole('heading', { name: /Livraison #1004/ });
    expect(kv('Dû à l’entreprise')).toBe('Rien');
    expect(kv('Motif d’annulation')).toBe('Destinataire injoignable');
  });

  it('ancienne commande repas : articles et vendeur affichés seulement pour elle, sans lien de suivi', async () => {
    renderWithProviders(detail(), { path: '/courses/ord-food', routes: { 'GET /orders/ord-food': legacyFoodOrder() } });
    expect(await screen.findByText('Commande repas (ancien parcours)')).toBeInTheDocument();
    expect(screen.getByText('Article')).toBeInTheDocument();
    expect(screen.getByText('Riz gras')).toBeInTheDocument();
    expect(kv('Reversement vendeur')).toBe('4 250 FCFA');
    expect(kv('Vendeur')).toContain('Le Verdoyant');
    expect(screen.queryByRole('heading', { name: 'Suivi du destinataire' })).not.toBeInTheDocument();
  });
});

describe('Liste des livraisons', () => {
  it('colonnes entreprise, destinataire, statut, véhicule, montant, arrivée, création', async () => {
    renderWithProviders(<OrdersPage />, {
      path: '/courses',
      routes: { 'GET /orders': page([businessOrder(), legacyFoodOrder()]) },
    });
    expect(await screen.findByRole('heading', { name: 'Livraisons' })).toBeInTheDocument();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['#', 'Entreprise', 'Destinataire', 'Statut', 'Véh.', 'Montant', 'Arrivée', 'Créée']);
    const row = screen.getByRole('link', { name: '#1004' }).closest('tr') as HTMLElement;
    const cells = within(row).getAllByRole('cell').map((c) => norm(c.textContent));
    expect(cells[1]).toBe('Tech Plus Électronique');
    expect(cells[2]).toBe('Bureau Faso Conseil entrepriseDassasgho, route de Fada');
    expect(cells[3]).toBe('Livreur en routeAbdoul T.');
    // Détail sur une seule ligne, sans répéter l'unité du total.
    expect(cells[5]).toBe('90 800 FCFAfrais 5 800 · marchandise 85 000');
    expect(cells[6]).toMatch(/^49 minvers \d{2}:\d{2}$/);
    const legacy = screen.getByRole('link', { name: '#990' }).closest('tr') as HTMLElement;
    expect(norm(legacy.textContent)).toContain('commande repas (ancien)');
    expect(screen.getByRole('button', { name: /Exporter les livraisons/ })).toBeInTheDocument();
    expect(screen.queryByText(/Courses|Commandes en/)).not.toBeInTheDocument();
  });
});

describe('Entreprises (anciennement « Vendeurs »)', () => {
  const store = {
    id: 'st-new',
    ownerId: 'u-new',
    name: 'Grillades de Pissy',
    description: 'Brochettes',
    phone: '+22671000009',
    address: 'Pissy, secteur 17',
    landmark: 'À côté du marché de Pissy',
    lat: 12.34,
    lng: -1.57,
    isOpen: false,
    prepTimeMinutes: 20,
    openingHours: '',
    commissionPercent: null,
    distanceKm: null,
    approvalStatus: 'PENDING' as const,
    approvalNote: null,
    createdAt: '2026-11-05T10:00:00.000Z',
  };

  it('vocabulaire « entreprise », validation obligatoire avant les livraisons, comptes des entreprises', async () => {
    const u = userEvent.setup();
    const { calls } = renderWithProviders(<BusinessesPage />, {
      routes: {
        'GET /controller/stores': page([store]),
        'POST /controller/stores/st-new/suspend': { ...store, approvalStatus: 'SUSPENDED', approvalNote: 'Adresse introuvable' },
        'GET /controller/users': page([user({ id: 'u-new', name: 'Issa Compaoré', role: 'SELLER', phone: '+22671000009' })]),
      },
    });
    expect(screen.getByRole('heading', { name: 'Entreprises', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/doit être validée par Yaar avant sa première demande/)).toBeInTheDocument();
    expect(await screen.findByText('Grillades de Pissy')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Profils d’entreprise' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Comptes des entreprises' })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toContain('Adresse de retrait');
    const account = (await screen.findByText('Issa Compaoré')).closest('tr') as HTMLElement;
    expect(within(account).getByText('Entreprise')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/boutique|vendeur|restaurant/i);
    await u.click(screen.getByRole('button', { name: 'Refuser' }));
    const dialog = screen.getByRole('dialog', { name: 'Refuser l’entreprise « Grillades de Pissy »' });
    expect(within(dialog).getByText(/ne peut plus demander de livraisons/)).toBeInTheDocument();
    await u.type(within(dialog).getByRole('textbox'), 'Adresse introuvable');
    await u.click(within(dialog).getByRole('button', { name: 'Refuser' }));
    expect(await screen.findByText('Entreprise « Grillades de Pissy » refusée.')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.path)).toEqual(['/controller/stores/st-new/suspend']);
  });

  it('menu : Livraisons et Entreprises ; l’ancienne adresse /vendeurs mène aux entreprises', async () => {
    renderWithProviders(<App socketUrl="http://api.test" busOverride={createMemoryBus()} />, {
      path: '/vendeurs',
      routes: {
        'GET /controller/dashboard': dashboard,
        'GET /controller/stores': page([store]),
        'GET /controller/users': page([]),
        'GET /controller/incidents': page([]),
      },
    });
    expect(await screen.findByRole('heading', { name: 'Entreprises', level: 1 })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(within(nav).getByRole('link', { name: /Livraisons/ })).toHaveAttribute('href', '/courses');
    expect(within(nav).getByRole('link', { name: /^Entreprises/ })).toHaveAttribute('href', '/entreprises');
    expect(within(nav).queryByText(/Vendeurs|Courses/)).not.toBeInTheDocument();
  });
});

describe('Caisse : à reverser aux entreprises', () => {
  it('totaux et montant par entreprise, en lecture seule (pas de reversement)', async () => {
    const u = userEvent.setup();
    const { calls } = renderWithProviders(<CashPage />, {
      path: '/caisse',
      routes: {
        'GET /controller/cash': cashOverview,
        'GET /controller/cash/ledger': page([]),
        'GET /controller/cash/businesses': businessBalances,
      },
    });
    const card = (await screen.findByRole('heading', { name: 'À reverser aux entreprises' })).closest('section') as HTMLElement;
    expect(await within(card).findByText('Kaya Market')).toBeInTheDocument();
    expect(norm(within(card).getByRole('article', { name: 'Total à reverser' }).textContent)).toContain('25 500 FCFA');
    expect(within(card).getByRole('article', { name: 'Entreprises concernées' })).toHaveTextContent('2');
    expect(within(card).getByRole('article', { name: 'Livraisons avec marchandise encaissée' })).toHaveTextContent('3');
    const kaya = within(card).getByText('Kaya Market').closest('tr') as HTMLElement;
    expect(norm(kaya.textContent)).toContain('Salimata Traoré');
    expect(norm(kaya.textContent)).toContain('17 000 FCFA');
    expect(within(kaya).getByRole('link', { name: '+226 71 00 00 05' })).toHaveAttribute('href', 'tel:+22671000005');
    // Lecture seule, et dit honnêtement qu'il n'y a pas encore de reversement.
    expect(within(card).getByRole('note')).toHaveTextContent('Le reversement aux entreprises n’est pas encore géré');
    expect(within(card).getAllByRole('button').map((b) => b.textContent)).toEqual(['Actualiser']);
    const before = calls.filter((c) => c.path === '/controller/cash/businesses').length;
    await u.click(within(card).getByRole('button', { name: 'Actualiser' }));
    await waitFor(() => expect(calls.filter((c) => c.path === '/controller/cash/businesses').length).toBe(before + 1));
    expect(screen.getByRole('heading', { name: 'Caisse', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Soldes des livreurs' })).toBeInTheDocument();
  });

  it('aucun montant dû', async () => {
    renderWithProviders(<CashPage />, {
      routes: { 'GET /controller/cash': cashOverview, 'GET /controller/cash/ledger': page([]), 'GET /controller/cash/businesses': [] },
    });
    expect(await screen.findByText('Aucun montant dû aux entreprises.')).toBeInTheDocument();
    expect(balanceTotals([])).toEqual({ owed: 0, businesses: 0, deliveries: 0 });
  });
});

describe('Carte en direct : légende', () => {
  it('légende des nouveaux marqueurs', async () => {
    renderWithProviders(<LivePage />, {
      routes: {
        'GET /controller/map': mapData,
        'GET /controller/orders/pending': [pendingOrder],
        'GET /controller/drivers': page([driverProfile()]),
      },
    });
    const legend = screen.getByLabelText('Légende');
    for (const t of ['Livreur libre', 'En livraison', 'Entreprise', 'Destinataire', 'En attente d’un livreur', 'Itinéraire', 'SOS']) {
      expect(within(legend).getByText(t)).toBeInTheDocument();
    }
    expect(await screen.findByRole('heading', { name: 'Livraisons en attente' })).toBeInTheDocument();
  });
});

describe('Règles B2B (fonctions pures)', () => {
  it('qui encaisse quoi, libellés et arrivée', () => {
    expect(cashSplit(businessOrder())).toMatchObject({ atPickup: 5800, atDropoff: 85_000, goods: 85_000, business: true });
    expect(cashSplit(businessOrder({ feePaidBy: 'RECIPIENT', cashToCollect: 0 }))).toMatchObject({ atPickup: 0, atDropoff: 5800 });
    expect(cashSplit(legacyFoodOrder())).toMatchObject({ atPickup: 0, atDropoff: 6500, business: false });
    expect(isBusinessDelivery(businessOrder())).toBe(true);
    expect(isBusinessDelivery(legacyFoodOrder())).toBe(false);
    expect(statusLabel('PENDING', true)).toBe('Demande reçue');
    expect(statusLabel('PENDING', false)).toBe('En attente du vendeur');
    const now = Date.UTC(2026, 10, 8, 14, 0);
    expect(etaCell(12, now)).toEqual({ duration: '12 min', clock: '14:12' });
    expect(etaCell(null, now)).toBeNull();
    expect(legSummary(businessOrder({ route: { ...businessOrder().route!, source: 'straight' } }), now).details[0]).toMatch(
      /^Ligne droite \(itinéraire routier indisponible\)/,
    );
    expect(legSummary(businessOrder({ status: 'SEARCHING_DRIVER', driver: null, route: null }), now)).toEqual({
      stage: 'Recherche d’un livreur',
      details: [],
    });
  });
});

/* ------------------------------------------------------------------ */
/* Mode poll : pas de requête de plus                                  */
/* ------------------------------------------------------------------ */

const pollConfig: PublicConfigDto = { realtime: 'poll', pollIntervalMs: 4000, demoMode: false, otpChannel: 'console' };
const visible: VisibilitySource = { isVisible: () => true, subscribe: () => () => undefined };

function renderPoll(ui: React.ReactElement, path: string, routes: Record<string, unknown>) {
  const { impl, calls } = fakeFetch({ 'GET /me': controllerUser, ...routes });
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppConfigProvider baseUrl="http://api.test" initialConfig={pollConfig}>
        <AuthProvider baseUrl="http://api.test" fetchImpl={impl} initialToken="tok" initialUser={controllerUser}>
          <RealtimeProvider url="http://api.test" token="tok" visibility={visible}>
            {ui}
          </RealtimeProvider>
        </AuthProvider>
      </AppConfigProvider>
    </MemoryRouter>,
  );
  return calls;
}
const count = (calls: FakeCall[], path: string) => calls.filter((c) => c.path === path).length;

describe('Mode poll : la carte et les nouvelles sections n’ajoutent aucune requête', () => {
  it('fiche de livraison : GET /orders/:id toutes les 10 s seulement, arrêt une fois livrée', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    let status: 'ASSIGNED' | 'DELIVERED' = 'ASSIGNED';
    const calls = renderPoll(detail(), '/courses/ord-b2b', {
      'GET /orders/ord-b2b': () => ({ body: businessOrder({ status }) }),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(count(calls, '/orders/ord-b2b')).toBe(7);
    expect(calls.filter((c) => c.path !== '/me' && c.path !== '/orders/ord-b2b')).toEqual([]);
    status = 'DELIVERED';
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    const atDelivery = count(calls, '/orders/ord-b2b');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(count(calls, '/orders/ord-b2b')).toBe(atDelivery);
  });

  it('caisse : « à reverser » chargé une fois, rechargé seulement quand le cash détenu change', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    let totalHeld = cashOverview.totalHeld;
    const calls = renderPoll(<CashPage />, '/caisse', {
      'GET /controller/cash': () => ({ body: { ...cashOverview, totalHeld } }),
      'GET /controller/cash/ledger': page([]),
      'GET /controller/cash/businesses': businessBalances,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300_000);
    });
    // Soldes et grand livre : toutes les 30 s comme avant ; dû aux entreprises : une seule fois.
    expect(count(calls, '/controller/cash')).toBe(11);
    expect(count(calls, '/controller/cash/businesses')).toBe(1);
    totalHeld += 12_000; // une livraison avec marchandise vient d'être encaissée
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(count(calls, '/controller/cash/businesses')).toBe(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(count(calls, '/controller/cash/businesses')).toBe(2);
  });
});
