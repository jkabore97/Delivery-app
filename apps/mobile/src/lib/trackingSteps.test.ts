import { recipientToDriverText, trackingHeadline, trackingSteps } from './trackingSteps';

const states = (status: Parameters<typeof trackingSteps>[0]) => trackingSteps(status).map((s) => s.state);

describe('étapes du suivi', () => {
  it('libellés courts (une ligne) du destinataire et de l’entreprise', () => {
    expect(trackingSteps('ASSIGNED').map((s) => s.label)).toEqual(['Confirmée', 'Retrait', 'En route', 'Livrée']);
    // Entreprise : les libellés de la spec Cobalt.
    expect(trackingSteps('ASSIGNED', 'business').map((s) => s.label)).toEqual(['Demandée', 'Récupérée', 'En route', 'Livrée']);
    for (const p of ['recipient', 'business'] as const) for (const s of trackingSteps('PICKED_UP', p)) expect(s.label.length).toBeLessThanOrEqual(10);
  });

  it('avancement selon le statut : pendant la recherche, seule la première étape est en cours', () => {
    expect(states('SEARCHING_DRIVER')).toEqual(['current', 'todo', 'todo', 'todo']);
    expect(states('PENDING')).toEqual(['current', 'todo', 'todo', 'todo']);
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
    expect(trackingHeadline('DELIVERED', 'recipient').title).toBe('Colis livré\u202f: merci\u202f!');
    expect(trackingHeadline('CANCELLED', 'recipient', { sender: 'Pharmacie du Centre' }).subtitle).toMatch(/Contactez Pharmacie du Centre/);
  });
});

describe('message WhatsApp du destinataire à son livreur', () => {
  it('prénom du livreur, numéro du colis et entreprise ; sans nom : bonjour simple', () => {
    expect(recipientToDriverText({ driver: 'Issouf', sender: 'Pharmacie du Centre', number: 1052 })).toBe(
      'Bonjour Issouf, je suis le destinataire du colis #1052 de Pharmacie du Centre (Yaar Livraison).',
    );
    expect(recipientToDriverText({ driver: null, sender: ' ', number: 7 })).toBe('Bonjour, je suis le destinataire du colis #7 (Yaar Livraison).');
  });
});
