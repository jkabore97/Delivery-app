import { StyleSheet, Text, View } from 'react-native';
import type { StoreDto } from '@yaar/shared';
import { storeApprovalNotice } from '../lib/storeApproval';
import { colors, dark, spacing } from '../theme';
import { ORANGE_TEXT } from './business/accent';
import { Icon } from './design/Icon';
import { Card, Muted } from './ui';

/**
 * Statut de validation de la boutique par Yaar (rien si elle est validée) : pictogramme (horloge en attente, alerte
 * si suspendue), titre et explication. `tone="dark"` : feuille sombre.
 */
export function StoreApprovalBanner({
  store,
  tone = 'light',
}: {
  store: Pick<StoreDto, 'approvalStatus' | 'approvalNote'> | null;
  tone?: 'light' | 'dark';
}) {
  const notice = storeApprovalNotice(store);
  if (!notice) return null;
  const red = notice.tone === 'red';
  const icon = red ? 'alert' : 'clock';
  if (tone === 'dark') {
    const fg = red ? dark.red : dark.amber;
    return (
      <View style={[styles.dark, { backgroundColor: red ? dark.redSoft : dark.amberSoft, borderColor: fg }]} accessibilityRole="alert" testID="store-approval">
        <View style={styles.titleRow}>
          <Icon name={icon} size={18} color={fg} strokeWidth={2.4} />
          <Text style={[styles.darkTitle, { color: fg }]}>{notice.title}</Text>
        </View>
        <Text style={styles.darkText}>{notice.message}</Text>
      </View>
    );
  }
  // Fond blanc : orange foncé pour le texte (l'orange de marque n'a que 2,5:1 sur blanc).
  const fg = red ? colors.red : ORANGE_TEXT;
  return (
    <Card highlight={red ? colors.red : colors.orange}>
      <View style={styles.titleRow} accessibilityRole="alert" testID="store-approval">
        <Icon name={icon} size={18} color={fg} strokeWidth={2.4} />
        <Text style={[styles.lightTitle, { color: fg }]}>{notice.title}</Text>
      </View>
      <Muted>{notice.message}</Muted>
    </Card>
  );
}

const styles = StyleSheet.create({
  dark: { borderRadius: 16, borderWidth: 1, padding: spacing.md, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  darkTitle: { flex: 1, fontSize: 15, fontWeight: '900' },
  lightTitle: { flex: 1, fontSize: 17, fontWeight: '800' },
  darkText: { fontSize: 13.5, lineHeight: 19, color: dark.textMuted },
});
