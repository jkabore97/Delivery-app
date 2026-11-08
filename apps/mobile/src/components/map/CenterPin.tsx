import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { MAP_COLORS } from '../../lib/map/style';
import { ArtView } from './MarkerViews';
import { HOUSE_GLYPH, STORE_GLYPH } from './markerArt';

const PIN_HEIGHT = 56;
const BUBBLE_WIDTH = 230;

/**
 * Épingle fixe au centre de la carte (comme Uber) : elle se soulève pendant que l'on déplace la carte et
 * se repose à l'arrêt, avec une bulle qui nomme le quartier sous l'épingle.
 */
export function CenterPin({
  moving,
  variant = 'dropoff',
  bubble,
}: {
  moving: boolean;
  variant?: 'dropoff' | 'pickup';
  bubble?: { title: string; subtitle?: string | null } | null;
}) {
  const lift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(lift, {
      toValue: moving ? 1 : 0,
      useNativeDriver: Platform.OS !== 'web',
      speed: 20,
      bounciness: moving ? 0 : 10,
    }).start();
  }, [moving, lift]);
  const color = variant === 'pickup' ? MAP_COLORS.pickup : MAP_COLORS.dropoff;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="center-pin">
      {bubble ? (
        <Animated.View
          style={[styles.bubbleWrap, { opacity: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
          testID="pin-bubble"
        >
          <View style={styles.bubble}>
            <Text style={styles.bubbleTitle} numberOfLines={1}>
              {bubble.title}
            </Text>
            {bubble.subtitle ? (
              <Text style={styles.bubbleSub} numberOfLines={1}>
                {bubble.subtitle}
              </Text>
            ) : null}
          </View>
          <View style={styles.bubbleArrow} />
        </Animated.View>
      ) : null}
      <View style={styles.shadowWrap}>
        <Animated.View
          style={[
            styles.shadow,
            {
              opacity: lift.interpolate({ inputRange: [0, 1], outputRange: [0.32, 0.14] }),
              transform: [{ scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] }) }],
            },
          ]}
        />
      </View>
      <Animated.View
        style={[styles.pinWrap, { transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -16] }) }] }]}
      >
        <View style={[styles.head, { backgroundColor: color }]}>
          <ArtView rects={variant === 'pickup' ? STORE_GLYPH : HOUSE_GLYPH} size={20} />
        </View>
        <View style={[styles.stick, { backgroundColor: color }]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  pinWrap: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 42,
    height: PIN_HEIGHT,
    marginLeft: -21,
    marginTop: -PIN_HEIGHT,
    alignItems: 'center',
  },
  head: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F2E22',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  stick: { width: 4, height: PIN_HEIGHT - 42, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, marginTop: -1 },
  shadowWrap: { position: 'absolute', left: '50%', top: '50%', width: 18, height: 6, marginLeft: -9, marginTop: -3 },
  shadow: { width: 18, height: 6, borderRadius: 9, backgroundColor: '#000000' },
  bubbleWrap: {
    position: 'absolute',
    left: '50%',
    bottom: '50%',
    width: BUBBLE_WIDTH,
    marginLeft: -BUBBLE_WIDTH / 2,
    marginBottom: PIN_HEIGHT + 8,
    alignItems: 'center',
  },
  bubble: {
    backgroundColor: '#16202A',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: BUBBLE_WIDTH,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  bubbleTitle: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  bubbleSub: { color: '#C9D2DA', fontSize: 12, marginTop: 1 },
  bubbleArrow: { width: 12, height: 12, backgroundColor: '#16202A', transform: [{ rotate: '45deg' }], marginTop: -7 },
});
