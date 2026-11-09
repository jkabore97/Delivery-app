import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { OfferModal } from '../../components/OfferModal';
import { RoleGuard } from '../../components/RoleGuard';
import { TrackingConsentModal } from '../../components/TrackingConsentModal';
import { DriverProvider } from '../../state/driver';
import { colors, dark } from '../../theme';
import { hideWebSplash } from '../../lib/webShell';

/** En-tête sombre (écrans sombres du livreur qui gardent la barre de navigation). */
const DARK_HEADER = {
  headerStyle: { backgroundColor: dark.background },
  headerTintColor: dark.text,
  headerTitleStyle: { color: dark.text, fontWeight: '900' as const },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: dark.background },
};

export default function DriverLayout() {
  useEffect(() => hideWebSplash(), []);
  return (
    <RoleGuard role="DRIVER">
      <DriverProvider>
        <Stack
          screenOptions={{
            headerTintColor: colors.green,
            headerTitleStyle: { color: colors.text },
            headerBackButtonDisplayMode: 'minimal',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ title: 'Devenir livreur' }} />
          <Stack.Screen name="ready" options={{ title: 'Vous êtes prêt !', headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="order" options={{ title: 'Course en cours', headerShown: false }} />
          <Stack.Screen name="deliver" options={{ title: 'Confirmer la livraison', headerShown: false }} />
          <Stack.Screen name="history" options={{ title: 'Mes courses', ...DARK_HEADER }} />
        </Stack>
        <OfferModal />
        <TrackingConsentModal />
      </DriverProvider>
    </RoleGuard>
  );
}
