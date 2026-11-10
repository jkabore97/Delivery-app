import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { KpiCards } from '../src/components/KpiCards';
import { DocumentChips } from '../src/components/DocumentChips';
import { AlertsPanel } from '../src/components/AlertsPanel';
import { PendingOrdersPanel } from '../src/components/PendingOrdersPanel';
import { Timeline } from '../src/pages/OrderDetailPage';
import { dashboard, driverProfile, pendingOrder, sos } from './fixtures';
import { renderWithProviders } from './helpers';

describe('KpiCards', () => {
  it('affiche les indicateurs de la maquette', () => {
    render(<KpiCards dashboard={dashboard} />);
    const online = screen.getByRole('article', { name: 'Livreurs en ligne' });
    expect(within(online).getByText('86')).toBeInTheDocument();
    // « 40 en course » : précision attachée au nombre (jamais coupée), pas en fin de la ligne des véhicules.
    expect(within(online).getByText('40 en course')).toHaveClass('kpi-note');
    expect(within(online).getByText('40 en course').textContent).toBe('40\u00a0en\u00a0course');
    // Répartition par véhicule : pictogrammes dessinés (aucun émoji), lus « Vélo 14 » ; le nombre ne se sépare jamais
    // de son libellé (espace insécable).
    const line = online.querySelector('.kpi-vehicles-line') as HTMLElement;
    expect(line).toHaveClass('kpi-sub');
    expect([...line.querySelectorAll('.kpi-vehicles')].map((v) => v.textContent)).toEqual([
      'Vélo\u00a014',
      'Moto\u00a061',
      'Voiture\u00a011',
    ]);
    expect(line.querySelectorAll('svg')).toHaveLength(3);
    expect(line.textContent).not.toMatch(/course/);
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(screen.getByText('1 depuis plus de 5 min')).toHaveClass('tone-red');
    // Nombre en grand et unité plus petite, collés (« 27 min », « 1,84 M FCFA »).
    expect(screen.getByRole('article', { name: 'Délai moyen' }).querySelector('.kpi-number')?.textContent).toBe('27 min');
    const cash = screen.getByRole('article', { name: 'Cash détenu par les livreurs' });
    expect(cash.querySelector('.kpi-number')?.textContent).toBe('1,84 M FCFA');
    expect(screen.getByText('3 livreurs au plafond')).toBeInTheDocument();
    // Cobalt : une seule tuile héros (livraisons en cours), les espèces en soleil, l'attente longue en alerte.
    expect(document.querySelectorAll('.kpi-cobalt')).toHaveLength(1);
    expect(screen.getByRole('article', { name: 'Livraisons en cours' })).toHaveClass('kpi-cobalt');
    expect(cash).toHaveClass('kpi-sun');
    expect(screen.getByRole('article', { name: 'En attente d’un livreur' })).toHaveClass('kpi-alert');
  });

  it('gère l’absence de livraison du jour', () => {
    render(<KpiCards dashboard={{ ...dashboard, avgDeliveryMinutesToday: null, waitingOver5Min: 0 }} />);
    expect(screen.getByText('aucune attente longue')).toHaveClass('tone-green');
    expect(screen.getByRole('article', { name: 'En attente d’un livreur' })).not.toHaveClass('kpi-alert');
    expect(screen.getByRole('article', { name: 'Délai moyen' }).querySelector('.kpi-number')?.textContent).toBe('-');
  });
});

describe('DocumentChips', () => {
  it('marque les pièces manquantes et expirées', () => {
    const p = driverProfile({
      documents: driverProfile().documents.filter((d) => d.type !== 'SELFIE').map((d) =>
        d.type === 'ASSURANCE' ? { ...d, isExpired: true } : d,
      ),
    });
    render(<DocumentChips profile={p} />);
    // Pièce fournie : nom court et coche dessinée (pas de « ✓ », absent de la police), texte complet pour les lecteurs d'écran.
    const cnib = screen.getByText('CNIB');
    expect(cnib).toHaveAttribute('data-state', 'ok');
    expect(cnib.querySelector('svg')).not.toBeNull();
    expect(cnib.textContent).toBe('CNIB fournie');
    expect(document.body.textContent).not.toContain('✓');
    expect(screen.getByText('Assurance expirée')).toHaveAttribute('data-state', 'expired');
    expect(screen.getByText('Selfie manquant')).toHaveAttribute('data-state', 'missing');
  });
});

describe('AlertsPanel', () => {
  it('liste les SOS en premier avec un bouton Appeler', () => {
    const dispute = { ...sos, id: 'inc-2', type: 'DISPUTE' as const, description: 'colis endommagé', orderNumber: 1031, createdAt: '2026-11-06T19:24:00.000Z' };
    render(
      <MemoryRouter>
        <AlertsPanel incidents={[dispute, sos]} now={new Date('2026-11-06T19:25:16.215Z')} />
      </MemoryRouter>,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('SOS · Livreur Karim D.');
    expect(items[0]).toHaveTextContent('il y a 2 min');
    expect(within(items[0] as HTMLElement).getByRole('link', { name: 'Appeler' })).toHaveAttribute('href', 'tel:+22673000002');
    expect(items[1]).toHaveTextContent('Litige #1031 : colis endommagé');
  });
});

describe('Timeline', () => {
  it('affiche la chronologie des statuts', () => {
    render(
      <Timeline
        events={[
          { id: 'e1', fromStatus: null, toStatus: 'PENDING', actorRole: 'CLIENT', note: null, createdAt: '2026-11-06T18:53:16.018Z' },
          { id: 'e2', fromStatus: 'PENDING', toStatus: 'ACCEPTED', actorRole: 'SELLER', note: 'Préparation : 15 min', createdAt: '2026-11-06T18:57:16.018Z' },
        ]}
      />,
    );
    expect(screen.getByText('Création · En attente du vendeur')).toBeInTheDocument();
    expect(screen.getByText('En attente du vendeur → En préparation')).toBeInTheDocument();
    expect(screen.getByText('Vendeur · Préparation : 15 min')).toBeInTheDocument();
    expect(screen.getByText('18:57')).toBeInTheDocument();
  });
});

describe('PendingOrdersPanel + affectation manuelle', () => {
  it('affiche l’attente en rouge au-delà de 5 min et affecte un livreur', async () => {
    const user = userEvent.setup();
    let changed = 0;
    const { calls } = renderWithProviders(
      <PendingOrdersPanel orders={[pendingOrder]} fetchedAt={Date.now()} onChanged={() => changed++} />,
      {
        routes: {
          'GET /controller/orders/ord-1052/candidates': [
            { id: 'busy', name: 'Issouf S.', phone: '+22673000001', vehicleType: 'MOTO', isOnline: true, isBusy: true, cashBlocked: false, distanceKm: 0.8 },
            { id: 'free', name: 'Karim D.', phone: '+22673000002', vehicleType: 'MOTO', isOnline: true, isBusy: false, cashBlocked: false, distanceKm: 1.4 },
          ],
          'POST /controller/orders/ord-1052/assign': { id: 'ord-1052' },
        },
      },
    );
    expect(screen.getByText('Zogona → Tampouy')).toBeInTheDocument();
    expect(screen.getByTestId('wait-1052')).toHaveClass('tone-red');
    expect(screen.getByTestId('wait-1052')).toHaveTextContent(/^6:1\d$/);

    await user.click(screen.getByRole('button', { name: 'Affecter' }));
    const dialog = await screen.findByRole('dialog', { name: /Affecter la livraison #1052 · Moto/ });
    const busyRow = (await within(dialog).findByText('Issouf S.')).closest('tr') as HTMLElement;
    expect(within(busyRow).getByRole('button', { name: 'Affecter' })).toBeDisabled();
    const freeRow = within(dialog).getByText('Karim D.').closest('tr') as HTMLElement;
    expect(within(freeRow).getByText('1,4 km')).toBeInTheDocument();
    await user.click(within(freeRow).getByRole('button', { name: 'Affecter' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({
      path: '/controller/orders/ord-1052/assign',
      body: { driverId: 'free' },
    });
    expect(changed).toBe(1);
  });

  it("montre l'offre automatique en cours", () => {
    renderWithProviders(
      <PendingOrdersPanel
        orders={[
          {
            ...pendingOrder,
            waitingSeconds: 20,
            currentOffer: { driverId: 'x', driverName: 'Fatimata Z.', expiresAt: new Date(Date.now() + 15_000).toISOString() },
          },
        ]}
        fetchedAt={Date.now()}
        onChanged={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: /^Auto… 1[45]\u00a0s$/ })).toBeInTheDocument();
    expect(screen.getByTestId('wait-1052')).not.toHaveClass('tone-red');
  });
});
