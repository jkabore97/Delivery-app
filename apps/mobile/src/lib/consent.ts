import type { DriverProfileDto } from '@yaar/shared';
import { formatDateTime } from './format';

/**
 * Consentement éclairé au suivi GPS du livreur (docs/API.md §7.2, brief §2 / Annexe 3).
 * Le texte est affiché avant le premier passage en ligne ; le consentement peut être retiré
 * depuis le profil (DELETE /driver/consent, ce qui remet le livreur hors ligne).
 */
export const TRACKING_CONSENT_TITLE = 'Suivi de votre position';

export const TRACKING_CONSENT_INTRO =
  'Pour vous proposer des courses et permettre leur suivi, Yaar a besoin de votre position GPS. Avant de passer en ligne, lisez comment elle est utilisée :';

export const TRACKING_CONSENT_POINTS: readonly string[] = [
  'Votre position est collectée uniquement lorsque vous êtes « En ligne » ou pendant une course. Hors ligne, aucune position n’est collectée et la dernière est effacée.',
  'Elle sert à vous attribuer les courses proches et à suivre les livraisons.',
  'Elle est partagée avec le client uniquement pendant sa livraison, et avec les contrôleurs Yaar (sécurité, SOS, litiges).',
  'Les positions sont conservées 12 mois, puis supprimées.',
  'Vous pouvez retirer votre consentement à tout moment (Profil › Suivi GPS) : vous passerez alors hors ligne et ne recevrez plus de courses.',
];

export const TRACKING_CONSENT_ACCEPT = 'J’accepte le suivi de ma position';

/** true si le livreur a déjà donné son consentement (date enregistrée par l'API). */
export function hasTrackingConsent(profile: Pick<DriverProfileDto, 'trackingConsentAt'> | null | undefined): boolean {
  return !!profile?.trackingConsentAt;
}

/** « Accepté le 06/11/2026 14:05 » ou « Non accepté ». */
export function trackingConsentStatus(profile: Pick<DriverProfileDto, 'trackingConsentAt'> | null | undefined): string {
  return profile?.trackingConsentAt ? `Accepté le ${formatDateTime(profile.trackingConsentAt)}` : 'Non accepté';
}
