import type { StoreDto } from '@yaar/shared';

export interface StoreApprovalNotice {
  tone: 'orange' | 'red';
  title: string;
  message: string;
}

/**
 * Bandeau de validation de la boutique (docs/API.md §5 et §8.5) : une nouvelle boutique est PENDING et
 * invisible des clients jusqu'à sa validation par la console ; une boutique SUSPENDED est fermée et masquée.
 * Renvoie null pour une boutique validée (ou si l'API ne transmet pas le statut).
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
        title: '⏳ Boutique en attente de validation',
        message:
          'Yaar vérifie votre boutique (généralement sous 24 h). Elle n’est pas encore visible des clients : préparez votre menu en attendant.' +
          (note ? ` Remarque de Yaar : ${note}` : ''),
      };
    case 'SUSPENDED':
      return {
        tone: 'red',
        title: '⛔ Boutique suspendue par Yaar',
        message:
          'Votre boutique est fermée et n’apparaît plus aux clients. Les commandes déjà en cours continuent.' +
          (note ? ` Motif : ${note}.` : '') +
          ' Contactez le support Yaar pour la réactiver.',
      };
    default:
      return null;
  }
}

/** Seule une boutique validée peut être ouverte aux commandes. */
export function canOpenStore(store: Pick<StoreDto, 'approvalStatus'>): boolean {
  return store.approvalStatus === undefined || store.approvalStatus === 'APPROVED';
}

/** « 12 % » ou « taux standard » quand l'API ne transmet pas de taux spécifique. */
export function formatCommission(percent: number | null | undefined): string {
  return percent === null || percent === undefined ? 'taux standard Yaar' : `${String(percent).replace('.', ',')} %`;
}
