import { StyleSheet, View } from 'react-native';
import type { VehicleType } from '@yaar/shared';
import { MAP_COLORS } from '../../lib/map/style';
import { HOUSE_GLYPH, STORE_GLYPH, vehicleSideGlyph, type ArtShape } from './markerArt';

/**
 * Vues des marqueurs natifs (react-native-maps). Toutes sont STATIQUES : Google Maps (Android) recopie la vue d'un
 * marqueur en image à chaque changement, une animation JavaScript la redessinerait à chaque image. Les halos sont
 * donc fixes, le radar « recherche d'un livreur » est un cercle natif (LiveMap) et le cap du livreur est un
 * marqueur séparé dont seule la propriété `rotation` change.
 */

/** Pictogramme (formes d'une boîte 24 × 24) dessiné avec des vues React Native. */
export function ArtView({ rects, size }: { rects: ArtShape[]; size: number }) {
  const k = size / 24;
  return (
    <View style={{ width: size, height: size }}>
      {rects.map((s, i) => {
        const border = s.stroke ? { borderWidth: (s.strokeWidth ?? 1) * k, borderColor: s.stroke } : null;
        if (s.kind === 'circle') {
          return (
            <View
              key={i}
              style={[
                {
                  position: 'absolute',
                  left: (s.cx - s.r) * k,
                  top: (s.cy - s.r) * k,
                  width: 2 * s.r * k,
                  height: 2 * s.r * k,
                  borderRadius: s.r * k,
                  backgroundColor: s.fill ?? 'transparent',
                },
                border,
              ]}
            />
          );
        }
        return (
          <View
            key={i}
            style={[
              {
                position: 'absolute',
                left: s.x * k,
                top: s.y * k,
                width: s.w * k,
                height: s.h * k,
                borderRadius: (s.r ?? 0) * k,
                backgroundColor: s.fill ?? 'transparent',
                transform: s.rotate ? [{ rotate: `${s.rotate}deg` }] : undefined,
              },
              border,
            ]}
          />
        );
      })}
    </View>
  );
}

/** Taille (dp) de la vue du marqueur entreprise. */
export const PICKUP_VIEW_SIZE = 50;

/** Entreprise / retrait : carré orange arrondi ; `searching` : halo orange fixe (le radar animé est un cercle natif). */
export function PickupMarkerView({ searching }: { searching?: boolean }) {
  return (
    <View style={styles.pickupBox}>
      {searching ? <View style={styles.pickupHalo} /> : null}
      <View style={styles.pickup}>
        <ArtView rects={STORE_GLYPH} size={22} />
      </View>
    </View>
  );
}

/** Destinataire : épingle verte avec une maison et un halo fixe sous la pointe (livraison en cours). */
export function DropoffMarkerView({ pulse }: { pulse?: boolean }) {
  return (
    <View style={{ width: 64, height: 56, alignItems: 'center' }}>
      {pulse ? (
        <View style={styles.pulseAnchor}>
          <View style={styles.dropoffHalo} />
        </View>
      ) : null}
      <View style={styles.pin}>
        <View style={{ transform: [{ rotate: '45deg' }] }}>
          <ArtView rects={HOUSE_GLYPH} size={20} />
        </View>
      </View>
    </View>
  );
}

/** Taille (dp) de la vue du marqueur livreur (disque de 44 + marge pour l'ombre). */
export const DRIVER_VIEW_SIZE = 52;
/** Taille (dp) de la vue du chevron de cap (le chevron est posé sur l'anneau, en haut). */
export const CHEVRON_VIEW_SIZE = 68;

/** Livreur : disque vert cerclé de blanc, véhicule de profil TOUJOURS DROIT (il ne pivote jamais). */
export function DriverMarkerView({ vehicleType }: { vehicleType: VehicleType }) {
  return (
    <View style={styles.driverBox}>
      <View style={styles.driver}>
        <ArtView rects={vehicleSideGlyph(vehicleType)} size={26} />
      </View>
    </View>
  );
}

/**
 * Chevron de cap, dessiné pointe vers le haut au bord de l'anneau : le marqueur qui le porte est « plat » et
 * tourné (propriété `rotation`) selon le cap ; la vue elle-même ne change jamais.
 */
export function HeadingChevronView() {
  return (
    <View style={styles.chevronBox} pointerEvents="none">
      <View style={styles.chevronOutline} />
      <View style={styles.chevron} />
    </View>
  );
}

const shadow = {
  shadowColor: '#0F2E22',
  shadowOpacity: 0.3,
  shadowRadius: 5,
  shadowOffset: { width: 0, height: 3 },
  elevation: 5,
} as const;

const styles = StyleSheet.create({
  pickupBox: { width: PICKUP_VIEW_SIZE, height: PICKUP_VIEW_SIZE, alignItems: 'center', justifyContent: 'center' },
  pickupHalo: {
    position: 'absolute',
    width: PICKUP_VIEW_SIZE,
    height: PICKUP_VIEW_SIZE,
    borderRadius: PICKUP_VIEW_SIZE / 2,
    backgroundColor: 'rgba(242,140,27,0.22)',
    borderWidth: 2,
    borderColor: 'rgba(242,140,27,0.45)',
  },
  pickup: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: MAP_COLORS.pickup,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
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
    ...shadow,
    shadowOffset: { width: -1, height: 3 },
  },
  // Pointe de l'épingle : top 4 + 17 + 24 (demi-diagonale) ≈ 45.
  pulseAnchor: { position: 'absolute', top: 37, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  dropoffHalo: { width: 22, height: 12, borderRadius: 11, backgroundColor: 'rgba(11,122,75,0.3)' },
  driverBox: { width: DRIVER_VIEW_SIZE, height: DRIVER_VIEW_SIZE, alignItems: 'center', justifyContent: 'center' },
  driver: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: MAP_COLORS.driver,
    borderWidth: 3,
    borderColor: MAP_COLORS.driverRing,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
    shadowOpacity: 0.34,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  chevronBox: { width: CHEVRON_VIEW_SIZE, height: CHEVRON_VIEW_SIZE, alignItems: 'center' },
  // Triangle blanc un peu plus grand derrière le vert : liseré blanc.
  chevronOutline: {
    position: 'absolute',
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FFFFFF',
  },
  chevron: {
    position: 'absolute',
    top: 2.5,
    width: 0,
    height: 0,
    borderLeftWidth: 6.5,
    borderRightWidth: 6.5,
    borderBottomWidth: 8.5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: MAP_COLORS.driver,
  },
});
