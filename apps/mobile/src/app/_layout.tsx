import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../state/auth';
import { SocketProvider } from '../state/socket';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SocketProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
        </SocketProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
