import { isValidElement, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { touchTarget } from '../../lib/touchTarget';
import { colors, dark } from '../../theme';
import { Icon, type IconName } from './Icon';

/**
 * Diamètres (px) : big 84, medium 64, small 48 (zone tactile portée à 56 : `hitSlop` en natif ; sur le web, qui
 * l'ignore, marge intérieure compensée par une marge négative, voir lib/touchTarget.ts).
 */
export const ROUND_BUTTON_SIZES = { big: 84, medium: 64, small: 48 } as const;
export type RoundButtonSize = keyof typeof ROUND_BUTTON_SIZES;

/**
 * primary = action principale (vert vif sur fond sombre, vert de marque sur fond clair) ; danger = rouge (refus, SOS) ;
 * neutral = surface relevée (contacts, actions secondaires) ; light = disque blanc (posé sur une carte).
 */
export type RoundButtonTone = 'primary' | 'danger' | 'neutral' | 'light';

/** Fond sur lequel le bouton est posé : couleurs du disque et du libellé. */
export type Surface = 'dark' | 'light';

const TONES: Record<Surface, Record<RoundButtonTone, { bg: string; fg: string; border: string }>> = {
  dark: {
    primary: { bg: dark.green, fg: dark.greenInk, border: dark.green },
    danger: { bg: dark.redFill, fg: '#FFFFFF', border: dark.redFill },
    neutral: { bg: dark.raised, fg: dark.text, border: dark.border },
    light: { bg: '#FFFFFF', fg: colors.text, border: '#FFFFFF' },
  },
  light: {
    primary: { bg: colors.green, fg: '#FFFFFF', border: colors.green },
    danger: { bg: colors.red, fg: '#FFFFFF', border: colors.red },
    neutral: { bg: '#FFFFFF', fg: colors.text, border: colors.border },
    light: { bg: '#FFFFFF', fg: colors.text, border: '#FFFFFF' },
  },
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
  /** Ombre portée (boutons posés sur une carte) ; par défaut pour les disques de 84 px et plus. */
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Bouton rond façon application de coursier : disque coloré (icône, et libellé dedans ou dessous), états inactif et
 * chargement, cible tactile de 56 px au moins. Ex. : `<RoundButton size="big" tone="primary" icon="check"
 * label="Livré" onPress={…} />`.
 */
export function RoundButton({
  label,
  icon,
  onPress,
  size = 'medium',
  diameter,
  tone = 'neutral',
  surface = 'dark',
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
  const t = TONES[surface][tone];
  const inactive = !!disabled || !!loading;
  const iconSize = Math.round(Math.min(40, Math.max(20, d * (labelInside ? 0.24 : 0.4))));
  const iconNode =
    typeof icon === 'string' ? <Icon name={icon as IconName} size={iconSize} color={t.fg} strokeWidth={2.4} /> : isValidElement(icon) ? icon : null;
  const shadow = elevated ?? d >= ROUND_BUTTON_SIZES.big;
  const touch = touchTarget(d);
  const labelColor = surface === 'dark' ? dark.text : colors.text;

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
                { width: d, height: d, borderRadius: d / 2, backgroundColor: t.bg, borderColor: t.border },
                shadow && styles.shadow,
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
  disc: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, gap: 2 },
  shadow: {
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  inactive: { opacity: 0.45 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  inside: { fontWeight: '900', letterSpacing: -0.2, textAlign: 'center' },
  caption: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'], opacity: 0.85 },
  label: { fontSize: 13, fontWeight: '800', letterSpacing: 0.1 },
  labelInactive: { opacity: 0.5 },
});
