import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { COBALT_MAP } from '../../lib/map/palette';
import { MAP_COLORS } from '../../lib/map/style';
import { Text } from '../Text';
import { ArtView } from './MarkerViews';
import { HOUSE_GLYPH, STORE_GLYPH } from './markerArt';

/** Goutte de l'épingle : carré de 40 dp aux trois coins arrondis tourné de -45°, pointe à 20 + 20·√2 ≈ 48,3 dp du haut. */
const HEAD = 40;
const PIN_WIDTH = 48;
const TIP_Y = HEAD / 2 + (HEAD / 2) * Math.SQRT2;
const PIN_HEIGHT = Math.ceil(TIP_Y) + 2;
const BUBBLE_WIDTH = 230;

/**
 * Épingle fixe au centre de la carte (comme Uber) : goutte cobalt (destinataire, maison) ou encre (retrait, boutique)
 * cerclée de blanc, dont la pointe désigne le centre ; elle se soulève pendant que l'on déplace la carte et se repose
 * à l'arrêt, avec une bulle blanche qui nomme le quartier sous l'épingle.
 */
export function CenterPin({
  moving,
  variant = 'dropoff',
  bubble,
  bubblePlacement = 'above',
}: {
  moving: boolean;
  variant?: 'dropoff' | 'pickup';
  bubble?: { title: string; subtitle?: string | null } | null;
  /** `below` : bulle sous l'épingle (carte basse d'un petit téléphone, où elle toucherait les boutons du haut). */
  bubblePlacement?: 'above' | 'below';
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
          style={[
            bubblePlacement === 'below' ? styles.bubbleWrapBelow : styles.bubbleWrap,
            { opacity: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
          ]}
          testID="pin-bubble"
        >
          {bubblePlacement === 'below' ? <View style={[styles.bubbleArrow, styles.bubbleArrowUp]} /> : null}
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
          {bubblePlacement === 'below' ? null : <View style={styles.bubbleArrow} />}
        </Animated.View>
      ) : null}
      <View style={styles.shadowWrap}>
        <Animated.View
          style={[
            styles.shadow,
            {
              opacity: lift.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.12] }),
              transform: [{ scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] }) }],
            },
          ]}
        />
      </View>
      <Animated.View
        style={[styles.pinWrap, { transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -16] }) }] }]}
      >
        <View style={[styles.head, { backgroundColor: color }]} />
        <View style={styles.glyph}>
          <ArtView rects={variant === 'pickup' ? STORE_GLYPH : HOUSE_GLYPH} size={18} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  pinWrap: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: PIN_WIDTH,
    height: PIN_HEIGHT,
    marginLeft: -PIN_WIDTH / 2,
    marginTop: -TIP_Y,
  },
  head: {
    position: 'absolute',
    top: 0,
    left: (PIN_WIDTH - HEAD) / 2,
    width: HEAD,
    height: HEAD,
    borderTopLeftRadius: HEAD / 2,
    borderTopRightRadius: HEAD / 2,
    borderBottomRightRadius: HEAD / 2,
    borderBottomLeftRadius: 0,
    borderWidth: 3,
    borderColor: COBALT_MAP.white,
    transform: [{ rotate: '-45deg' }],
    shadowColor: COBALT_MAP.ink,
    shadowOpacity: 0.26,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  glyph: {
    position: 'absolute',
    top: 0,
    left: (PIN_WIDTH - HEAD) / 2,
    width: HEAD,
    height: HEAD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shadowWrap: { position: 'absolute', left: '50%', top: '50%', width: 18, height: 6, marginLeft: -9, marginTop: -3 },
  shadow: { width: 18, height: 6, borderRadius: 9, backgroundColor: COBALT_MAP.ink },
  bubbleWrap: {
    position: 'absolute',
    left: '50%',
    bottom: '50%',
    width: BUBBLE_WIDTH,
    marginLeft: -BUBBLE_WIDTH / 2,
    marginBottom: PIN_HEIGHT + 8,
    alignItems: 'center',
  },
  bubbleWrapBelow: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: BUBBLE_WIDTH,
    marginLeft: -BUBBLE_WIDTH / 2,
    marginTop: 12,
    alignItems: 'center',
  },
  bubble: {
    backgroundColor: COBALT_MAP.white,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: BUBBLE_WIDTH,
    alignItems: 'center',
    shadowColor: COBALT_MAP.ink,
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  bubbleTitle: { color: COBALT_MAP.ink, fontWeight: '700', fontSize: 14, lineHeight: 18 },
  bubbleSub: { color: COBALT_MAP.inkMuted, fontWeight: '500', fontSize: 12, lineHeight: 16, marginTop: 1 },
  bubbleArrow: { width: 12, height: 12, backgroundColor: COBALT_MAP.white, transform: [{ rotate: '45deg' }], marginTop: -7 },
  bubbleArrowUp: { marginTop: 0, marginBottom: -7, zIndex: 1 },
});
