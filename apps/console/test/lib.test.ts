import { describe, expect, it } from 'vitest';
import { formatKm, formatPhone, formatRelative, formatWaiting, initials, splitFcfaCompact } from '../src/lib/format';
import { applyDriverLocation, applyDriverStatus, applyIncident, filterDrivers, kpiFingerprint } from '../src/lib/mapState';
import { chipText, documentChips, kycActions } from '../src/lib/kyc';
import { candidateBlocker } from '../src/components/AssignDialog';
import { currentWaitingSeconds } from '../src/components/PendingOrdersPanel';
import { validateDeposit } from '../src/pages/CashPage';
import { draftFromRule, parseDraft, previewLine } from '../src/pages/PricingPage';
import { statusFilterToList } from '../src/pages/OrdersPage';
import { auditActionLabel } from '../src/pages/AuditPage';
import { driverProfile, mapData, pendingOrder, sos } from './fixtures';

describe('format', () => {
  it('formate les attentes en m:ss', () => {
    expect(formatWaiting(372)).toBe('6:12');
    expect(formatWaiting(20)).toBe('0:20');
    expect(formatWaiting(3725)).toBe('1\u00A0h 02');
    expect(formatWaiting(89526)).toBe('1\u00A0j');
    expect(formatWaiting(97200)).toBe('1\u00A0j 3\u00A0h');
    expect(formatWaiting(-5)).toBe('0:00');
  });

  it('sépare nombre et unité des montants des tuiles (compact au-delà du million)', () => {
    expect(splitFcfaCompact(1_840_000)).toEqual({ value: '1,84 M', unit: 'FCFA' });
    expect(splitFcfaCompact(2_000_000)).toEqual({ value: '2 M', unit: 'FCFA' });
    expect(splitFcfaCompact(-1_500_000)).toEqual({ value: '-1,5 M', unit: 'FCFA' });
    const plain = splitFcfaCompact(90_500);
    expect(plain.unit).toBe('FCFA');
    expect(plain.value.replace(/\u202f/g, ' ')).toBe('90 500');
    // Sans compactage (caisse) : le montant entier.
    expect(splitFcfaCompact(1_840_000, false).value.replace(/\u202f/g, ' ')).toBe('1 840 000');
  });

  it('distance insécable', () => {
    expect(formatKm(2)).toBe('2,0\u00a0km');
    expect(formatKm(null)).toBe('-');
  });

  it('calcule les initiales et formate les téléphones', () => {
    expect(initials('Ousmane B.')).toBe('OB');
    expect(initials(null)).toBe('?');
    expect(formatPhone('+22670000002')).toBe('+226 70 00 00 02');
  });

  it('affiche une date relative', () => {
    const now = new Date('2026-11-06T19:25:16.215Z');
    expect(formatRelative('2026-11-06T19:23:16.215Z', now)).toBe('il y a 2 min');
    expect(formatRelative('2026-11-06T19:25:00.000Z', now)).toBe('à l’instant');
  });
});

describe('mapState', () => {
  it('déplace un livreur connu sans recharger', () => {
    const r = applyDriverLocation(mapData, {
      driverId: 'drv-karim',
      lat: 12.4,
      lng: -1.52,
      heading: null,
      speed: null,
      orderId: null,
      at: '2026-11-06T19:30:00.000Z',
    });
    expect(r.needsRefetch).toBe(false);
    expect(r.state.drivers[0]).toMatchObject({ lat: 12.4, lng: -1.52, lastLocationAt: '2026-11-06T19:30:00.000Z' });
    expect(mapData.drivers[0]?.lat).toBe(12.3985);
  });

  it('demande un rechargement pour un livreur inconnu', () => {
    const r = applyDriverLocation(mapData, {
      driverId: 'nouveau',
      lat: 12.4,
      lng: -1.52,
      heading: null,
      speed: null,
      orderId: null,
      at: '2026-11-06T19:30:00.000Z',
    });
    expect(r.needsRefetch).toBe(true);
    expect(applyDriverStatus(mapData, { driverId: 'nouveau', isOnline: true, isBusy: false }).needsRefetch).toBe(true);
  });

  it('retire un livreur qui passe hors ligne et met à jour « en course »', () => {
    const off = applyDriverStatus(mapData, { driverId: 'drv-karim', isOnline: false, isBusy: false });
    expect(off.state.drivers.map((d) => d.id)).toEqual(['drv-fati']);
    const busy = applyDriverStatus(mapData, { driverId: 'drv-karim', isOnline: true, isBusy: true });
    expect(busy.state.drivers[0]?.isBusy).toBe(true);
  });

  it('ajoute puis retire une alerte SOS', () => {
    const withSos = applyIncident(mapData, sos);
    expect(withSos.openSos).toHaveLength(1);
    expect(applyIncident(withSos, { ...sos, status: 'RESOLVED' }).openSos).toHaveLength(0);
    expect(applyIncident(mapData, { ...sos, type: 'DISPUTE' })).toBe(mapData);
  });

  it('filtre par véhicule', () => {
    expect(filterDrivers(mapData.drivers, 'BIKE').map((d) => d.id)).toEqual(['drv-fati']);
    expect(filterDrivers(mapData.drivers, 'ALL')).toHaveLength(2);
  });

  it('empreinte des indicateurs : courses actives (statut), livreurs en ligne et en course ; pas les positions', () => {
    const order = {
      id: 'ord-1', number: 1001, type: 'PARCEL' as const, status: 'ASSIGNED' as const, vehicleType: 'BIKE' as const,
      pickup: { lat: 12.37, lng: -1.52, address: 'A' }, dropoff: { lat: 12.38, lng: -1.5, address: 'B' },
      driverId: 'drv-fati', createdAt: '2026-11-06T19:00:00.000Z', route: null,
    };
    const base = { ...mapData, orders: [order] };
    const key = kpiFingerprint(base);
    const moved = applyDriverLocation(base, { driverId: 'drv-karim', lat: 12.4, lng: -1.5, heading: 90, speed: 5, orderId: null, at: '2026-11-06T19:30:00.000Z' });
    expect(kpiFingerprint(moved.state)).toBe(key);
    expect(kpiFingerprint({ ...base, orders: [{ ...order, status: 'PICKED_UP' }] })).not.toBe(key);
    expect(kpiFingerprint({ ...base, orders: [] })).not.toBe(key);
    expect(kpiFingerprint(applyDriverStatus(base, { driverId: 'drv-karim', isOnline: true, isBusy: true }).state)).not.toBe(key);
    expect(kpiFingerprint(applyDriverStatus(base, { driverId: 'drv-karim', isOnline: false, isBusy: false }).state)).not.toBe(key);
  });
});

describe('kyc', () => {
  it('produit une pastille par pièce exigée', () => {
    const p = driverProfile({
      vehicleType: 'CAR',
      documents: driverProfile().documents
        .filter((d) => d.type !== 'SELFIE')
        .map((d) => (d.type === 'ASSURANCE' ? { ...d, isExpired: true } : d)),
      kycComplete: false,
    });
    const chips = documentChips(p);
    expect(chips.map((c) => c.state)).toEqual(['ok', 'ok', 'ok', 'expired', 'missing']);
    expect(chips.map(chipText)).toEqual(['CNIB fournie', 'Permis fourni', 'Carte grise fournie', 'Assurance expirée', 'Selfie manquant']);
    expect(chipText({ type: 'PERMIS', label: 'Permis', state: 'expired', documentId: null })).toBe('Permis expiré');
    expect(chipText({ type: 'CNIB', label: 'CNIB', state: 'missing', documentId: null })).toBe('CNIB manquante');
  });

  it('détermine les actions possibles selon le statut', () => {
    expect(kycActions({ status: 'PENDING', kycComplete: true })).toMatchObject({
      canApprove: true,
      approveDisabledReason: null,
      canReject: true,
      canSuspend: false,
    });
    expect(kycActions({ status: 'PENDING', kycComplete: false }).approveDisabledReason).toMatch(/incomplet/);
    expect(kycActions({ status: 'APPROVED', kycComplete: true })).toMatchObject({ canApprove: false, canSuspend: true });
    expect(kycActions({ status: 'SUSPENDED', kycComplete: true }).canReinstate).toBe(true);
    expect(kycActions({ status: 'REJECTED', kycComplete: true })).toMatchObject({ canApprove: true, canReject: false });
  });
});

describe('règles de la console', () => {
  it('bloque les candidats hors ligne, occupés ou au plafond', () => {
    const base = { id: 'x', name: 'X', phone: '+22670000000', vehicleType: 'MOTO' as const, isOnline: true, distanceKm: 1.2 };
    expect(candidateBlocker({ ...base, isBusy: false, cashBlocked: false })).toBeNull();
    // 409 DRIVER_OFFLINE côté API : un livreur hors ligne ne peut pas être affecté.
    expect(candidateBlocker({ ...base, isOnline: false, distanceKm: null, isBusy: false, cashBlocked: false })).toMatch(/Hors ligne/);
    expect(candidateBlocker({ ...base, isBusy: true, cashBlocked: false })).toBe('Déjà en course');
    expect(candidateBlocker({ ...base, isBusy: false, cashBlocked: true })).toBe('Plafond de cash atteint');
  });

  it("fait avancer le compteur d'attente localement", () => {
    expect(currentWaitingSeconds(pendingOrder, 1_000_000, 1_010_500)).toBe(382);
  });

  it('valide les versements', () => {
    expect(validateDeposit('30000', 38500)).toBeNull();
    expect(validateDeposit('40000', 38500)).toMatch(/dépasse/);
    expect(validateDeposit('0', 38500)).toMatch(/supérieur à 0/);
    expect(validateDeposit('12.5', 38500)).toMatch(/entier/);
    expect(validateDeposit('', 38500)).not.toBeNull();
  });

  it('valide une grille tarifaire et calcule l’aperçu', () => {
    const rule = {
      vehicleType: 'MOTO' as const,
      baseFare: 700,
      perKm: 200,
      minimumFare: 1500,
      commissionPercent: 20,
      isActive: true,
      updatedAt: '2026-11-06T10:00:00.000Z',
    };
    const parsed = parseDraft(draftFromRule(rule));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      // 700 + 200 × 6 = 1900 -> arrondi 1900 ; commission 20 % = 380 -> livreur 1520
      expect(previewLine('MOTO', parsed.value, 6).replace(/\u202f/g, ' ')).toBe('6 km en moto = 1 900 FCFA (livreur 1 520 FCFA)');
      // minimum appliqué
      expect(previewLine('MOTO', parsed.value, 2).replace(/\u202f/g, ' ')).toBe('2 km en moto = 1 500 FCFA (livreur 1 200 FCFA)');
    }
    const bad = parseDraft({ ...draftFromRule(rule), perKm: 'abc', commissionPercent: '150' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(Object.keys(bad.errors).sort()).toEqual(['commissionPercent', 'perKm']);
    }
  });

  it('traduit le filtre de statut des courses', () => {
    expect(statusFilterToList('')).toBeUndefined();
    expect(statusFilterToList('ACTIVE')).toContain('PICKED_UP');
    expect(statusFilterToList('ACTIVE')).not.toContain('DELIVERED');
    expect(statusFilterToList('SEARCHING_DRIVER,FOO')).toEqual(['SEARCHING_DRIVER']);
  });

  it('traduit les actions du journal d’audit', () => {
    expect(auditActionLabel('DRIVER_DOCUMENT_VIEWED')).toBe('Consultation d’une pièce livreur');
    expect(auditActionLabel('INCONNU')).toBe('INCONNU');
  });
});
