import { StyleSheet, Text, View } from 'react-native';
import type { StoreDto } from '@yaar/shared';
import { storeApprovalNotice } from '../lib/storeApproval';
import { colors, dark, spacing } from '../theme';
import { Card, Muted, Subtitle } from './ui';

/** Statut de validation de la boutique par Yaar (rien si elle est validée). `tone="dark"` : feuille sombre. */
export function StoreApprovalBanner({
  store,
  tone = 'light',
}: {
  store: Pick<StoreDto, 'approvalStatus' | 'approvalNote'> | null;
  tone?: 'light' | 'dark';
}) {
  const notice = storeApprovalNotice(store);
  if (!notice) return null;
  if (tone === 'dark') {
    const red = notice.tone === 'red';
    return (
      <View style={[styles.dark, { backgroundColor: red ? dark.redSoft : dark.amberSoft, borderColor: red ? dark.red : dark.amber }]} accessibilityRole="alert">
        <Text style={[styles.darkTitle, { color: red ? dark.red : dark.amber }]}>{notice.title}</Text>
        <Text style={styles.darkText}>{notice.message}</Text>
      </View>
    );
  }
  return (
    <Card highlight={notice.tone === 'red' ? colors.red : colors.orange}>
      <Subtitle style={{ color: notice.tone === 'red' ? colors.red : colors.orange }}>{notice.title}</Subtitle>
      <Muted>{notice.message}</Muted>
    </Card>
  );
}

const styles = StyleSheet.create({
  dark: { borderRadius: 16, borderWidth: 1, padding: spacing.md, gap: 4 },
  darkTitle: { fontSize: 15, fontWeight: '900' },
  darkText: { fontSize: 13.5, lineHeight: 19, color: dark.textMuted },
});
