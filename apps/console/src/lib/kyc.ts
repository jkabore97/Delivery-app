import { LABELS, type DocumentType, type DriverProfileDto } from '@yaar/shared';

export type DocChipState = 'ok' | 'expired' | 'missing';

export interface DocChip {
  type: DocumentType;
  label: string;
  state: DocChipState;
  documentId: string | null;
}

/** Libellés courts des pièces pour les pastilles. */
const SHORT_LABEL: Record<DocumentType, string> = {
  CNIB: 'CNIB',
  PERMIS: 'Permis',
  CARTE_GRISE: 'Carte grise',
  ASSURANCE: 'Assurance',
  SELFIE: 'Selfie',
};

/** Accord des adjectifs (« CNIB fournie », « Permis fourni ») : la carte, le permis, la carte grise, l'assurance, le selfie. */
const FEMININE: ReadonlySet<DocumentType> = new Set<DocumentType>(['CNIB', 'CARTE_GRISE', 'ASSURANCE']);

/** Une pastille par pièce exigée : fournie, expirée ou manquante. */
export function documentChips(profile: Pick<DriverProfileDto, 'requiredDocuments' | 'documents'>): DocChip[] {
  return profile.requiredDocuments.map((type) => {
    const doc = profile.documents.find((d) => d.type === type);
    const state: DocChipState = !doc ? 'missing' : doc.isExpired ? 'expired' : 'ok';
    return { type, label: SHORT_LABEL[type], state, documentId: doc?.id ?? null };
  });
}

/** Phrase complète d'une pastille (« CNIB fournie », « Assurance expirée », « Selfie manquant »). */
export function chipText(chip: DocChip): string {
  const e = FEMININE.has(chip.type) ? 'e' : '';
  if (chip.state === 'ok') return `${chip.label} fourni${e}`;
  if (chip.state === 'expired') return `${chip.label} expiré${e}`;
  return `${chip.label} manquant${e}`;
}

export function documentLabel(type: DocumentType): string {
  return LABELS.documentType[type];
}

/** Actions de décision possibles selon le statut (docs/API.md §8.3). */
export function kycActions(profile: Pick<DriverProfileDto, 'status' | 'kycComplete'>): {
  canApprove: boolean;
  approveDisabledReason: string | null;
  canReject: boolean;
  canSuspend: boolean;
  canReinstate: boolean;
} {
  const approvable = profile.status === 'PENDING' || profile.status === 'REJECTED';
  return {
    canApprove: approvable,
    approveDisabledReason: approvable && !profile.kycComplete ? 'Dossier incomplet : pièce manquante ou expirée' : null,
    canReject: profile.status === 'PENDING',
    canSuspend: profile.status === 'APPROVED',
    canReinstate: profile.status === 'SUSPENDED',
  };
}
