import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { OfferModal } from '../../components/OfferModal';
import { RoleGuard } from '../../components/RoleGuard';
import { TrackingConsentModal } from '../../components/TrackingConsentModal';
import { DriverProvider } from '../../state/driver';
import { typeface } from '../../fonts';
import { palette } from '../../theme';
import { hideWebSplash } from '../../lib/webShell';

/** En-tête Cobalt sur fond canvas (écrans du livreur qui gardent la barre de navigation). Nom d'origine gardé. */
function darkHeader() {
  return {
    headerStyle: { backgroundColor: palette.canvas },
    headerTintColor: palette.ink,
    headerTitleStyle: { color: palette.ink, fontWeight: '800' as const, ...typeface(800) },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: palette.canvas },
  };
}

export default function DriverLayout() {
  useEffect(() => hideWebSplash(), []);
  return (
    <RoleGuard role="DRIVER">
      <DriverProvider>
        <Stack
          screenOptions={{
            headerTintColor: palette.cobalt,
            headerTitleStyle: { color: palette.ink, fontWeight: '700', ...typeface(700) },
            headerStyle: { backgroundColor: palette.canvas },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: palette.canvas },
            headerBackButtonDisplayMode: 'minimal',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ title: 'Devenir livreur' }} />
          <Stack.Screen name="ready" options={{ title: 'Vous êtes prêt !', headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="order" options={{ title: 'Course en cours', headerShown: false }} />
          <Stack.Screen name="deliver" options={{ title: 'Confirmer la livraison', headerShown: false }} />
          <Stack.Screen name="history" options={{ title: 'Mes courses', ...darkHeader() }} />
        </Stack>
        <OfferModal />
        <TrackingConsentModal />
      </DriverProvider>
    </RoleGuard>
  );
}
