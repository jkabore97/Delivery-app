import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Text } from '../components/Text';
import { Wordmark } from '../components/driver/Wordmark';
import { homePathForRole } from '../lib/roles';
import { hideWebSplash } from '../lib/webShell';
import { useAuth } from '../state/auth';
import { palette, spacing } from '../theme';

/**
 * Aiguillage : connexion, puis espace selon le rôle (Entreprise, Livreur). Un compte sans espace (ancien
 * compte client, console) revient à la connexion, qui explique pourquoi. Pendant la lecture de la session : l'écran de
 * démarrage Cobalt (mot-symbole, indicateur cobalt), dans la continuité de celui du HTML sur le web.
 */
export default function Index() {
  const { status, user } = useAuth();
  useEffect(() => hideWebSplash(), []);
  if (status === 'loading') {
    return (
      <View style={styles.boot} accessibilityRole="progressbar" accessibilityLabel="Chargement" testID="boot-screen">
        <Wordmark size={46} />
        <Text style={styles.sub}>Livraison · Ouagadougou</Text>
        <ActivityIndicator size="large" color={palette.cobalt} style={styles.spinner} />
      </View>
    );
  }
  if (status === 'signedOut' || !user) return <Redirect href="/login" />;
  return <Redirect href={homePathForRole(user.role)} />;
}

const styles = StyleSheet.create({
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: palette.canvas },
  sub: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: palette.inkMuted },
  spinner: { marginTop: spacing.xl },
});
