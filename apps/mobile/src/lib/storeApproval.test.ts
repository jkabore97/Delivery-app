import { canOpenStore, formatCommission, newDeliveryAccess, storeApprovalNotice } from './storeApproval';

describe('storeApprovalNotice', () => {
  it('PENDING : bandeau orange, demandes de livraison après validation', () => {
    const n = storeApprovalNotice({ approvalStatus: 'PENDING', approvalNote: null });
    expect(n?.tone).toBe('orange');
    expect(n?.title).toBe('Entreprise en attente de validation');
    expect(n?.message).toMatch(/demander des livraisons dès sa validation/);
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

describe('onglet « Nouvelle » de l’entreprise', () => {
  it('ouvert seulement pour une entreprise validée ; sinon le bandeau, ou le profil à créer', () => {
    const approved = { approvalStatus: 'APPROVED' as const, approvalNote: null };
    expect(newDeliveryAccess([approved], approved)).toEqual({ kind: 'open' });
    // Profil encore en chargement : le parcours affiche son propre état d'attente.
    expect(newDeliveryAccess(undefined, null)).toEqual({ kind: 'open' });
    expect(newDeliveryAccess([], null)).toEqual({ kind: 'profile' });
    const pending = newDeliveryAccess([{}], { approvalStatus: 'PENDING', approvalNote: null });
    expect(pending.kind === 'notice' && pending.notice.title).toBe('Entreprise en attente de validation');
    const suspended = newDeliveryAccess([{}], { approvalStatus: 'SUSPENDED', approvalNote: null });
    expect(suspended.kind === 'notice' && suspended.notice.title).toBe('Entreprise suspendue par Yaar');
  });

  it('titres sans émoji (le bandeau les accompagne d’un pictogramme du système de design)', () => {
    for (const status of ['PENDING', 'SUSPENDED'] as const) {
      const n = storeApprovalNotice({ approvalStatus: status, approvalNote: null })!;
      expect(n.title).toMatch(/^[\p{L} ]+$/u);
    }
  });
});
