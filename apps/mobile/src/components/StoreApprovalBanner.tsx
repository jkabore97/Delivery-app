import { StyleSheet, View } from 'react-native';
import type { StoreDto } from '@yaar/shared';
import { storeApprovalNotice } from '../lib/storeApproval';
import { palette, radii, spacing } from '../theme';
import { Text } from './Text';
import { TrackingIcon } from './tracking/TrackingIcon';

/**
 * Statut de validation de la boutique par Yaar (rien si elle est validée) : bandeau Cobalt teinté, pictogramme à gauche
 * (horloge en attente : soleil doux ; alerte si suspendue : corail doux), titre et explication. `tone` : @deprecated
 * (même rendu clair).
 */
export function StoreApprovalBanner({
  store,
  tone: _tone,
}: {
  store: Pick<StoreDto, 'approvalStatus' | 'approvalNote'> | null;
  /** @deprecated */
  tone?: 'light' | 'dark';
}) {
  const notice = storeApprovalNotice(store);
  if (!notice) return null;
  const red = notice.tone === 'red';
  const bg = red ? palette.coralTint : palette.sunTint;
  const fg = red ? palette.coralText : palette.sunText;
  return (
    <View style={[styles.box, { backgroundColor: bg }]} accessibilityRole="alert" testID="store-approval">
      <View style={[styles.icon, { backgroundColor: red ? palette.white : palette.sun }]}>
        <TrackingIcon name={red ? 'alert' : 'clock'} size={18} color={red ? palette.coralText : palette.ink} strokeWidth={2.4} />
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, { color: fg }]}>{notice.title}</Text>
        <Text style={styles.message}>{notice.message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, borderRadius: radii.card, padding: spacing.lg },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '800' },
  message: { fontSize: 13.5, lineHeight: 19, fontWeight: '500', color: palette.ink },
});
