import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { RoleGuard } from '../../components/RoleGuard';
import { BusinessFrame } from '../../components/business/desktop/Shell';
import { useIsDesktop } from '../../components/business/desktop/layout';
import { BusinessSummaryProvider } from '../../components/business/summary';
import { BusinessProvider } from '../../state/business';
import { typeface } from '../../fonts';
import { palette } from '../../theme';
import { hideWebSplash } from '../../lib/webShell';

/**
 * Espace Entreprise (rôle SELLER de l'API) : livraisons en cours, nouvelle demande, historique, profil. Téléphone :
 * onglets et écrans pleins. Ordinateur (fenêtre de 1 024 px et plus) : barre latérale Cobalt et tableau de bord, chaque
 * écran dans sa mise en page large (components/business/desktop).
 */
export default function BusinessLayout() {
  useEffect(() => hideWebSplash(), []);
  const desktop = useIsDesktop();
  return (
    <RoleGuard role="SELLER">
      <BusinessProvider>
        <BusinessSummaryProvider>
          <BusinessFrame desktop={desktop}>
            <Stack
              screenOptions={{
                headerTintColor: palette.cobalt,
                headerTitleStyle: { color: palette.ink, fontWeight: '700', ...typeface(700) },
                headerStyle: { backgroundColor: palette.canvas },
                headerShadowVisible: false,
                contentStyle: { backgroundColor: palette.canvas },
                headerBackButtonDisplayMode: 'minimal',
                // Ordinateur : les écrans changent sur place (pas de glissement d'une page entière).
                ...(desktop ? { animation: 'none' as const } : null),
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="nouvelle" options={{ headerShown: false, title: 'Nouvelle livraison' }} />
              <Stack.Screen name="livraison/[id]" options={{ headerShown: false, title: 'Suivi de la livraison' }} />
            </Stack>
          </BusinessFrame>
        </BusinessSummaryProvider>
      </BusinessProvider>
    </RoleGuard>
  );
}
