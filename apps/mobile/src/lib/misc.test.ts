import { addressLine, isAddressComplete, isPinAtDefault, toAddressInput } from './address';
import { formatFcfaShort, formatKm, initials, summarizeItems, timeAgo } from './format';
import { externalDirectionsUrl, webDirectionsUrl } from './navigation';
import { formatPhone, normalizePhone, telUrl } from './phone';
import { blockedAccountMessage, CLIENT_ACCOUNT_MESSAGE, homePathForRole, isSignupRole, roleLabel, spaceForRole } from './roles';
import { base64DecodedSize, MAX_PHOTO_BASE64_LENGTH, stripDataUrl, toFileUpload, UploadTooLargeError } from './upload';
import { pickVehicle } from './delivery';
import type { QuoteResponse } from '@yaar/shared';

describe('format', () => {
  it('formate les montants et distances', () => {
    expect(formatFcfaShort(6500)).toBe('6\u202f500 F');
    expect(formatKm(6.2)).toBe('6,2 km');
  });
  it('résume les articles', () => {
    expect(summarizeItems([{ name: 'Riz gras poulet', quantity: 2 }, { name: 'Bissap 50 cl', quantity: 1 }])).toBe(
      '2× Riz gras poulet · 1× Bissap 50 cl',
    );
  });
  it('affiche « il y a »', () => {
    const now = Date.parse('2026-11-06T10:00:00Z');
    expect(timeAgo('2026-11-06T09:59:50Z', now)).toBe('à l’instant');
    expect(timeAgo('2026-11-06T09:55:00Z', now)).toBe('il y a 5 min');
    expect(timeAgo('2026-11-06T07:00:00Z', now)).toBe('il y a 3 h');
  });
  it('calcule les initiales', () => {
    expect(initials('Issouf S.')).toBe('IS');
    expect(initials(null)).toBe('?');
  });
});

describe('téléphone', () => {
  it('normalise et formate les numéros burkinabè', () => {
    expect(normalizePhone('70 12 34 56')).toBe('+22670123456');
    expect(normalizePhone('123')).toBeNull();
    expect(formatPhone('+22670123456')).toBe('70 12 34 56');
    expect(telUrl('+226 70 12 34 56')).toBe('tel:+22670123456');
  });
});

describe('rôles', () => {
  it('deux espaces : Entreprise (SELLER) et Livreur ; client et back-office sans espace', () => {
    expect(homePathForRole('SELLER')).toBe('/business');
    expect(homePathForRole('DRIVER')).toBe('/driver');
    expect(spaceForRole('CLIENT')).toBeNull();
    expect(homePathForRole('CLIENT')).toBe('/login');
    expect(spaceForRole('CONTROLLER')).toBeNull();
    expect(homePathForRole('ADMIN')).toBe('/login');
    expect(roleLabel('SELLER')).toBe('Entreprise');
  });
  it('compte client : message d’accueil (le destinataire utilise son lien) ; pas d’inscription client', () => {
    expect(blockedAccountMessage('CLIENT')).toBe(CLIENT_ACCOUNT_MESSAGE);
    expect(CLIENT_ACCOUNT_MESSAGE).toMatch(/réservé aux entreprises et aux livreurs/);
    expect(CLIENT_ACCOUNT_MESSAGE).toMatch(/lien de suivi/);
    expect(blockedAccountMessage('ADMIN')).toMatch(/console web/);
    expect(blockedAccountMessage('SELLER')).toBeNull();
    expect(isSignupRole('CLIENT')).toBe(false);
    expect(isSignupRole('SELLER')).toBe(true);
    expect(isSignupRole('DRIVER')).toBe(true);
  });
});

describe('navigation externe', () => {
  const dest = { lat: 12.3686, lng: -1.5275 };
  it('construit les liens par plateforme', () => {
    expect(externalDirectionsUrl(dest, 'Le Verdoyant', 'android')).toBe('google.navigation:q=12.3686,-1.5275');
    expect(externalDirectionsUrl(dest, 'Le Verdoyant', 'ios')).toContain('maps.apple.com/?daddr=12.3686,-1.5275');
    expect(webDirectionsUrl(dest)).toBe('https://www.google.com/maps/dir/?api=1&destination=12.3686,-1.5275');
  });
});

describe('adresses', () => {
  it('valide et nettoie une adresse', () => {
    expect(isAddressComplete({ lat: 12, lng: -1, address: '  ', landmark: '' })).toBe(false);
    expect(isAddressComplete(null)).toBe(false);
    // épingle laissée sur le centre par défaut : refusée
    expect(isAddressComplete({ lat: 12.3714, lng: -1.5197, address: 'Pissy', landmark: '' })).toBe(false);
    expect(isAddressComplete({ lat: 12.37142, lng: -1.51968, address: 'Pissy', landmark: '' })).toBe(false);
    expect(isAddressComplete({ lat: 12.3536, lng: -1.5609, address: 'Pissy', landmark: '' })).toBe(true);
    expect(isPinAtDefault(null)).toBe(true);
    const a = { lat: 12.12345678, lng: -1.987654321, address: ' Patte d’Oie ', landmark: ' station Total ' };
    expect(toAddressInput(a)).toEqual({ lat: 12.123457, lng: -1.987654, address: 'Patte d’Oie', landmark: 'station Total' });
    expect(addressLine({ address: 'Zogona', landmark: '' })).toBe('Zogona');
    expect(addressLine({ address: 'Zogona', landmark: 'Boutique' })).toBe('Zogona · Repère : Boutique');
  });
});

describe('envoi de fichiers', () => {
  it('retire le préfixe data: et calcule la taille décodée', () => {
    expect(stripDataUrl('data:image/jpeg;base64,QUJD')).toBe('QUJD');
    expect(base64DecodedSize('QUJD')).toBe(3);
    expect(base64DecodedSize('QUI=')).toBe(2);
    expect(toFileUpload('QUJD')).toEqual({ mimeType: 'image/jpeg', dataBase64: 'QUJD' });
  });
  it('vérifie la taille encodée avant l’envoi : 3 Mo décodés (4 Mo en base64) au plus, message en français', () => {
    expect(MAX_PHOTO_BASE64_LENGTH).toBe(4 * 1024 * 1024);
    // Sous la limite de 4,5 Mo des requêtes Vercel, avec de la marge pour le reste du JSON.
    expect(MAX_PHOTO_BASE64_LENGTH).toBeLessThan(4.5 * 1024 * 1024 - 64 * 1024);
    const atLimit = 'A'.repeat(MAX_PHOTO_BASE64_LENGTH);
    expect(toFileUpload(`data:image/jpeg;base64,${atLimit}`).dataBase64).toHaveLength(MAX_PHOTO_BASE64_LENGTH);
    const big = 'A'.repeat(MAX_PHOTO_BASE64_LENGTH + 4);
    expect(() => toFileUpload(big)).toThrow(UploadTooLargeError);
    expect(() => toFileUpload(big)).toThrow('Photo trop volumineuse (3 Mo maximum)');
  });
});

describe('pickVehicle', () => {
  const quote = (available: Record<string, boolean>): QuoteResponse => ({
    type: 'FOOD',
    distanceKm: 4.5,
    itemsTotal: 1000,
    pickup: { lat: 0, lng: 0, address: 'a', landmark: '' },
    dropoff: { lat: 0, lng: 0, address: 'b', landmark: '' },
    paymentMethods: ['CASH'],
    options: (['BIKE', 'MOTO', 'CAR'] as const).map((v) => ({
      vehicleType: v,
      available: available[v] ?? true,
      deliveryFee: 1000,
      total: 2000,
      estimatedMinutes: 10,
    })),
  });
  it('garde le choix courant s’il est disponible, sinon la moto, sinon le premier', () => {
    expect(pickVehicle(quote({}), 'CAR')).toBe('CAR');
    expect(pickVehicle(quote({}), null)).toBe('MOTO');
    expect(pickVehicle(quote({ CAR: false }), 'CAR')).toBe('MOTO');
    expect(pickVehicle(quote({ MOTO: false }), null)).toBe('BIKE');
    expect(pickVehicle(quote({ BIKE: false, MOTO: false, CAR: false }), null)).toBeNull();
  });
});
