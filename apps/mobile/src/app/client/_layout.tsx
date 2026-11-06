import { Stack } from 'expo-router';
import { RoleGuard } from '../../components/RoleGuard';
import { ClientOrderProvider } from '../../state/cart';
import { colors } from '../../theme';

export default function ClientLayout() {
  return (
    <RoleGuard role="CLIENT">
      <ClientOrderProvider>
        <Stack
          screenOptions={{
            headerTintColor: colors.green,
            headerTitleStyle: { color: colors.text },
            headerBackButtonDisplayMode: 'minimal',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="store/[id]" options={{ title: 'Menu' }} />
          <Stack.Screen name="checkout" options={{ title: 'Ma commande' }} />
          <Stack.Screen name="parcel" options={{ title: 'Envoyer un colis' }} />
          <Stack.Screen name="order/[id]" options={{ title: 'Suivi de commande' }} />
          <Stack.Screen name="addresses" options={{ title: 'Mes adresses' }} />
        </Stack>
      </ClientOrderProvider>
    </RoleGuard>
  );
}
