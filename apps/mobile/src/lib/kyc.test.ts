import type { DriverDocumentDto } from '@yaar/shared';
import { documentChecklist, kycProgress, parseExpiryDate } from './kyc';

const doc = (type: DriverDocumentDto['type'], isExpired = false): DriverDocumentDto => ({
  id: type,
  type,
  mimeType: 'image/jpeg',
  sizeBytes: 100,
  expiresAt: type === 'ASSURANCE' ? '2027-03-31T00:00:00.000Z' : null,
  isExpired,
  uploadedAt: '2026-11-06T10:00:00.000Z',
});

describe('documentChecklist', () => {
  it('vélo : CNIB + selfie seulement', () => {
    const list = documentChecklist('BIKE', [doc('CNIB')]);
    expect(list.map((i) => [i.type, i.state])).toEqual([
      ['CNIB', 'ok'],
      ['SELFIE', 'missing'],
    ]);
    expect(kycProgress(list)).toEqual({ done: 1, total: 2 });
  });

  it('moto : assurance expirée signalée, date exigée pour l’assurance', () => {
    const list = documentChecklist('MOTO', [doc('CNIB'), doc('ASSURANCE', true)]);
    const assurance = list.find((i) => i.type === 'ASSURANCE');
    expect(list).toHaveLength(5);
    expect(assurance?.state).toBe('expired');
    expect(assurance?.needsExpiry).toBe(true);
    expect(list.find((i) => i.type === 'CNIB')?.needsExpiry).toBe(false);
    expect(kycProgress(list)).toEqual({ done: 1, total: 5 });
  });
});

describe('parseExpiryDate', () => {
  const now = new Date('2026-11-06T12:00:00Z');
  it('accepte JJ/MM/AAAA et AAAA-MM-JJ', () => {
    expect(parseExpiryDate('31/03/2027', now)).toBe('2027-03-31');
    expect(parseExpiryDate('2027-3-1', now)).toBe('2027-03-01');
  });
  it('refuse les dates invalides ou passées', () => {
    expect(parseExpiryDate('31/02/2027', now)).toBeNull();
    expect(parseExpiryDate('01/01/2020', now)).toBeNull();
    expect(parseExpiryDate('demain', now)).toBeNull();
  });
});
