import { trackingHeadline, trackingSteps } from './trackingSteps';

const states = (status: Parameters<typeof trackingSteps>[0]) => trackingSteps(status).map((s) => s.state);

describe('étapes du suivi', () => {
  it('libellés du destinataire et de l’entreprise', () => {
    expect(trackingSteps('ASSIGNED').map((s) => s.label)).toEqual([
      'Commande confirmée',
      'Livreur en route vers l’expéditeur',
      'En route vers vous',
      'Livrée',
    ]);
    expect(trackingSteps('ASSIGNED', 'business').map((s) => s.label)).toEqual([
      'Demande envoyée',
      'Livreur en route vers vous',
      'En route vers le destinataire',
      'Livrée',
    ]);
  });

  it('avancement selon le statut', () => {
    expect(states('SEARCHING_DRIVER')).toEqual(['done', 'current', 'todo', 'todo']);
    expect(states('ASSIGNED')).toEqual(['done', 'current', 'todo', 'todo']);
    expect(states('PICKED_UP')).toEqual(['done', 'done', 'current', 'todo']);
    expect(states('DELIVERED')).toEqual(['done', 'done', 'done', 'done']);
    expect(states('CANCELLED')).toEqual(['done', 'todo', 'todo', 'todo']);
  });

  it('titres', () => {
    expect(trackingHeadline('SEARCHING_DRIVER', 'recipient', { sender: 'Pharmacie du Centre' })).toEqual({
      title: 'Recherche d’un livreur…',
      subtitle: 'Pharmacie du Centre a confirmé votre commande.',
    });
    expect(trackingHeadline('PICKED_UP', 'recipient', { driver: 'Issouf' }).title).toBe('Votre colis est en route');
    expect(trackingHeadline('PICKED_UP', 'business', { recipient: 'Awa' }).title).toBe('En route vers Awa');
    expect(trackingHeadline('DELIVERED', 'recipient').title).toBe('Colis livré : merci !');
    expect(trackingHeadline('CANCELLED', 'recipient', { sender: 'Pharmacie du Centre' }).subtitle).toMatch(/Contactez Pharmacie du Centre/);
  });
});
