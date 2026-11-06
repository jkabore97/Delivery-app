import { Stack } from 'expo-router';
import { RoleGuard } from '../../components/RoleGuard';
import { SellerProvider } from '../../state/seller';
import { colors } from '../../theme';

export default function SellerLayout() {
  return (
    <RoleGuard role="SELLER">
      <SellerProvider>
        <Stack
          screenOptions={{
            headerTintColor: colors.orange,
            headerTitleStyle: { color: colors.text },
            headerBackButtonDisplayMode: 'minimal',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="product" options={{ title: 'Produit' }} />
          <Stack.Screen name="profile" options={{ title: 'Mon compte', headerShown: false }} />
        </Stack>
      </SellerProvider>
    </RoleGuard>
  );
}
