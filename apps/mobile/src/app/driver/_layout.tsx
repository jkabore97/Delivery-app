import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { OfferModal } from '../../components/OfferModal';
import { RoleGuard } from '../../components/RoleGuard';
import { TrackingConsentModal } from '../../components/TrackingConsentModal';
import { DriverProvider } from '../../state/driver';
import { palette } from '../../theme';
import { hideWebSplash } from '../../lib/webShell';

/**
 * Espace livreur (Cobalt) : chaque écran dessine sa propre barre du haut (bouton retour en disque blanc, titre 20/800)
 * sur le fond canvas ; la pile n'affiche aucun en-tête. L'offre plein écran et la fenêtre de consentement au suivi GPS
 * sont posées par-dessus tous les écrans.
 */
export default function DriverLayout() {
  useEffect(() => hideWebSplash(), []);
  return (
    <RoleGuard role="DRIVER">
      <DriverProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.canvas } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" options={{ title: 'Devenir livreur' }} />
          <Stack.Screen name="ready" options={{ title: 'Vous êtes prêt !', animation: 'fade' }} />
          <Stack.Screen name="order" options={{ title: 'Course en cours' }} />
          <Stack.Screen name="deliver" options={{ title: 'Confirmer la livraison' }} />
          <Stack.Screen name="history" options={{ title: 'Mes courses' }} />
        </Stack>
        <OfferModal />
        <TrackingConsentModal />
      </DriverProvider>
    </RoleGuard>
  );
}
