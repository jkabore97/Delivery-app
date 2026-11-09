import { Platform, Pressable, StyleSheet, View, type PressableStateCallbackType, type StyleProp, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import type { OrderDto, StoreDto } from '@yaar/shared';
import { Text } from '../Text';
import { Icon, type IconName } from '../design/Icon';
import { avatarInitials } from '../map/markerArt';
import { notify } from '../../lib/dialog';
import { newDeliveryAccess } from '../../lib/storeApproval';
import { touchTarget } from '../../lib/touchTarget';
import { MIN_TOUCH, palette, shadows, tabular } from '../../theme';
import type { TimelineStep } from './dashboardData';

/** État d'un élément pressable sur le web (react-native-web ajoute `hovered` et `focused`). */
export type WebPressState = PressableStateCallbackType & { hovered?: boolean; focused?: boolean };

/** Curseur « main » sur le web. */
export const POINTER: ViewStyle | null = Platform.OS === 'web' ? ({ cursor: 'pointer' } as unknown as ViewStyle) : null;

/* ------------------------------------------------------------------------------------------------------------------ */
/* Pastilles                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

export type AvatarTone = 'cobalt' | 'tint' | 'sun' | 'mint' | 'grey' | 'white';

const AVATAR: Record<AvatarTone, { bg: string; fg: string }> = {
  cobalt: { bg: palette.cobalt, fg: palette.onCobalt },
  tint: { bg: palette.cobaltTint, fg: palette.cobaltText },
  sun: { bg: palette.sun, fg: palette.ink },
  mint: { bg: palette.mintTint, fg: palette.mintText },
  grey: { bg: palette.raisedHigh, fg: palette.ink },
  white: { bg: palette.white, fg: palette.cobalt },
};

/** Pastille ronde aux initiales (spec : 13–15/800, teinte selon le rôle). */
export function InitialsAvatar({ name, size = 40, tone = 'tint' }: { name: string | null | undefined; size?: number; tone?: AvatarTone }) {
  const t = AVATAR[tone];
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: t.bg }]}>
      <Text style={[styles.avatarText, { color: t.fg, fontSize: Math.max(10, Math.round(size * 0.34)) }]}>{avatarInitials(name) ?? '?'}</Text>
    </View>
  );
}

/** Pastille d'une livraison en cours dans une liste : colis en route cobaltTint, retrait soleil, recherche gris. */
export function avatarToneOf(o: Pick<OrderDto, 'status'>, selected = false): AvatarTone {
  if (selected) return 'cobalt';
  if (o.status === 'PICKED_UP') return 'tint';
  if (o.status === 'ASSIGNED') return 'sun';
  if (o.status === 'DELIVERED') return 'mint';
  return 'grey';
}

/** L'entreprise : carré encre arrondi aux initiales blanches (« LV »), comme son marqueur sur la carte. */
export function BusinessMark({ name, size = 40 }: { name: string | null | undefined; size?: number }) {
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: Math.round(size * 0.32) }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={[styles.markText, { fontSize: Math.round(size * 0.33) }]}>{avatarInitials(name) ?? '?'}</Text>
    </View>
  );
}

/** Pilule soleil d'un montant en espèces (texte encre, chiffres tabulaires). */
export function SunPill({ text, size = 'md', testID }: { text: string; size?: 'sm' | 'md'; testID?: string }) {
  return (
    <View style={[styles.sun, size === 'sm' && styles.sunSm]} testID={testID}>
      <Text style={[styles.sunText, size === 'sm' && styles.sunTextSm]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

export type MiniTone = 'cobalt' | 'sun' | 'grey' | 'mint' | 'coral';

const MINI: Record<MiniTone, { bg: string; fg: string }> = {
  cobalt: { bg: palette.cobalt, fg: palette.onCobalt },
  sun: { bg: palette.sun, fg: palette.ink },
  grey: { bg: palette.canvas, fg: palette.inkMuted },
  mint: { bg: palette.mintTint, fg: palette.mintText },
  coral: { bg: palette.coralTint, fg: palette.coralText },
};

/** Petite puce d'état d'une ligne de liste (20 px, 11,5/700) : en livraison cobalt, retrait soleil, recherche gris. */
export function MiniChip({ label, tone, dot }: { label: string; tone: MiniTone; dot?: boolean }) {
  const t = MINI[tone];
  return (
    <View style={[styles.mini, { backgroundColor: t.bg }]}>
      {dot ? <View style={styles.miniDot} /> : null}
      <Text style={[styles.miniText, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function miniToneOf(o: Pick<OrderDto, 'status'>): MiniTone {
  if (o.status === 'PICKED_UP') return 'cobalt';
  if (o.status === 'ASSIGNED') return 'sun';
  if (o.status === 'DELIVERED') return 'mint';
  if (o.status === 'CANCELLED') return 'coral';
  return 'grey';
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Progression en pilules segmentées                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Progression en 4 pilules (spec Cobalt) : faites pleines, en cours remplie aux deux tiers, à venir en piste. Sur la
 * tuile héros (`onCobalt`) : blanc sur blanc à 24 % ; ailleurs : cobalt sur raisedHigh. `labels` : libellé et heure
 * sous chaque pilule (tableau de bord).
 */
export function SegmentedProgress({
  steps,
  onCobalt = false,
  height = 8,
  labels = false,
  style,
}: {
  steps: TimelineStep[];
  onCobalt?: boolean;
  height?: number;
  labels?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const fill = onCobalt ? palette.white : palette.cobalt;
  const track = onCobalt ? 'rgba(255, 255, 255, 0.24)' : palette.raisedHigh;
  const index = steps.findIndex((s) => s.state === 'current');
  const done = steps.filter((s) => s.state === 'done').length;
  const current = index >= 0 ? steps[index] : null;
  return (
    <View
      style={[styles.steps, { gap: labels ? 6 : 4 }, style]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: steps.length, now: done, text: current ? `Étape ${index + 1} sur ${steps.length} : ${current.label}` : `${done} étapes sur ${steps.length}` }}
    >
      {steps.map((s) => (
        <View key={s.key} style={styles.step}>
          <View style={[styles.seg, { height, borderRadius: height / 2, backgroundColor: s.state === 'done' ? fill : track }]}>
            {s.state === 'current' ? <View style={[styles.segNow, { borderRadius: height / 2, backgroundColor: fill }]} /> : null}
          </View>
          {labels ? (
            <>
              <Text style={[styles.stepLabel, { color: onCobalt ? (s.state === 'todo' ? palette.onCobalt2 : palette.onCobalt) : s.state === 'todo' ? palette.inkMuted : palette.ink }]} numberOfLines={1}>
                {s.label}
              </Text>
              {s.time ? (
                <View style={styles.stepTimeRow}>
                  {s.approx ? <Icon name="approx" size={12} color={onCobalt ? palette.onCobalt2 : palette.inkMuted} strokeWidth={2.4} /> : null}
                  <Text style={[styles.stepTime, { color: onCobalt ? palette.onCobalt2 : palette.inkMuted }]} numberOfLines={1}>
                    {s.time}
                  </Text>
                </View>
              ) : (
                <Text style={styles.stepTime}> </Text>
              )}
            </>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* « Nouvelle livraison »                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Action principale « Nouvelle livraison » (pilule cobalt pleine). Règles de validation : entreprise validée → le
 * parcours ; pas encore d'entreprise → son profil à créer ; en attente de validation ou suspendue → pilule grisée,
 * son appui explique pourquoi (même règle que l'onglet « Nouvelle » du téléphone). `variant` : `phone` (pleine
 * largeur, 56 px) ou `desktop` (48 px, en haut à droite des pages).
 */
export function NewDeliveryButton({
  stores,
  store,
  variant = 'phone',
  style,
}: {
  stores: readonly StoreDto[] | undefined;
  store: StoreDto | null;
  variant?: 'phone' | 'desktop';
  style?: StyleProp<ViewStyle>;
}) {
  const access = newDeliveryAccess(stores, store);
  const desktop = variant === 'desktop';
  if (access.kind === 'profile') {
    return (
      <PrimaryPill
        label="Créer mon profil d’entreprise"
        icon="store"
        desktop={desktop}
        onPress={() => router.navigate('/business/profile')}
        style={style}
        testID="create-business"
      />
    );
  }
  const off = access.kind === 'notice';
  return (
    <PrimaryPill
      label="Nouvelle livraison"
      icon="plus"
      desktop={desktop}
      off={off}
      onPress={() => (off ? notify(access.notice.title, access.notice.message) : router.push('/business/nouvelle'))}
      accessibilityLabel={off ? `Nouvelle livraison, indisponible : ${access.notice.title.toLowerCase()}` : 'Nouvelle livraison'}
      style={style}
      testID={off ? 'new-delivery-unavailable' : 'new-delivery'}
    />
  );
}

/** Pilule cobalt pleine (56 px téléphone, 48 px ordinateur) ; `off` : grisée (raisedHigh, texte inkMuted 5,1:1). */
export function PrimaryPill({
  label,
  icon,
  onPress,
  desktop = false,
  off = false,
  accessibilityLabel,
  style,
  testID,
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
  desktop?: boolean;
  off?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const fg = off ? palette.inkMuted : palette.onCobalt;
  const touch = desktop ? touchTarget(48) : {};
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={'hitSlop' in touch ? touch.hitSlop : undefined}
      style={[desktop ? null : styles.stretch, 'style' in touch ? touch.style : null, style]}
      testID={testID}
    >
      {(s: WebPressState) => (
        <View
          style={[
            styles.primary,
            desktop ? styles.primaryDesk : styles.primaryPhone,
            off ? styles.primaryOff : [styles.primaryOn, shadows.cobalt],
            POINTER,
            (s.pressed || s.hovered) && !off && styles.primaryPressed,
          ]}
        >
          <Icon name={icon} size={desktop ? 18 : 20} color={fg} strokeWidth={2.6} />
          <Text style={[desktop ? styles.primaryTextDesk : styles.primaryText, { color: fg }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontWeight: '800', letterSpacing: 0.2 },
  mark: { backgroundColor: palette.ink, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  markText: { fontWeight: '800', color: palette.white, letterSpacing: 0.2 },
  sun: { height: 32, borderRadius: 16, paddingHorizontal: 12, backgroundColor: palette.sun, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sunSm: { height: 26, borderRadius: 13, paddingHorizontal: 10 },
  sunText: { fontSize: 15, lineHeight: 19, fontWeight: '800', letterSpacing: -0.15, color: palette.ink, ...tabular },
  sunTextSm: { fontSize: 13, lineHeight: 17 },
  mini: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 20, borderRadius: 10, paddingHorizontal: 8, flexShrink: 1, minWidth: 0 },
  miniDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.cobalt },
  miniText: { fontSize: 11.5, lineHeight: 15, fontWeight: '700', ...tabular },
  steps: { flexDirection: 'row' },
  step: { flex: 1, minWidth: 0 },
  seg: { overflow: 'hidden' },
  segNow: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '62%' },
  stepLabel: { marginTop: 10, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  stepTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  stepTime: { fontSize: 12, lineHeight: 16, fontWeight: '500', ...tabular },
  stretch: { alignSelf: 'stretch' },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999 },
  primaryPhone: { minHeight: MIN_TOUCH, paddingHorizontal: 24 },
  primaryDesk: { height: 48, paddingLeft: 18, paddingRight: 22 },
  primaryOn: { backgroundColor: palette.cobalt },
  primaryOff: { backgroundColor: palette.raisedHigh },
  primaryPressed: { opacity: 0.9 },
  primaryText: { fontSize: 16, lineHeight: 20, fontWeight: '700' },
  primaryTextDesk: { fontSize: 15, lineHeight: 19, fontWeight: '700' },
});
