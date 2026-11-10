import { isValidElement, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Text } from '../Text';
import { touchTarget } from '../../lib/touchTarget';
import { FOCUS_RING_INNER, FOCUS_SHAPE, MIN_TOUCH, palette, shadows } from '../../theme';
import { Icon, type IconName } from './Icon';

/**
 * Tons Cobalt d'une pastille :
 * - neutral (défaut) : étiquette neutre, fond raised, texte encre (blanche si `floating`) ;
 * - cobalt : action principale, fond cobalt, texte blanc ;
 * - red : action destructive (Refuser), fond rouge plein, texte blanc ;
 * - sun : espèces, fond soleil, texte encre ;
 * - tint : choix actif, fond cobaltTint, texte cobaltText ;
 * - outline : action secondaire, blanc à filet fin, texte encre ;
 * - light : blanche (posée sur une carte, avec `floating`).
 */
export type PillTone = 'neutral' | 'cobalt' | 'red' | 'sun' | 'tint' | 'outline' | 'light';

const PILL_TONES: Record<PillTone, { bg: string; fg: string; border?: string }> = {
  neutral: { bg: palette.raised, fg: palette.ink },
  cobalt: { bg: palette.cobalt, fg: palette.onCobalt },
  red: { bg: palette.coralFill, fg: palette.white },
  sun: { bg: palette.sun, fg: palette.ink },
  tint: { bg: palette.cobaltTint, fg: palette.cobaltText },
  outline: { bg: palette.white, fg: palette.ink, border: palette.line },
  light: { bg: palette.white, fg: palette.ink },
};

export interface PillProps {
  label: string;
  icon?: IconName | ReactNode;
  tone?: PillTone;
  /**
   * md : 40 px de haut (44 avec une action, zone tactile portée à 56 : `hitSlop` en natif, marge intérieure compensée
   * sur le web, voir lib/touchTarget.ts) ; lg : 56 px, la cible tactile des actions principales (« Continuer »,
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
  /** Pastille posée sur une carte : blanche, ombre flottante. */
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

/** Pastille Cobalt (libellé + icône), simple étiquette ou bouton en pilule. */
export function Pill({
  label,
  icon,
  tone = 'neutral',
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
  const base = PILL_TONES[tone];
  // Étiquette neutre posée sur une carte : blanche (une pastille grise y serait terne).
  const t = floating && tone === 'neutral' ? PILL_TONES.light : base;
  const lg = size === 'lg';
  const iconSize = lg ? 20 : 16;
  const iconNode =
    typeof icon === 'string' ? <Icon name={icon as IconName} size={iconSize} color={t.fg} strokeWidth={2.4} /> : isValidElement(icon) ? icon : null;
  const inactive = !!disabled || !!loading;
  const primary = tone === 'cobalt';
  const body = (pressed: boolean) => (
    <View
      {...(onPress ? FOCUS_SHAPE : null)}
      style={[
        styles.pill,
        lg ? styles.lg : styles.md,
        onPress && !lg ? styles.mdAction : null,
        { backgroundColor: t.bg },
        t.border ? { borderColor: t.border, borderWidth: 1 } : null,
        t.border && !floating ? shadows.hairline : null,
        floating && shadows.float,
        primary && lg && onPress && !inactive ? shadows.cobalt : null,
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
      {...FOCUS_RING_INNER}
    >
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}

/**
 * Couleurs d'une puce d'état (spec Cobalt) : blue = en livraison (cobaltTint) ; amber = vers vous / retrait (soleil) ;
 * grey = recherche d'un livreur (raised, petit point cobalt avec `dot`) ; green = livrée (mint) ; red = annulée.
 */
export type ChipTone = 'green' | 'amber' | 'blue' | 'grey' | 'red';

const CHIP_TONES: Record<ChipTone, { bg: string; fg: string }> = {
  green: { bg: palette.mintTint, fg: palette.mintText },
  amber: { bg: palette.sun, fg: palette.ink },
  blue: { bg: palette.cobaltTint, fg: palette.cobaltText },
  grey: { bg: palette.raised, fg: palette.inkMuted },
  red: { bg: palette.coralTint, fg: palette.coralText },
};

/** « EN LIVRAISON » → « En livraison » (Cobalt écrit les états en minuscules) ; un libellé déjà mixte reste tel quel. */
export function chipLabel(label: string): string {
  return label === label.toUpperCase() && label !== label.toLowerCase() ? label.charAt(0) + label.slice(1).toLowerCase() : label;
}

/** Puce d'état : pilule de 28 px, 13/700, fond teinté et texte assorti. `dot` : petit point cobalt (recherche d'un livreur). */
export function StatusChip({ label, tone = 'grey', dot = false, testID }: { label: string; tone?: ChipTone; dot?: boolean; testID?: string }) {
  const t = CHIP_TONES[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }]} testID={testID}>
      {dot ? <View style={styles.chipDot} /> : null}
      <Text style={[styles.chipText, { color: t.fg }]} numberOfLines={1}>
        {chipLabel(label)}
      </Text>
    </View>
  );
}

/**
 * Bouton rond posé sur une carte (retour, recentrer) : disque blanc de 48 px à ombre flottante, pictogramme encre ;
 * zone tactile de 56 px (lib/touchTarget.ts).
 */
export function MapIconButton({
  icon,
  onPress,
  accessibilityLabel,
  color = palette.ink,
  testID,
}: {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  /** Couleur du pictogramme (encre ; cobalt pour « Recentrer »). */
  color?: string;
  testID?: string;
}) {
  const touch = touchTarget(48);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={touch.hitSlop}
      style={touch.style}
      testID={testID}
      {...FOCUS_RING_INNER}
    >
      {({ pressed }) => (
        <View {...FOCUS_SHAPE} style={[styles.mapButton, shadows.float, pressed && styles.pressed]}>
          <Icon name={icon} size={22} color={color} strokeWidth={2.3} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 999, gap: 8 },
  md: { minHeight: 40, paddingHorizontal: 16 },
  mdAction: { minHeight: 44 },
  lg: { minHeight: MIN_TOUCH, paddingHorizontal: 24, justifyContent: 'center' },
  text: { fontSize: 14, lineHeight: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  textLg: { fontSize: 16, lineHeight: 20, fontWeight: '700' },
  textWrap: { flexShrink: 1, paddingVertical: 8, lineHeight: 18 },
  inactive: { opacity: 0.45 },
  pressed: { opacity: 0.88 },
  chip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, minHeight: 28, borderRadius: 14, paddingHorizontal: 11 },
  chipDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.cobalt },
  chipText: { fontSize: 13, lineHeight: 17, fontWeight: '700' },
  mapButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center' },
});
