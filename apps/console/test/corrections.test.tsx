import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App } from '../src/App';
import { DeliveryHero, deliverySteps } from '../src/components/DeliveryHero';
import { BizMark, Modal, ReasonDialog, TableWrap } from '../src/components/ui';
import { buildDeliveryScene, buildLiveScene } from '../src/lib/map/scene';
import { legSummary } from '../src/lib/delivery';
import { signedFcfa } from '../src/pages/CashPage';
import { LivePage } from '../src/pages/LivePage';
import { OrderDetailPage } from '../src/pages/OrderDetailPage';
import { OrdersPage } from '../src/pages/OrdersPage';
import { AssignDialog } from '../src/components/AssignDialog';
import { createMemoryBus } from '../src/realtime/RealtimeContext';
import { renderWithProviders } from './helpers';
import { b2bMapData, businessOrder, dashboard, driverProfile, mapData, page, pendingOrder, sos } from './fixtures';

vi.mock('../src/components/LiveMap', () => ({
  LiveMap: () => <div data-testid="map" />,
}));

const norm = (s: string | null | undefined) => (s ?? '').replace(/[  ]/g, ' ');
const NOW = Date.parse('2026-11-08T14:00:00.000Z');

describe('DeliveryHero', () => {
  it('livraison en route : heure en grand, notes sans répétition, étapes annoncées, espèces en pilule soleil', () => {
    const o = businessOrder({ status: 'PICKED_UP', pickedUpAt: '2026-11-08T13:50:00.000Z', etaMinutes: 7 });
    const leg = legSummary(o, NOW);
    render(<DeliveryHero o={o} nowMs={NOW} stageText={leg.stage} details={leg.details} />);
    const hero = screen.getByRole('region', { name: 'Livraison en cours' });
    expect(hero.querySelector('.hero-eta b')).toHaveTextContent('14:07');
    expect(norm(within(hero).getByText(/^dans/).textContent)).toBe('dans 7 min');
    // Puce « En direct » (le statut est dans le titre de la page, lu ici par les lecteurs d'écran seulement).
    expect(within(hero).getByText('En direct')).toHaveClass('hero-chip');
    const notes = within(hero).getByRole('list', { name: 'Étape en cours' });
    expect(norm(notes.textContent)).toContain('Colis récupéré : en route vers le destinataire');
    expect(norm(notes.textContent)).not.toContain('Arrivée vers');
    // Typographie : espace insécable avant « : ».
    expect(notes.textContent).toContain('récupéré :');
    const steps = within(hero).getByRole('list', { name: 'Avancement' });
    const current = steps.querySelector('[aria-current="step"]');
    expect(current).toHaveTextContent('Livrée (en cours)');
    expect(steps.querySelectorAll('li.done')).toHaveLength(3);
    // Destinataire paie : frais + marchandise à encaisser, pilule soleil.
    expect(norm(hero.querySelector('.sunpill')?.textContent)).toBe('85 000 FCFA');
  });

  it('livraison terminée ou annulée : récapitulatif blanc avec la légende de l’heure', () => {
    const delivered = businessOrder({ status: 'DELIVERED', deliveredAt: '2026-11-08T14:21:00.000Z' });
    const { unmount } = render(<DeliveryHero o={delivered} nowMs={NOW} stageText="Livrée" details={[]} />);
    const tile = screen.getByRole('region', { name: 'Récapitulatif de la livraison' });
    expect(within(tile).getByText('Livrée à')).toBeInTheDocument();
    expect(within(tile).getByText('14:21')).toHaveAttribute('dateTime', '2026-11-08T14:21:00.000Z');
    unmount();
    const cancelled = businessOrder({ status: 'CANCELLED', cancelledAt: '2026-11-08T13:30:00.000Z', cancelReason: 'Destinataire injoignable' });
    render(<DeliveryHero o={cancelled} nowMs={NOW} stageText="Annulée" details={[]} />);
    expect(screen.getByText('Annulée à')).toBeInTheDocument();
    expect(norm(screen.getByText(/^Motif/).textContent)).toBe('Motif : Destinataire injoignable');
  });

  it('étapes : recherche d’un livreur, la deuxième étape est en cours', () => {
    const steps = deliverySteps(businessOrder({ status: 'SEARCHING_DRIVER', driver: null, assignedAt: null }), NOW);
    expect(steps.map((s) => s.state)).toEqual(['done', 'now', 'next', 'next']);
  });
});

describe('Fenêtres : gestion du focus', () => {
  function Harness() {
    return (
      <div>
        <button type="button">Derrière</button>
        <ReasonDialog title="Motif" confirmLabel="Confirmer" onConfirm={async () => undefined} onClose={() => undefined} />
      </div>
    );
  }

  it('le focus entre, Tab tourne dans la fenêtre, le fond est inerte, Échap rend le focus à l’ouvreur', async () => {
    const u = userEvent.setup();
    const { rerender } = render(
      <div id="app-root">
        <button type="button">Ouvrir</button>
      </div>,
    );
    const opener = screen.getByRole('button', { name: 'Ouvrir' });
    opener.focus();
    const onClose = vi.fn();
    rerender(
      <div id="app-root">
        <button type="button">Ouvrir</button>
        <Modal title="Affecter" onClose={onClose}>
          <button type="button">Premier</button>
          <button type="button">Dernier</button>
        </Modal>
      </div>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Affecter' });
    // Portail dans <body> : le reste de la page est inerte.
    expect(dialog.closest('#app-root')).toBeNull();
    expect(document.getElementById('app-root')?.closest('[inert]')).not.toBeNull();
    expect(document.activeElement).toBe(dialog);
    await u.tab();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Fermer' }));
    await u.tab();
    await u.tab();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Dernier' }));
    await u.tab();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Fermer' }));
    await u.tab({ shift: true });
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Dernier' }));
    await u.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(
      <div id="app-root">
        <button type="button">Ouvrir</button>
      </div>,
    );
    expect(document.querySelector('[inert]')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ouvrir' }));
  });

  it('un champ autoFocus garde le focus', () => {
    render(<Harness />);
    expect(document.activeElement).toBe(screen.getByRole('textbox'));
  });
});

describe('Console : « / » et fenêtres', () => {
  it('« / » place le curseur dans la recherche, sauf quand une fenêtre est ouverte', async () => {
    const u = userEvent.setup();
    renderWithProviders(<App socketUrl="http://api.test" busOverride={createMemoryBus()} />, {
      routes: {
        'GET /controller/dashboard': dashboard,
        'GET /controller/map': mapData,
        'GET /controller/orders/pending': [pendingOrder],
        'GET /controller/drivers': page([]),
        'GET /controller/incidents': page([]),
        'GET /controller/orders/ord-1052/candidates': [],
      },
    });
    await screen.findByText('Zogona → Tampouy');
    await u.keyboard('/');
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Rechercher' }));
    (document.activeElement as HTMLElement).blur();
    await u.click(screen.getByRole('button', { name: 'Affecter' }));
    const dialog = await screen.findByRole('dialog');
    await u.keyboard('/');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('un SOS déjà ouvert au chargement ouvre une alerte ; masqué, il ne revient pas dans cet onglet', async () => {
    const u = userEvent.setup();
    const routes = {
      'GET /controller/dashboard': dashboard,
      'GET /controller/map': mapData,
      'GET /controller/orders/pending': [],
      'GET /controller/drivers': page([]),
      'GET /controller/incidents': page([sos]),
    };
    const first = renderWithProviders(<App socketUrl="http://api.test" busOverride={createMemoryBus()} />, { routes });
    const toast = (await screen.findByText('SOS · Karim D.')).closest('.toast') as HTMLElement;
    expect(toast).toHaveAttribute('role', 'alert');
    await u.click(within(toast).getByRole('button', { name: 'Masquer' }));
    expect(screen.queryByText('SOS · Karim D.')).not.toBeInTheDocument();
    first.unmount();
    renderWithProviders(<App socketUrl="http://api.test" busOverride={createMemoryBus()} />, { routes });
    // Le panneau « Alertes » le montre toujours, mais pas de nouvelle alerte.
    expect(await screen.findByText(/SOS · Livreur Karim D\./)).toBeInTheDocument();
    expect(screen.queryByText('SOS · Karim D.')).not.toBeInTheDocument();
    window.sessionStorage.clear();
  });
});

describe('Carte en direct : états et ordre', () => {
  const routes = {
    'GET /controller/dashboard': dashboard,
    'GET /controller/map': mapData,
    'GET /controller/orders/pending': [pendingOrder],
    'GET /controller/drivers': page([driverProfile()]),
    'GET /controller/incidents': page([sos]),
  };

  it('panneaux avant la carte (alertes d’abord) ; légende repliée en pastille', async () => {
    const u = userEvent.setup();
    const { container } = renderWithProviders(<LivePage />, { routes });
    await screen.findByTestId('map');
    const grid = container.querySelector('.live-grid') as HTMLElement;
    expect(grid.firstElementChild).toHaveClass('side-panels');
    const headings = within(grid.querySelector('.side-panels') as HTMLElement)
      .getAllByRole('heading', { level: 2 })
      .map((h) => norm(h.textContent).replace(/\d+$/, ''));
    expect(headings).toEqual(['Alertes', 'Livraisons en attente', 'Dossiers livreurs à valider']);
    const toggle = screen.getByRole('button', { name: 'Légende' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText('Légende')).not.toBeVisible();
    await u.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('list', { name: 'Légende' })).toBeVisible();
    expect(within(screen.getByRole('list', { name: 'Légende' })).getAllByRole('listitem')).toHaveLength(7);
  });

  it('carte en erreur : emplacement avec « Réessayer », sans filtres ni légende', async () => {
    let fail = true;
    const u = userEvent.setup();
    renderWithProviders(<LivePage />, {
      routes: {
        ...routes,
        'GET /controller/map': () => (fail ? { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Erreur interne du serveur' } } } : { body: mapData }),
      },
    });
    expect(await screen.findByText('Carte indisponible')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Filtrer par véhicule' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Légende' })).not.toBeInTheDocument();
    fail = false;
    await u.click(within(screen.getByText('Carte indisponible').closest('.map-placeholder') as HTMLElement).getByRole('button', { name: /Réessayer/ }));
    expect(await screen.findByTestId('map')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Filtrer par véhicule' })).toBeInTheDocument();
  });
});

describe('Listes et fiches : erreurs', () => {
  it('liste en erreur : le bandeau seulement, jamais « aucune livraison »', async () => {
    renderWithProviders(<OrdersPage />, {
      path: '/courses',
      routes: { 'GET /orders': () => ({ status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Erreur interne du serveur' } } }) },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Erreur');
    expect(screen.queryByText(/Aucune livraison/)).not.toBeInTheDocument();
  });

  it('fiche introuvable : titre et retour à la liste, sans « Réessayer »', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/courses/:id" element={<OrderDetailPage />} />
      </Routes>,
      {
        path: '/courses/nope',
        routes: { 'GET /orders/nope': () => ({ status: 404, body: { error: { code: 'NOT_FOUND', message: 'Livraison introuvable' } } }) },
      },
    );
    expect(await screen.findByRole('heading', { name: 'Livraison introuvable', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Livraisons' })).toHaveAttribute('href', '/courses');
    expect(screen.queryByRole('button', { name: /Réessayer/ })).not.toBeInTheDocument();
    expect(document.title).toBe('Livraison · Yaar Console');
  });

  it('fiche : annuler et valider sans code en secondaire, affecter seul en cobalt', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/courses/:id" element={<OrderDetailPage />} />
      </Routes>,
      { path: '/courses/ord-b2b', routes: { 'GET /orders/ord-b2b': businessOrder({ status: 'PICKED_UP' }) } },
    );
    expect(await screen.findByRole('button', { name: 'Annuler la livraison' })).toHaveClass('btn-danger-soft');
    expect(screen.getByRole('button', { name: 'Valider la livraison' })).toHaveClass('btn-ghost');
    expect(document.querySelectorAll('.page-toolbar .btn-primary, .page-toolbar .btn-danger')).toHaveLength(0);
    expect(document.title).toBe('Livraison #1004 · Yaar Console');
  });
});

describe('Tableaux : défilement dans la carte seulement si nécessaire', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passe en défilement horizontal (région atteignable au clavier) quand le tableau dépasse', () => {
    const callbacks: Array<() => void> = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          callbacks.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    let tableWidth = 600;
    const { container } = render(
      <TableWrap label="Livreurs">
        <table className="table" />
      </TableWrap>,
    );
    const wrap = container.querySelector('.table-wrap') as HTMLElement;
    const table = wrap.firstElementChild as HTMLElement;
    Object.defineProperty(wrap, 'clientWidth', { configurable: true, get: () => 800 });
    Object.defineProperty(table, 'offsetWidth', { configurable: true, get: () => tableWidth });
    act(() => callbacks.forEach((cb) => cb()));
    expect(wrap).not.toHaveClass('is-scroll');
    expect(wrap).not.toHaveAttribute('tabindex');
    tableWidth = 1040;
    act(() => callbacks.forEach((cb) => cb()));
    expect(wrap).toHaveClass('is-scroll');
    expect(screen.getByRole('region', { name: 'Livreurs (défilement horizontal)' })).toHaveAttribute('tabindex', '0');
  });
});

describe('Cartes : initiales, étiquettes, gouttes', () => {
  it('mêmes initiales d’entreprise dans les tableaux et sur les cartes', () => {
    const { container } = render(
      <MemoryRouter>
        <BizMark name="Grillades de Pissy" />
        <BizMark name="Pharmacie du Progrès" />
        <BizMark name={null} />
      </MemoryRouter>,
    );
    const marks = [...container.querySelectorAll('.biz-mark')];
    expect(marks.map((m) => m.getAttribute('data-initials'))).toEqual(['GP', 'PP', null]);
    expect(marks[2]?.querySelector('svg')).not.toBeNull();
    expect(buildDeliveryScene(businessOrder()).markers.find((m) => m.id === 'pickup')?.initials).toBe('TP');
  });

  it('un destinataire à l’adresse d’une entreprise est posé au-dessus de son carré', () => {
    const data = structuredClone(b2bMapData);
    const store = data.stores[0]!;
    data.orders[0] = { ...data.orders[0]!, dropoff: { ...data.orders[0]!.dropoff, lat: store.lat, lng: store.lng } };
    const scene = buildLiveScene(data, 'ALL');
    expect(scene.markers.find((m) => m.id === `dropoff:${data.orders[0]!.id}`)?.onBusiness).toBe(true);
    expect(scene.markers.filter((m) => m.kind === 'dropoff' && m.onBusiness)).toHaveLength(1);
  });
});

describe('Affectation : raison visible', () => {
  it('écrit pourquoi un livreur ne peut pas être affecté, relié au bouton désactivé', async () => {
    renderWithProviders(
      <AssignDialog orderId="ord-1052" orderNumber={1052} vehicleType="MOTO" onClose={() => undefined} onAssigned={() => undefined} />,
      {
        routes: {
          'GET /controller/orders/ord-1052/candidates': [
            { id: 'off', name: 'Moussa O.', phone: '+22673000005', vehicleType: 'MOTO', isOnline: false, isBusy: false, cashBlocked: false, distanceKm: 2.1 },
          ],
        },
      },
    );
    const row = (await screen.findByText('Moussa O.')).closest('tr') as HTMLElement;
    const reason = within(row).getByText(/Hors ligne : appelez-le/);
    const button = within(row).getByRole('button', { name: 'Affecter' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-describedby', reason.id);
    expect(screen.getByText(/Seul un livreur en ligne/)).toBeInTheDocument();
  });
});

describe('Caisse', () => {
  it('montants signés avec un vrai signe moins', () => {
    expect(norm(signedFcfa(12_000))).toBe('+12 000 FCFA');
    expect(norm(signedFcfa(-5_000))).toBe('−5 000 FCFA');
    expect(norm(signedFcfa(0))).toBe('0 FCFA');
  });
});

describe('Fenêtre d’annulation', () => {
  it('« Retour » ferme sans annuler', async () => {
    const u = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ReasonDialog title="Annuler la livraison #1" confirmLabel="Annuler la livraison" cancelLabel="Retour" onConfirm={async () => undefined} onClose={onClose} />,
    );
    await u.click(screen.getByRole('button', { name: 'Retour' }));
    expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Annuler/ })).toHaveLength(1));
  });
});
