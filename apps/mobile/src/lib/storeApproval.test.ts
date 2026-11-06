import { canOpenStore, formatCommission, storeApprovalNotice } from './storeApproval';

describe('storeApprovalNotice', () => {
  it('PENDING : bandeau orange, boutique invisible des clients', () => {
    const n = storeApprovalNotice({ approvalStatus: 'PENDING', approvalNote: null });
    expect(n?.tone).toBe('orange');
    expect(n?.title).toMatch(/en attente de validation/);
    expect(n?.message).toMatch(/pas encore visible des clients/);
  });

  it('SUSPENDED : bandeau rouge avec le motif', () => {
    const n = storeApprovalNotice({ approvalStatus: 'SUSPENDED', approvalNote: 'Hygiène' });
    expect(n?.tone).toBe('red');
    expect(n?.message).toMatch(/Motif : Hygiène\./);
  });

  it('APPROVED ou statut absent : aucun bandeau', () => {
    expect(storeApprovalNotice({ approvalStatus: 'APPROVED', approvalNote: null })).toBeNull();
    expect(storeApprovalNotice({})).toBeNull();
    expect(storeApprovalNotice(null)).toBeNull();
  });

  it('ouverture réservée aux boutiques validées ; commission éventuellement nulle', () => {
    expect(canOpenStore({ approvalStatus: 'APPROVED' })).toBe(true);
    expect(canOpenStore({ approvalStatus: 'PENDING' })).toBe(false);
    expect(canOpenStore({ approvalStatus: 'SUSPENDED' })).toBe(false);
    expect(formatCommission(12)).toBe('12 %');
    expect(formatCommission(null)).toBe('taux standard Yaar');
  });
});
