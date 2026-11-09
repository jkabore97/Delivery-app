import type { DriverProfileDto } from '@yaar/shared';
import { chipText, documentChips } from '../lib/kyc';
import { Icon } from './Icon';

/**
 * Pastilles des pièces d'un dossier : fournie (menthe, coche dessinée, nom court lisible seul), expirée (corail) ou
 * manquante (grise). Le texte complet (« CNIB fournie ») reste lu par les lecteurs d'écran.
 */
export function DocumentChips({ profile }: { profile: Pick<DriverProfileDto, 'requiredDocuments' | 'documents'> }) {
  return (
    <ul className="chips" aria-label="Pièces du dossier">
      {documentChips(profile).map((chip) => (
        <li key={chip.type} className={`chip chip-${chip.state}`} data-state={chip.state} title={chipText(chip)}>
          {chip.state === 'ok' && <Icon name="check" size={14} strokeWidth={2.6} />}
          {chip.state === 'ok' ? chip.label : chipText(chip)}
          {chip.state === 'ok' && <span className="sr-only">{chipText(chip).slice(chip.label.length)}</span>}
        </li>
      ))}
    </ul>
  );
}
