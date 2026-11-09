import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { RoleGuard } from '../../components/RoleGuard';
import { BusinessProvider } from '../../state/business';
import { typeface } from '../../fonts';
import { palette } from '../../theme';
import { hideWebSplash } from '../../lib/webShell';

/** Espace Entreprise (rôle SELLER de l'API) : livraisons en cours, nouvelle demande, historique, profil. */
export default function BusinessLayout() {
  useEffect(() => hideWebSplash(), []);
  return (
    <RoleGuard role="SELLER">
      <BusinessProvider>
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
          <Stack.Screen name="nouvelle" options={{ headerShown: false, title: 'Nouvelle livraison' }} />
          <Stack.Screen name="livraison/[id]" options={{ headerShown: false, title: 'Suivi de la livraison' }} />
        </Stack>
      </BusinessProvider>
    </RoleGuard>
  );
}
