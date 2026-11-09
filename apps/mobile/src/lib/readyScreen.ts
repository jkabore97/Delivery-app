import type { DriverProfileDto } from '@yaar/shared';

/**
 * Écran « Vous êtes prêt ! » : montré au livreur dont le dossier vient d'être validé et qui n'est encore jamais
 * passé en ligne (aucun consentement au suivi GPS). `dismissed` (mémorisé par utilisateur sur l'appareil) : écran
 * écarté avec « Plus tard », ou livreur déjà vu avec son consentement (state/driver) ; un livreur expérimenté qui
 * retire son consentement ne le revoit donc pas.
 */
export function shouldShowReadyScreen(
  profile: Pick<DriverProfileDto, 'status' | 'trackingConsentAt'> | null | undefined,
  dismissed: boolean,
): boolean {
  return !!profile && profile.status === 'APPROVED' && !profile.trackingConsentAt && !dismissed;
}

/**
 * Livreurs à qui l'écran a déjà été montré pendant cette session (retour arrière sans choisir : il ne s'ouvre pas
 * une seconde fois avant le prochain lancement).
 */
const shownThisSession = new Set<string>();

export function readyScreenShownThisSession(userId: string): boolean {
  return shownThisSession.has(userId);
}

export function markReadyScreenShown(userId: string): void {
  shownThisSession.add(userId);
}

/** Tests uniquement. */
export function resetReadyScreenSession(): void {
  shownThisSession.clear();
}
