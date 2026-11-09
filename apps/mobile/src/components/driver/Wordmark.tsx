import { StyleSheet, View } from 'react-native';
import { Text } from '../Text';
import { palette } from '../../theme';

/**
 * Mot-symbole « Yaar » (800) suivi du point cobalt, comme la planche Cobalt et l'écran de démarrage du web
 * (public/index.html). Sans pictogramme ni react-native-svg : utilisable par la page publique de suivi.
 */
export function Wordmark({ size = 44, color = palette.ink, label = 'Yaar Livraison' }: { size?: number; color?: string; label?: string | null }) {
  const dot = Math.max(5, Math.round(size * 0.21));
  return (
    <View
      style={styles.row}
      accessible={!!label}
      accessibilityRole={label ? 'header' : undefined}
      accessibilityLabel={label ?? undefined}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    >
      <Text style={[styles.text, { color, fontSize: size, lineHeight: Math.round(size * 1.08), letterSpacing: -Math.round(size * 0.045 * 10) / 10 }]}>Yaar</Text>
      <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: palette.cobalt, marginBottom: Math.round(size * 0.17) }} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  text: { fontWeight: '800' },
});
