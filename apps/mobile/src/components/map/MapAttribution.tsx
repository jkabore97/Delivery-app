import { Linking, Pressable, StyleSheet } from 'react-native';
import { COBALT_MAP, rgba } from '../../lib/map/palette';
import { MAP_ATTRIBUTION, MAP_ATTRIBUTION_URL } from '../../lib/map/style';
import { Text } from '../Text';

/**
 * Mention obligatoire des données cartographiques (cartes MapLibre du web ; licence ODbL d'OpenStreetMap) : petite
 * pastille blanche translucide, texte encre atténuée (≈ 5,5:1 sur la carte). Jamais coupée : sur une carte étroite
 * (tuile d'ordinateur, < 330 px), elle passe sur deux lignes au lieu de finir par « … ».
 */
export function MapAttribution({ bottom = 4 }: { bottom?: number }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => void Linking.openURL(MAP_ATTRIBUTION_URL)}
      style={[styles.box, { bottom }]}
      testID="map-attribution"
    >
      <Text style={styles.text}>
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
    backgroundColor: rgba(COBALT_MAP.white, 0.88),
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  text: { fontSize: 10, lineHeight: 14, fontWeight: '500', color: COBALT_MAP.inkMuted, textAlign: 'right' },
});
