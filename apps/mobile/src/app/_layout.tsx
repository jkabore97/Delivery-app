import { useEffect, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../state/auth';
import { AppConfigProvider } from '../state/config';
import { SocketProvider } from '../state/socket';
import { hideWebSplash, isFullWidthPath } from '../lib/webShell';
import { MAX_APP_WIDTH } from '../theme';

/**
 * Web : l'application tient dans une colonne « téléphone » centrée, sauf la page publique de suivi qui prend toute
 * la fenêtre (carte à gauche et feuille à droite sur ordinateur).
 */
function WebPhoneFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (Platform.OS !== 'web') return <>{children}</>;
  const full = isFullWidthPath(pathname);
  return (
    <View style={styles.webBackdrop}>
      <View style={[styles.webPhone, full && styles.webFull]}>{children}</View>
    </View>
  );
}

export default function RootLayout() {
  // Filet de sécurité : l'écran de démarrage du HTML (web) disparaît même si un écran oublie de le retirer.
  useEffect(() => {
    const t = setTimeout(hideWebSplash, 6000);
    return () => clearTimeout(t);
  }, []);
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
  webFull: { maxWidth: '100%', boxShadow: 'none' },
});
