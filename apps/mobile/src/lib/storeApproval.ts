import type { StoreDto } from '@yaar/shared';

export interface StoreApprovalNotice {
  tone: 'orange' | 'red';
  title: string;
  message: string;
}

/**
 * Bandeau de validation du profil d'entreprise (docs/API.md §5 et §8.5) : un nouveau profil est PENDING
 * jusqu'à sa validation par la console ; les demandes de livraison sont possibles une fois validé. SUSPENDED :
 * plus de nouvelle demande. Renvoie null pour un profil validé (ou si l'API ne transmet pas le statut).
 */
export function storeApprovalNotice(
  store: Pick<StoreDto, 'approvalStatus' | 'approvalNote'> | null | undefined,
): StoreApprovalNotice | null {
  if (!store) return null;
  const note = store.approvalNote?.trim();
  switch (store.approvalStatus) {
    case 'PENDING':
      return {
        tone: 'orange',
        title: 'Entreprise en attente de validation',
        message:
          'Yaar vérifie votre entreprise (généralement sous 24 h). Vous pourrez demander des livraisons dès sa validation.' +
          (note ? ` Remarque de Yaar : ${note}` : ''),
      };
    case 'SUSPENDED':
      return {
        tone: 'red',
        title: 'Entreprise suspendue par Yaar',
        message:
          'Vous ne pouvez plus demander de nouvelles livraisons. Les livraisons déjà en cours continuent.' +
          (note ? ` Motif : ${note}.` : '') +
          ' Contactez le support Yaar pour la réactiver.',
      };
    default:
      return null;
  }
}

/**
 * Que faire d'un appui sur « Nouvelle » (onglet de l'entreprise) : `open` ouvre le parcours (entreprise validée, ou
 * profil encore en chargement : le parcours affiche son propre état) ; `profile` : pas encore d'entreprise, son profil
 * est à créer ; `notice` : entreprise en attente de validation ou suspendue, le bandeau est montré à la place.
 */
export type NewDeliveryAccess = { kind: 'open' } | { kind: 'profile' } | { kind: 'notice'; notice: StoreApprovalNotice };

export function newDeliveryAccess(
  stores: readonly unknown[] | undefined,
  store: Pick<StoreDto, 'approvalStatus' | 'approvalNote'> | null | undefined,
): NewDeliveryAccess {
  if (stores === undefined) return { kind: 'open' };
  if (!store) return { kind: 'profile' };
  const notice = storeApprovalNotice(store);
  return notice ? { kind: 'notice', notice } : { kind: 'open' };
}

/** Seule une boutique validée peut être ouverte aux commandes. */
export function canOpenStore(store: Pick<StoreDto, 'approvalStatus'>): boolean {
  return store.approvalStatus === undefined || store.approvalStatus === 'APPROVED';
}

/** « 12 % » ou « taux standard » quand l'API ne transmet pas de taux spécifique. */
export function formatCommission(percent: number | null | undefined): string {
  return percent === null || percent === undefined ? 'taux standard Yaar' : `${String(percent).replace('.', ',')} %`;
}
