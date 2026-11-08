import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import type { VehicleType } from '@yaar/shared';
import { MAP_COLORS } from '../../lib/map/style';
import { HOUSE_GLYPH, STORE_GLYPH, vehicleGlyph, type ArtRect } from './markerArt';

/** Pictogramme (rectangles d'une boîte 24 × 24) dessiné avec des vues React Native. */
export function ArtView({ rects, size }: { rects: ArtRect[]; size: number }) {
  const k = size / 24;
  return (
    <View style={{ width: size, height: size }}>
      {rects.map((r, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: r.x * k,
            top: r.y * k,
            width: r.w * k,
            height: r.h * k,
            borderRadius: (r.r ?? 0) * k,
            backgroundColor: r.fill,
            transform: r.rotate ? [{ rotate: `${r.rotate}deg` }] : undefined,
          }}
        />
      ))}
    </View>
  );
}

/** Boucle d'animation 0 → 1 (pulsations), arrêtée au démontage. */
function useLoop(active: boolean, duration: number, delay = 0): Animated.Value {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    // Pas de pilote natif : Google Maps (Android) recopie la vue du marqueur à chaque mise à jour JS.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      v.setValue(0);
    };
  }, [active, duration, delay, v]);
  return v;
}

function Ring({ color, size, maxScale, duration, delay, active }: { color: string; size: number; maxScale: number; duration: number; delay: number; active: boolean }) {
  const v = useLoop(active, duration, delay);
  if (!active) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, maxScale] }) }],
      }}
    />
  );
}

/** Entreprise / retrait : carré orange arrondi ; `searching` : radar « recherche d'un livreur ». */
export function PickupMarkerView({ searching }: { searching?: boolean }) {
  const box = searching ? 136 : 44;
  return (
    <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
      <Ring active={!!searching} color="rgba(242,140,27,0.35)" size={38} maxScale={3.4} duration={2400} delay={0} />
      <Ring active={!!searching} color="rgba(242,140,27,0.35)" size={38} maxScale={3.4} duration={2400} delay={800} />
      <View style={styles.pickup}>
        <ArtView rects={STORE_GLYPH} size={22} />
      </View>
    </View>
  );
}

/** Destinataire : épingle verte avec une maison et un halo pulsé sous la pointe. */
export function DropoffMarkerView({ pulse }: { pulse?: boolean }) {
  return (
    <View style={{ width: 64, height: 56, alignItems: 'center' }}>
      <View style={styles.pulseAnchor}>
        <Ring active={!!pulse} color="rgba(11,122,75,0.32)" size={16} maxScale={3.4} duration={2200} delay={0} />
      </View>
      <View style={styles.pin}>
        <View style={{ transform: [{ rotate: '45deg' }] }}>
          <ArtView rects={HOUSE_GLYPH} size={20} />
        </View>
      </View>
    </View>
  );
}

/** Livreur : rond blanc ombré, véhicule vu du dessus et « nez » vert dans le sens de la marche. */
export function DriverMarkerView({ vehicleType, rotation = 0 }: { vehicleType: VehicleType; rotation?: number }) {
  return (
    <View style={{ width: 60, height: 60, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[styles.driver, { transform: [{ rotate: `${rotation}deg` }] }]}>
        <View style={styles.nose} />
        <ArtView rects={vehicleGlyph(vehicleType)} size={30} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pickup: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: MAP_COLORS.pickup,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F2E22',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  pin: {
    position: 'absolute',
    top: 4,
    width: 34,
    height: 34,
    borderTopLeftRadius: 17,
    borderTopRightRadius: 17,
    borderBottomRightRadius: 17,
    borderBottomLeftRadius: 0,
    backgroundColor: MAP_COLORS.dropoff,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-45deg' }],
    shadowColor: '#0F2E22',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: -1, height: 3 },
    elevation: 5,
  },
  // Pointe de l'épingle : top 4 + 17 + 24 (demi-diagonale) ≈ 45.
  pulseAnchor: { position: 'absolute', top: 37, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  driver: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F2E22',
    shadowOpacity: 0.32,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  nose: {
    position: 'absolute',
    top: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: MAP_COLORS.route,
  },
});
