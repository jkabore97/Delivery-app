import type { DriverProfileDto } from '@yaar/shared';
import { chipText, documentChips } from '../lib/kyc';

const TONE = { ok: 'green', expired: 'orange', missing: 'grey' } as const;

export function DocumentChips({ profile }: { profile: Pick<DriverProfileDto, 'requiredDocuments' | 'documents'> }) {
  return (
    <ul className="chips" aria-label="Pièces du dossier">
      {documentChips(profile).map((chip) => (
        <li key={chip.type} className={`chip chip-${TONE[chip.state]}`} data-state={chip.state}>
          {chipText(chip)}
        </li>
      ))}
    </ul>
  );
}
