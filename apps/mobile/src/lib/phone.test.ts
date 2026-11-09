import { telUrl, whatsappUrl } from './phone';
import { whatsappUrl as whatsappUrlNoZod } from './tel';

describe('lien WhatsApp', () => {
  it('numéro international de l’API : https://wa.me/<chiffres>', () => {
    expect(whatsappUrl('+22670123456')).toBe('https://wa.me/22670123456');
    expect(whatsappUrl('+226 70 12 34 56')).toBe('https://wa.me/22670123456');
    expect(whatsappUrl('0022670123456')).toBe('https://wa.me/22670123456');
  });

  it('numéro local à 8 chiffres : indicatif du Burkina Faso ajouté', () => {
    expect(whatsappUrl('70 12 34 56')).toBe('https://wa.me/22670123456');
    expect(whatsappUrl('70.12.34.56')).toBe('https://wa.me/22670123456');
  });

  it('message prérempli encodé ; message vide ignoré', () => {
    expect(whatsappUrl('+22670123456', 'Bonjour, j’arrive : course #1052 & colis')).toBe(
      'https://wa.me/22670123456?text=Bonjour%2C%20j%E2%80%99arrive%20%3A%20course%20%231052%20%26%20colis',
    );
    expect(whatsappUrl('+22670123456', '   ')).toBe('https://wa.me/22670123456');
    expect(whatsappUrl('+22670123456', null)).toBe('https://wa.me/22670123456');
  });

  it('même fonction sans zod (lib/tel) ; lien d’appel inchangé', () => {
    expect(whatsappUrlNoZod).toBe(whatsappUrl);
    expect(telUrl('+226 70 12 34 56')).toBe('tel:+22670123456');
  });
});
