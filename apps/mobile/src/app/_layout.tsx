import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../state/auth';
import { AppConfigProvider } from '../state/config';
import { SocketProvider } from '../state/socket';
import { MAX_APP_WIDTH } from '../theme';


function WebPhoneFrame({ children }: { children: ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return (
    <View style={styles.webBackdrop}>
      <View style={styles.webPhone}>{children}</View>
    </View>
  );
}

export default function RootLayout() {
  return (
    <WebPhoneFrame>
      <SafeAreaProvider>
        {/* GET /config d'abord : mode temps réel (socket / poll) et mode démo. */}
        <AppConfigProvider>
          <AuthProvider>
            <SocketProvider>
              <StatusBar style="dark" />
              <Stack screenOptions={{ headerShown: false }} />
            </SocketProvider>
          </AuthProvider>
        </AppConfigProvider>
      </SafeAreaProvider>
    </WebPhoneFrame>
  );
}

const styles = StyleSheet.create({
  webBackdrop: { flex: 1, alignItems: 'center', backgroundColor: '#DDE3E8' },
  webPhone: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_APP_WIDTH,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    boxShadow: '0 0 24px rgba(15, 46, 34, 0.18)',
  },
});
