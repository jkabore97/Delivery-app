import { useEffect, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FONT_LOAD_TIMEOUT_MS, FONT_PUBLIC_TIMEOUT_MS, useAppFonts } from '../fonts';
import { AuthProvider } from '../state/auth';
import { AppConfigProvider } from '../state/config';
import { SocketProvider } from '../state/socket';
import { hideWebSplash, isFullWidthPath, isSlowConnection, isWideAppPath } from '../lib/webShell';
import { alpha, MAX_APP_WIDTH, palette } from '../theme';

/**
 * Web : l'application tient dans une colonne « téléphone » centrée, sauf la page publique de suivi (carte à gauche et
 * feuille à droite sur ordinateur) et l'espace entreprise sur ordinateur (≥ 1024 px : barre latérale et tableau de
 * bord), qui prennent toute la fenêtre.
 */
function WebPhoneFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  if (Platform.OS !== 'web') return <>{children}</>;
  const full = isFullWidthPath(pathname) || isWideAppPath(pathname, width);
  return (
    <View style={styles.webBackdrop}>
      <View style={[styles.webPhone, full && styles.webFull]}>{children}</View>
    </View>
  );
}

export default function RootLayout() {
  const pathname = usePathname();
  // Page publique de suivi ouverte sur une connexion très lente : police du système tout de suite (le suivi d'abord,
  // pas ≈ 170 ko de polices en plus). Décidé une fois, à l'ouverture.
  const [publicPage] = useState(() => Platform.OS === 'web' && isFullWidthPath(pathname));
  const [skipFonts] = useState(() => publicPage && isSlowConnection());
  // Polices de l'application (src/fonts.ts) : l'écran de démarrage (web : celui du HTML) reste affiché jusqu'à leur
  // chargement, 2,5 s au plus (puis police du système) ; page publique de suivi : 0,2 s au plus (le suivi d'abord, les
  // polices remplacent celle du système à leur arrivée).
  const fontsReady = useAppFonts({ skip: skipFonts, timeoutMs: publicPage ? FONT_PUBLIC_TIMEOUT_MS : FONT_LOAD_TIMEOUT_MS });
  // Filet de sécurité : l'écran de démarrage du HTML (web) disparaît même si un écran oublie de le retirer.
  useEffect(() => {
    const t = setTimeout(hideWebSplash, 6000);
    return () => clearTimeout(t);
  }, []);
  if (!fontsReady) return Platform.OS === 'web' ? null : <View style={styles.boot} />;
  return (
    <WebPhoneFrame>
      <SafeAreaProvider>
        {/* GET /config d'abord : mode temps réel (socket / poll) et mode démo. */}
        <AppConfigProvider>
          <AuthProvider>
            <SocketProvider>
              <StatusBar style="dark" />
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.canvas } }} />
            </SocketProvider>
          </AuthProvider>
        </AppConfigProvider>
      </SafeAreaProvider>
    </WebPhoneFrame>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, backgroundColor: palette.canvas },
  webBackdrop: { flex: 1, alignItems: 'center', backgroundColor: palette.backdrop },
  webPhone: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_APP_WIDTH,
    backgroundColor: palette.canvas,
    overflow: 'hidden',
    boxShadow: `0 0 0 1px ${alpha(palette.ink, 0.04)}, 0 24px 64px ${alpha(palette.ink, 0.14)}`,
  },
  webFull: { maxWidth: '100%', boxShadow: 'none' },
});
