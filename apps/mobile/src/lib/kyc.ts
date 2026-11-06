import {
  DOCUMENTS_WITH_EXPIRY,
  LABELS,
  requiredDocuments,
  type DocumentType,
  type DriverProfileDto,
  type VehicleType,
} from '@yaar/shared';

export type DocumentState = 'missing' | 'expired' | 'ok';

export interface DocumentChecklistItem {
  type: DocumentType;
  label: string;
  state: DocumentState;
  needsExpiry: boolean;
  expiresAt: string | null;
}

/** Liste des pièces exigées pour le véhicule, avec leur état (manquante / expirée / ok). */
export function documentChecklist(
  vehicleType: VehicleType,
  documents: DriverProfileDto['documents'],
): DocumentChecklistItem[] {
  return requiredDocuments(vehicleType).map((type) => {
    const doc = documents.find((d) => d.type === type);
    const state: DocumentState = !doc ? 'missing' : doc.isExpired ? 'expired' : 'ok';
    return {
      type,
      label: LABELS.documentType[type],
      state,
      needsExpiry: DOCUMENTS_WITH_EXPIRY.includes(type),
      expiresAt: doc?.expiresAt ?? null,
    };
  });
}

export function kycProgress(items: DocumentChecklistItem[]): { done: number; total: number } {
  return { done: items.filter((i) => i.state === 'ok').length, total: items.length };
}

/** Valide une date saisie « AAAA-MM-JJ » (ou « JJ/MM/AAAA ») et la renvoie au format ISO court, sinon null. */
export function parseExpiryDate(input: string, now: Date = new Date()): string | null {
  const s = input.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (match) {
    y = Number(match[1]);
    m = Number(match[2]);
    d = Number(match[3]);
  } else {
    match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (!match) return null;
    d = Number(match[1]);
    m = Number(match[2]);
    y = Number(match[3]);
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  // Une assurance déjà expirée est refusée côté client.
  if (date.getTime() < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
