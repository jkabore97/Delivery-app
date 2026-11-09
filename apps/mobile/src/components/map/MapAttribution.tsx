import { Linking, Pressable, StyleSheet, Text } from 'react-native';
import { MAP_ATTRIBUTION, MAP_ATTRIBUTION_URL } from '../../lib/map/style';
import type { MapTheme } from './types';

/** Mention obligatoire des données cartographiques (cartes MapLibre du web), lisible sur fond clair ou sombre. */
export function MapAttribution({ bottom = 4, theme = 'light' }: { bottom?: number; theme?: MapTheme }) {
  const dark = theme === 'dark';
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => void Linking.openURL(MAP_ATTRIBUTION_URL)}
      style={[styles.box, dark && styles.boxDark, { bottom }]}
      testID="map-attribution"
    >
      <Text style={[styles.text, dark && styles.textDark]} numberOfLines={1}>
        {MAP_ATTRIBUTION}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    right: 4,
    maxWidth: '96%',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  boxDark: { backgroundColor: 'rgba(11,15,13,0.72)' },
  text: { fontSize: 9.5, color: '#4A5561' },
  textDark: { color: '#A3B0A9' },
});
