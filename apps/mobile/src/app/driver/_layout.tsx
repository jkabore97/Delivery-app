import { Stack } from 'expo-router';
import { OfferModal } from '../../components/OfferModal';
import { RoleGuard } from '../../components/RoleGuard';
import { DriverProvider } from '../../state/driver';
import { colors } from '../../theme';

export default function DriverLayout() {
  return (
    <RoleGuard role="DRIVER">
      <DriverProvider>
        <Stack
          screenOptions={{
            headerTintColor: colors.blue,
            headerTitleStyle: { color: colors.text },
            headerBackButtonDisplayMode: 'minimal',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ title: 'Devenir livreur' }} />
          <Stack.Screen name="order" options={{ title: 'Course en cours' }} />
          <Stack.Screen name="deliver" options={{ title: 'Confirmer la livraison' }} />
          <Stack.Screen name="history" options={{ title: 'Mes courses' }} />
        </Stack>
        <OfferModal />
      </DriverProvider>
    </RoleGuard>
  );
}
