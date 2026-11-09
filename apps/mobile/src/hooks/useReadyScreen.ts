import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import type { DriverProfileDto } from '@yaar/shared';
import { markReadyScreenShown, readyScreenShownThisSession, shouldShowReadyScreen } from '../lib/readyScreen';
import { loadDriverReadyDismissed } from '../lib/storage';

/**
 * Ouvre une fois l'écran « Vous êtes prêt ! » (/driver/ready) depuis l'accueil du livreur quand son dossier est
 * validé, qu'il n'est jamais passé en ligne (aucun consentement, et jamais vu avec un consentement sur cet appareil)
 * et qu'il ne l'a pas écarté sur cet appareil. `active` : l'accueil est à l'écran (onglet affiché, aucun écran
 * par-dessus).
 */
export function useReadyScreenGate(profile: DriverProfileDto | null | undefined, active: boolean): void {
  const userId = profile?.userId ?? null;
  const candidate = !!profile && shouldShowReadyScreen(profile, false);
  const [dismissed, setDismissed] = useState<{ userId: string; value: boolean } | null>(null);

  useEffect(() => {
    if (!candidate || !userId) return;
    let cancelled = false;
    void loadDriverReadyDismissed(userId).then((value) => {
      if (!cancelled) setDismissed({ userId, value });
    });
    return () => {
      cancelled = true;
    };
  }, [candidate, userId]);

  const known = dismissed && dismissed.userId === userId ? dismissed.value : null;
  useEffect(() => {
    if (!active || !candidate || !userId || known === null || known) return;
    if (readyScreenShownThisSession(userId)) return;
    markReadyScreenShown(userId);
    router.push('/driver/ready');
  }, [active, candidate, userId, known]);
}
