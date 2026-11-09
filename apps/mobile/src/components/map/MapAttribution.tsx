import { Linking, Pressable, StyleSheet } from 'react-native';
import { COBALT_MAP } from '../../lib/map/palette';
import { MAP_ATTRIBUTION, MAP_ATTRIBUTION_URL } from '../../lib/map/style';
import { Text } from '../Text';
import type { MapTheme } from './types';

/**
 * Mention obligatoire des données cartographiques (cartes MapLibre du web) : petite pastille blanche translucide,
 * texte encre atténuée (≈ 5,5:1 sur la carte). `theme` (ancien fond sombre) est accepté et ignoré.
 */
export function MapAttribution({ bottom = 4 }: { bottom?: number; /** @deprecated fond Cobalt partout */ theme?: MapTheme }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => void Linking.openURL(MAP_ATTRIBUTION_URL)}
      style={[styles.box, { bottom }]}
      testID="map-attribution"
    >
      <Text style={styles.text} numberOfLines={1}>
        {MAP_ATTRIBUTION}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    right: 6,
    maxWidth: '96%',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  text: { fontSize: 10, lineHeight: 14, fontWeight: '500', color: COBALT_MAP.inkMuted },
});
