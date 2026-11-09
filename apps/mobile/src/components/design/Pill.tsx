import { isValidElement, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { touchTarget } from '../../lib/touchTarget';
import { colors, dark, MIN_TOUCH } from '../../theme';
import { Icon, type IconName } from './Icon';
import type { Surface } from './RoundButton';

/**
 * dark = pastille sombre (posée sur une carte, ou neutre dans une feuille sombre) ; light = blanche ; green = vert
 * vif (action) ; red = rouge plein (Refuser) ; amber = espèces ; outline = contour seul sur fond sombre.
 */
export type PillTone = 'dark' | 'light' | 'green' | 'red' | 'amber' | 'outline';

const PILL_TONES: Record<PillTone, { bg: string; fg: string; border: string }> = {
  dark: { bg: dark.chip, fg: dark.text, border: 'rgba(255,255,255,0.08)' },
  light: { bg: '#FFFFFF', fg: colors.text, border: '#FFFFFF' },
  green: { bg: dark.green, fg: dark.greenInk, border: dark.green },
  red: { bg: dark.redFill, fg: '#FFFFFF', border: dark.redFill },
  amber: { bg: dark.amberSoft, fg: dark.amber, border: 'rgba(255,194,102,0.35)' },
  outline: { bg: 'transparent', fg: dark.text, border: dark.border },
};

export interface PillProps {
  label: string;
  icon?: IconName | ReactNode;
  tone?: PillTone;
  /**
   * md : 40 px de haut (44 avec une action, zone tactile portée à 56 : `hitSlop` en natif, marge intérieure compensée
   * sur le web, voir lib/touchTarget.ts) ; lg : 56 px, la cible tactile minimale (action principale secondaire, ex.
   * « Refuser »).
   */
  size?: 'md' | 'lg';
  /** Avec une action, la pastille devient un bouton. */
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  /** Pastille d'état qui change (« En ligne… ») : annoncée par les lecteurs d'écran. */
  live?: boolean;
  /** Ombre portée (pastilles posées sur une carte). */
  floating?: boolean;
  /** Contenu placé avant l'icône et le libellé (ex. point d'état coloré). */
  leading?: ReactNode;
  /** Lignes du libellé (1 par défaut) ; 2 pour un texte qui ne doit jamais être coupé (indicateur légal). */
  numberOfLines?: number;
  style?: StyleProp<ViewStyle>;
  /** Ajustement du libellé (taille…). */
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
}

/** Pastille arrondie (libellé + icône), simple étiquette ou bouton. */
export function Pill({
  label,
  icon,
  tone = 'dark',
  size = 'md',
  onPress,
  disabled,
  loading,
  accessibilityLabel,
  live,
  floating,
  leading,
  numberOfLines = 1,
  style,
  textStyle,
  testID,
}: PillProps) {
  const t = PILL_TONES[tone];
  const lg = size === 'lg';
  const iconSize = lg ? 20 : 16;
  const iconNode =
    typeof icon === 'string' ? <Icon name={icon as IconName} size={iconSize} color={t.fg} strokeWidth={2.4} /> : isValidElement(icon) ? icon : null;
  const inactive = !!disabled || !!loading;
  const body = (pressed: boolean) => (
    <View
      style={[
        styles.pill,
        lg ? styles.lg : styles.md,
        onPress && !lg ? styles.mdAction : null,
        { backgroundColor: t.bg, borderColor: t.border },
        floating && styles.floating,
        inactive && styles.inactive,
        pressed && !inactive && styles.pressed,
        style,
      ]}
    >
      {leading}
      {loading ? <ActivityIndicator color={t.fg} size="small" /> : iconNode}
      <Text style={[styles.text, lg && styles.textLg, numberOfLines > 1 && styles.textWrap, { color: t.fg }, textStyle]} numberOfLines={numberOfLines}>
        {label}
      </Text>
    </View>
  );
  if (!onPress) {
    // Étiquette avec un libellé d'accessibilité (ex. « Nouvelle course, Moto » : le véhicule n'y est qu'un
    // pictogramme) : un seul élément annoncé, avec ce libellé à la place du texte visible. Web : rôle « img », le seul
    // qui donne son libellé à un bloc non interactif (son contenu n'est alors pas relu en double).
    const labelled = !!accessibilityLabel;
    return (
      <View
        accessible={labelled}
        accessibilityRole={labelled ? (Platform.OS === 'web' ? 'image' : 'text') : undefined}
        accessibilityLiveRegion={live ? 'polite' : undefined}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      >
        {body(false)}
      </View>
    );
  }
  const touch = lg ? {} : touchTarget(44);
  return (
    <Pressable
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      hitSlop={touch.hitSlop}
      style={touch.style}
      testID={testID}
    >
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}

/** Couleurs d'une puce d'état (« LIVRÉE », « EN LIVRAISON ») selon le fond. */
export type ChipTone = 'green' | 'amber' | 'blue' | 'grey' | 'red';

const CHIP_TONES: Record<Surface, Record<ChipTone, { bg: string; fg: string }>> = {
  dark: {
    green: { bg: dark.greenSoft, fg: dark.green },
    amber: { bg: dark.amberSoft, fg: dark.amber },
    blue: { bg: 'rgba(120,170,255,0.16)', fg: '#9DBDFF' },
    grey: { bg: 'rgba(255,255,255,0.08)', fg: dark.textMuted },
    red: { bg: dark.redSoft, fg: dark.red },
  },
  light: {
    green: { bg: colors.greenLight, fg: colors.green },
    amber: { bg: colors.orangeLight, fg: '#9A4F00' },
    blue: { bg: colors.blueLight, fg: colors.blue },
    grey: { bg: '#EEF1F4', fg: colors.textMuted },
    red: { bg: colors.redLight, fg: colors.red },
  },
};

/** Petite puce d'état en capitales. */
export function StatusChip({ label, tone = 'grey', surface = 'dark', testID }: { label: string; tone?: ChipTone; surface?: Surface; testID?: string }) {
  const t = CHIP_TONES[surface][tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }]} testID={testID}>
      <Text style={[styles.chipText, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Bouton rond posé sur une carte (retour, recentrer) : 48 px, blanc sur carte claire, sombre sur carte sombre ; zone
 * tactile de 56 px (lib/touchTarget.ts).
 */
export function MapIconButton({
  icon,
  onPress,
  accessibilityLabel,
  theme = 'light',
  testID,
}: {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  theme?: Surface;
  testID?: string;
}) {
  const darkTheme = theme === 'dark';
  const touch = touchTarget(48);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={touch.hitSlop}
      style={touch.style}
      testID={testID}
    >
      {({ pressed }) => (
        <View style={[styles.mapButton, darkTheme && styles.mapButtonDark, pressed && styles.pressed]}>
          <Icon name={icon} size={22} color={darkTheme ? dark.text : colors.text} strokeWidth={2.4} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, gap: 8 },
  md: { minHeight: 40, paddingHorizontal: 14 },
  mdAction: { minHeight: 44 },
  lg: { minHeight: MIN_TOUCH, paddingHorizontal: 24, justifyContent: 'center' },
  text: { fontSize: 14, fontWeight: '800', letterSpacing: 0.1, fontVariant: ['tabular-nums'] },
  textLg: { fontSize: 16, fontWeight: '900' },
  textWrap: { flexShrink: 1, paddingVertical: 8, lineHeight: 18 },
  floating: {
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  inactive: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  chip: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
  mapButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F2E22',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  mapButtonDark: { backgroundColor: dark.chip },
});
