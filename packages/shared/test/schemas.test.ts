import { describe, expect, it } from 'vitest';
import {
  base64Length,
  createOrderSchema,
  driverProfileSchema,
  incidentListQuerySchema,
  normalizePhone,
  VERCEL_MAX_UPLOAD_BYTES,
  verifyOtpSchema,
} from '../src';

describe('normalizePhone', () => {
  it('normalise les formats burkinabè', () => {
    expect(normalizePhone('70 12 34 56')).toBe('+22670123456');
    expect(normalizePhone('+226 70123456')).toBe('+22670123456');
    expect(normalizePhone('0022670123456')).toBe('+22670123456');
    expect(normalizePhone('123')).toBeNull();
  });
});

describe('schémas', () => {
  it('verifyOtp exige 6 chiffres', () => {
    expect(verifyOtpSchema.safeParse({ phone: '70123456', code: '12345' }).success).toBe(false);
    expect(verifyOtpSchema.parse({ phone: '70123456', code: '123456' }).phone).toBe('+22670123456');
  });

  it('createOrder FOOD exige boutique et articles', () => {
    const dropoff = { lat: 12.35, lng: -1.5, address: 'Patte d’Oie' };
    expect(createOrderSchema.safeParse({ type: 'FOOD', vehicleType: 'MOTO', dropoff }).success).toBe(false);
    const ok = createOrderSchema.parse({
      type: 'FOOD',
      vehicleType: 'MOTO',
      dropoff,
      storeId: 's1',
      items: [{ productId: 'p1', quantity: 2 }],
    });
    expect(ok.paymentMethod).toBe('CASH');
    expect(ok.dropoff.landmark).toBe('');
  });

  it('createOrder PARCEL exige un point de retrait', () => {
    const dropoff = { lat: 12.35, lng: -1.5, address: 'B' };
    expect(createOrderSchema.safeParse({ type: 'PARCEL', vehicleType: 'BIKE', dropoff }).success).toBe(false);
  });

  it('profil livreur : immatriculation requise sauf vélo', () => {
    expect(driverProfileSchema.safeParse({ vehicleType: 'BIKE' }).success).toBe(true);
    expect(driverProfileSchema.safeParse({ vehicleType: 'MOTO' }).success).toBe(false);
    expect(driverProfileSchema.parse({ vehicleType: 'MOTO', plate: '11 jj 4521' }).plate).toBe('11 JJ 4521');
  });

  it('incidents : un ou plusieurs statuts séparés par des virgules', () => {
    expect(incidentListQuerySchema.parse({ status: 'OPEN' }).status).toEqual(['OPEN']);
    expect(incidentListQuerySchema.parse({ status: 'OPEN, IN_PROGRESS' }).status).toEqual(['OPEN', 'IN_PROGRESS']);
    expect(incidentListQuerySchema.parse({}).status).toBeUndefined();
    expect(incidentListQuerySchema.safeParse({ status: 'OPEN,FERME' }).success).toBe(false);
  });

  it('plafond Vercel : 3 Mo décodés tiennent sous la limite de 4,5 Mo des requêtes Vercel', () => {
    expect(base64Length(3)).toBe(4);
    expect(base64Length(4)).toBe(8);
    expect(base64Length(VERCEL_MAX_UPLOAD_BYTES)).toBe(4 * 1024 * 1024);
    expect(base64Length(VERCEL_MAX_UPLOAD_BYTES)).toBeLessThan(4.5 * 1024 * 1024);
  });
});
