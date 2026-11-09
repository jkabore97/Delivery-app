import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { VehicleType } from '@yaar/shared';
import { COBALT_MAP, rgba } from '../../lib/map/palette';
import { MAP_COLORS } from '../../lib/map/style';
import { Text } from '../Text';
import { HOUSE_GLYPH, STORE_GLYPH, vehicleSideGlyph, type ArtShape } from './markerArt';

/**
 * Vues des marqueurs natifs (react-native-maps), aux formes « Cobalt » des marqueurs web (markerDom.web.ts) :
 * carré encre de l'entreprise, goutte cobalt du destinataire, disque blanc du livreur. Toutes sont STATIQUES : Google
 * Maps (Android) recopie la vue d'un marqueur en image à chaque changement, une animation JavaScript la redessinerait
 * à chaque image. Les halos sont donc fixes, le radar « recherche d'un livreur » est un cercle natif (LiveMap) et le
 * cap du livreur est un marqueur séparé dont seule la propriété `rotation` change.
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

/** Taille (dp) de la vue du marqueur entreprise : carré de 36 et son halo de recherche. */
export const PICKUP_VIEW_SIZE = 60;

/**
 * Entreprise / retrait : carré encre arrondi cerclé de blanc, initiales blanches ou boutique ; `searching` : halo cobalt
 * fixe (le radar animé est un cercle natif, voir LiveMap).
 */
export function PickupMarkerView({ searching, initials }: { searching?: boolean; initials?: string | null }) {
  return (
    <View style={styles.pickupBox}>
      {searching ? <View style={styles.pickupHalo} /> : null}
      <View style={styles.pickup}>
        {initials ? (
          <Text style={styles.initials} numberOfLines={1} allowFontScaling={false}>
            {initials.slice(0, 3)}
          </Text>
        ) : (
          <ArtView rects={STORE_GLYPH} size={20} />
        )}
      </View>
    </View>
  );
}

/**
 * Goutte du destinataire (vue 48 × 54) : carré de 36 dp aux trois coins arrondis tourné de -45° (pointe en bas), donc
 * pointe à 3 + 18 + 18·√2 ≈ 46,5 dp du haut, au milieu de la largeur.
 */
export const AVATAR_VIEW = { width: 48, height: 54, tipY: 3 + 18 + 18 * Math.SQRT2 } as const;
/** Même géométrie pour la goutte à initiales et la goutte à maison (une seule ancre). */
export const PIN_VIEW = AVATAR_VIEW;

/** Goutte cobalt cerclée de blanc, contenu (initiales ou maison) au centre du disque, halo fixe sous la pointe. */
function PinView({ color, pulse, children }: { color: string; pulse?: boolean; children: ReactNode }) {
  return (
    <View style={styles.pinBox}>
      {pulse ? (
        <View style={styles.pinPulseAnchor}>
          <View style={styles.pinHalo} />
        </View>
      ) : null}
      <View style={[styles.pin, { backgroundColor: color }]} />
      <View style={styles.pinContent}>{children}</View>
    </View>
  );
}

/** Destinataire : goutte cobalt avec une maison ; halo fixe sous la pointe (livraison en cours). */
export function DropoffMarkerView({ pulse }: { pulse?: boolean }) {
  return (
    <PinView color={MAP_COLORS.dropoff} pulse={pulse}>
      <ArtView rects={HOUSE_GLYPH} size={16} />
    </PinView>
  );
}

/** Destinataire (ou autre lieu) à ses initiales : goutte de couleur `color` (cobalt), initiales blanches. */
export function AvatarPinView({ initials, color = MAP_COLORS.dropoff, pulse }: { initials: string; color?: string; pulse?: boolean }) {
  return (
    <PinView color={color} pulse={pulse}>
      <Text style={styles.initials} numberOfLines={1} allowFontScaling={false}>
        {initials.slice(0, 3)}
      </Text>
    </PinView>
  );
}

/** Taille (dp) de la vue du marqueur livreur (disque de 38 + marge pour l'ombre). */
export const DRIVER_VIEW_SIZE = 48;
/** Taille (dp) de la vue de l'encoche de cap (posée sur le bord du disque, en haut). */
export const CHEVRON_VIEW_SIZE = 60;

/**
 * Livreur : disque blanc cerclé de blanc, véhicule cobalt de profil TOUJOURS DROIT (il ne pivote jamais) ; `tone: 'sun'`
 * = disque Sun à véhicule encre (livreur en route vers l'entreprise, vu par l'entreprise).
 */
export function DriverMarkerView({ vehicleType, tone }: { vehicleType: VehicleType; tone?: 'sun' }) {
  const sun = tone === 'sun';
  return (
    <View style={styles.driverBox}>
      <View style={[styles.driver, sun && styles.driverSun]}>
        <ArtView rects={vehicleSideGlyph(vehicleType, sun ? MAP_COLORS.driverSunInk : MAP_COLORS.driverGlyph)} size={22} />
      </View>
    </View>
  );
}

/**
 * Encoche de cap, dessinée pointe vers le haut au bord du disque (sa base passe sous le disque) : le marqueur qui la
 * porte est « plat » et tourné (propriété `rotation`) selon le cap ; la vue elle-même ne change jamais.
 */
export function HeadingChevronView({ tone }: { tone?: 'sun' } = {}) {
  return (
    <View style={styles.chevronBox} pointerEvents="none">
      <View style={styles.chevronOutline} />
      <View style={[styles.chevron, { borderBottomColor: tone === 'sun' ? MAP_COLORS.driverSunNotch : MAP_COLORS.driverGlyph }]} />
    </View>
  );
}

const shadow = {
  shadowColor: COBALT_MAP.ink,
  shadowOpacity: 0.24,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 2 },
  elevation: 5,
} as const;

const styles = StyleSheet.create({
  initials: { color: COBALT_MAP.white, fontWeight: '800', fontSize: 12.5, letterSpacing: 0.25 },
  pickupBox: { width: PICKUP_VIEW_SIZE, height: PICKUP_VIEW_SIZE, alignItems: 'center', justifyContent: 'center' },
  pickupHalo: {
    position: 'absolute',
    width: PICKUP_VIEW_SIZE,
    height: PICKUP_VIEW_SIZE,
    borderRadius: PICKUP_VIEW_SIZE / 2,
    backgroundColor: rgba(COBALT_MAP.cobalt, 0.12),
    borderWidth: 1.5,
    borderColor: rgba(COBALT_MAP.cobalt, 0.3),
  },
  pickup: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: MAP_COLORS.pickup,
    borderWidth: 2.5,
    borderColor: COBALT_MAP.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  pinBox: { width: AVATAR_VIEW.width, height: AVATAR_VIEW.height },
  pin: {
    position: 'absolute',
    top: 3,
    left: (AVATAR_VIEW.width - 36) / 2,
    width: 36,
    height: 36,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 0,
    borderWidth: 2.5,
    borderColor: COBALT_MAP.white,
    transform: [{ rotate: '-45deg' }],
    ...shadow,
    shadowOffset: { width: -1, height: 3 },
  },
  pinContent: {
    position: 'absolute',
    top: 3,
    left: (AVATAR_VIEW.width - 36) / 2,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Halo sous la pointe : boîte de 16 dp centrée sur la pointe.
  pinPulseAnchor: {
    position: 'absolute',
    top: AVATAR_VIEW.tipY - 8,
    left: AVATAR_VIEW.width / 2 - 8,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinHalo: { width: 22, height: 10, borderRadius: 11, backgroundColor: rgba(COBALT_MAP.cobalt, 0.3) },
  driverBox: { width: DRIVER_VIEW_SIZE, height: DRIVER_VIEW_SIZE, alignItems: 'center', justifyContent: 'center' },
  driver: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: MAP_COLORS.driverDisc,
    borderWidth: 2.5,
    borderColor: MAP_COLORS.driverRing,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  driverSun: { backgroundColor: MAP_COLORS.driverSun },
  chevronBox: { width: CHEVRON_VIEW_SIZE, height: CHEVRON_VIEW_SIZE, alignItems: 'center' },
  // Triangle blanc un peu plus grand derrière le triangle de couleur : liseré blanc. Pointe à ≈ 27,6 dp du centre
  // (comme le web), base cachée sous le disque.
  chevronOutline: {
    position: 'absolute',
    top: 1.4,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 13,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: COBALT_MAP.white,
  },
  chevron: {
    position: 'absolute',
    top: 4.6,
    width: 0,
    height: 0,
    borderLeftWidth: 6.6,
    borderRightWidth: 6.6,
    borderBottomWidth: 9.6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
