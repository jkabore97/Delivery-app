import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { StoreDto } from '@yaar/shared';
import { storeApprovalNotice } from '../lib/storeApproval';
import { palette, radii, spacing } from '../theme';
import { Text } from './Text';
import { TrackingIcon } from './tracking/TrackingIcon';

/**
 * Statut de validation de la boutique par Yaar (rien si elle est validée) : bandeau Cobalt teinté, pictogramme à gauche
 * (horloge en attente : soleil doux ; alerte si suspendue : corail doux), titre et explication. `compact` (accueil du
 * téléphone, feuille courte) : l'explication tient sur deux lignes, « Détails » l'affiche en entier ; les livraisons en
 * cours restent au-dessus de la barre d'onglets.
 */
export function StoreApprovalBanner({ store, compact = false }: { store: Pick<StoreDto, 'approvalStatus' | 'approvalNote'> | null; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const notice = storeApprovalNotice(store);
  if (!notice) return null;
  const red = notice.tone === 'red';
  const bg = red ? palette.coralTint : palette.sunTint;
  const fg = red ? palette.coralText : palette.sunText;
  const clamp = compact && !open;
  return (
    <View style={[styles.box, compact && styles.boxCompact, { backgroundColor: bg }]} accessibilityRole="alert" testID="store-approval">
      <View style={[styles.icon, { backgroundColor: red ? palette.white : palette.sun }]}>
        <TrackingIcon name={red ? 'alert' : 'clock'} size={18} color={red ? palette.coralText : palette.ink} strokeWidth={2.4} />
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, { color: fg }]}>{notice.title}</Text>
        <Text style={styles.message} numberOfLines={clamp ? 2 : undefined}>
          {notice.message}
        </Text>
        {compact ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={open ? 'Réduire l’explication' : 'Afficher toute l’explication'}
            onPress={() => setOpen((v) => !v)}
            hitSlop={12}
            style={styles.more}
            testID="store-approval-more"
          >
            <Text style={[styles.moreText, { color: fg }]}>{open ? 'Réduire' : 'Détails'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, borderRadius: radii.card, padding: spacing.lg },
  boxCompact: { paddingVertical: spacing.md, borderRadius: radii.banner },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '800' },
  message: { fontSize: 13.5, lineHeight: 19, fontWeight: '500', color: palette.ink },
  more: { alignSelf: 'flex-start', marginTop: 2 },
  moreText: { fontSize: 13, lineHeight: 18, fontWeight: '800', textDecorationLine: 'underline' },
});
