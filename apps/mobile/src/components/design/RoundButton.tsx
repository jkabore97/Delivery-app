import { isValidElement, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '../Text';
import { touchTarget } from '../../lib/touchTarget';
import { palette, shadows } from '../../theme';
import { Icon, type IconName } from './Icon';

/**
 * Diamètres (px) : big 84, medium 64, small 48 (zone tactile portée à 56 : `hitSlop` en natif ; sur le web, qui
 * l'ignore, marge intérieure compensée par une marge négative, voir lib/touchTarget.ts).
 */
export const ROUND_BUTTON_SIZES = { big: 84, medium: 64, small: 48 } as const;
export type RoundButtonSize = keyof typeof ROUND_BUTTON_SIZES;

/**
 * primary = action principale (disque cobalt, pictogramme blanc) ; neutral = disque blanc à ombre flottante,
 * pictogramme cobalt (contacts, actions secondaires) ; light = disque blanc, pictogramme encre (posé sur une carte) ;
 * danger = rouge plein (Refuser, SOS), pictogramme blanc.
 */
export type RoundButtonTone = 'primary' | 'danger' | 'neutral' | 'light';

/**
 * Fond sur lequel le bouton est posé. 'light' et 'dark' (@deprecated : Cobalt n'a plus de fond sombre) donnent le même
 * rendu clair ; 'cobalt' : posé sur la tuile héros cobalt (libellé en blanc cassé).
 */
export type Surface = 'dark' | 'light' | 'cobalt';

const TONES: Record<RoundButtonTone, { bg: string; fg: string; float: boolean }> = {
  primary: { bg: palette.cobalt, fg: palette.onCobalt, float: false },
  danger: { bg: palette.coralFill, fg: palette.white, float: false },
  neutral: { bg: palette.white, fg: palette.cobalt, float: true },
  light: { bg: palette.white, fg: palette.ink, float: true },
};

export interface RoundButtonProps {
  /** Libellé (sous le disque, ou dedans avec `labelInside`) ; sert aussi d'accessibilityLabel par défaut. */
  label: string;
  /** Pictogramme : nom d'icône Yaar ou élément déjà construit. */
  icon?: IconName | ReactNode;
  onPress: () => void;
  size?: RoundButtonSize;
  /** Diamètre libre (ex. 128 pour « Accepter » dans son anneau) ; prioritaire sur `size`. */
  diameter?: number;
  tone?: RoundButtonTone;
  surface?: Surface;
  /** Libellé (et `caption`) écrits dans le disque, sous l'icône. */
  labelInside?: boolean;
  /** Second texte dans le disque (ex. « 28 s »), avec `labelInside`. */
  caption?: string | null;
  /** false : libellé seulement pour l'accessibilité (bouton icône). */
  showLabel?: boolean;
  disabled?: boolean;
  /** Indicateur d'activité à la place du contenu ; le bouton est inactif. */
  loading?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Hauteur réservée au disque (rangée de boutons de tailles différentes : centres alignés). */
  slot?: number;
  /** Ombre portée renforcée (boutons posés sur une carte) ; par défaut pour les disques de 84 px et plus. */
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Bouton rond Cobalt : disque (cobalt plein, blanc à ombre flottante, ou rouge), pictogramme, libellé 13/600 dessous
 * (ou dedans), états inactif et chargement, cible tactile de 56 px au moins. Ex. : `<RoundButton size="big"
 * tone="primary" icon="check" label="Livré" onPress={…} />`.
 */
export function RoundButton({
  label,
  icon,
  onPress,
  size = 'medium',
  diameter,
  tone = 'neutral',
  surface = 'light',
  labelInside = false,
  caption,
  showLabel = true,
  disabled,
  loading,
  accessibilityLabel,
  accessibilityHint,
  slot,
  elevated,
  style,
  testID,
}: RoundButtonProps) {
  const d = diameter ?? ROUND_BUTTON_SIZES[size];
  const t = TONES[tone];
  const inactive = !!disabled || !!loading;
  const iconSize = Math.round(Math.min(40, Math.max(20, d * (labelInside ? 0.24 : 0.38))));
  const iconNode =
    typeof icon === 'string' ? <Icon name={icon as IconName} size={iconSize} color={t.fg} strokeWidth={2.3} /> : isValidElement(icon) ? icon : null;
  const lifted = elevated ?? d >= ROUND_BUTTON_SIZES.big;
  const touch = touchTarget(d);
  const labelColor = surface === 'cobalt' ? palette.onCobalt2 : palette.ink;

  return (
    <Pressable
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      hitSlop={touch.hitSlop}
      style={[styles.column, touch.style, style]}
      testID={testID}
    >
      {({ pressed }) => (
        <>
          <View style={[styles.slot, { height: Math.max(slot ?? d, d) }]}>
            <View
              style={[
                styles.disc,
                { width: d, height: d, borderRadius: d / 2, backgroundColor: t.bg },
                t.float && shadows.float,
                lifted && (tone === 'primary' ? shadows.cobalt : shadows.float),
                inactive && styles.inactive,
                pressed && !inactive && styles.pressed,
              ]}
            >
              {loading ? (
                <ActivityIndicator color={t.fg} />
              ) : (
                <>
                  {iconNode}
                  {labelInside ? (
                    <Text
                      style={[styles.inside, { color: t.fg, fontSize: Math.max(14, Math.round(d * 0.14)), maxWidth: d * 0.8 }]}
                      numberOfLines={2}
                    >
                      {label}
                    </Text>
                  ) : null}
                  {labelInside && caption ? (
                    <Text style={[styles.caption, { color: t.fg }]} numberOfLines={1}>
                      {caption}
                    </Text>
                  ) : null}
                </>
              )}
            </View>
          </View>
          {showLabel && !labelInside ? (
            <Text style={[styles.label, { color: labelColor }, inactive && styles.labelInactive]} numberOfLines={1}>
              {label}
            </Text>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: 6 },
  slot: { justifyContent: 'center', alignItems: 'center' },
  disc: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  inactive: { opacity: 0.45 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.96 }] },
  inside: { fontWeight: '800', letterSpacing: -0.2, textAlign: 'center' },
  caption: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'], opacity: 0.9 },
  label: { fontSize: 13, lineHeight: 17, fontWeight: '600' },
  labelInactive: { opacity: 0.5 },
});
