import { Linking, Pressable, StyleSheet, Text } from 'react-native';
import { MAP_ATTRIBUTION, MAP_ATTRIBUTION_URL } from '../../lib/map/style';

/** Mention obligatoire des données cartographiques (cartes MapLibre du web). */
export function MapAttribution({ bottom = 4 }: { bottom?: number }) {
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
    right: 4,
    maxWidth: '96%',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  text: { fontSize: 9.5, color: '#4A5561' },
});
