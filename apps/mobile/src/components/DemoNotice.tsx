import { Pressable, StyleSheet, View } from 'react-native';
import { DEMO_DATA_WARNING } from '@yaar/shared';
import { DEMO_ACCOUNTS, DEMO_OTP_CODE } from '../lib/publicConfig';
import { formatPhone } from '../lib/phone';
import { palette, radii, spacing } from '../theme';
import { Text } from './Text';
import { TrackingIcon } from './tracking/TrackingIcon';

/**
 * Écran de connexion en mode démo (GET /config → demoMode) : code 123456, avertissement « démonstration
 * publique » et comptes de démonstration (entreprises et livreurs), dans un bandeau soleil doux.
 */
export function DemoNotice({ onPick }: { onPick: (phone: string, role: 'SELLER' | 'DRIVER') => void }) {
  return (
    <View style={styles.box} accessibilityRole="summary" testID="demo-notice">
      <Text style={styles.title}>Mode démo : utilisez le code {DEMO_OTP_CODE}</Text>
      <DemoDataWarning />
      <Text style={styles.sub}>Comptes de démonstration (touchez pour remplir) :</Text>
      {DEMO_ACCOUNTS.map((a) => (
        <Pressable
          key={a.phone}
          accessibilityRole="button"
          accessibilityLabel={`${a.role} ${a.label}`}
          onPress={() => onPick(a.phone, a.signupRole)}
          style={({ pressed }) => [styles.account, pressed && styles.accountPressed]}
          testID={`demo-account-${a.phone}`}
        >
          <Text style={styles.role}>
            {a.role} · {a.label}
          </Text>
          {/* Numéro jamais coupé : le libellé passe à la ligne à sa place. */}
          <Text style={styles.phone} numberOfLines={1}>
            {formatPhone(`+226${a.phone}`)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** « Démonstration publique : n'utilisez pas de vraies pièces d'identité… » (connexion, pièces KYC), pictogramme dessiné. */
export function DemoDataWarning() {
  return (
    <View style={styles.warningRow} testID="demo-data-warning">
      <TrackingIcon name="alert" size={16} color={palette.coralText} strokeWidth={2.4} />
      <Text style={styles.warning}>{DEMO_DATA_WARNING}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: palette.sunTint,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: 8,
  },
  title: { fontWeight: '800', color: palette.sunText, fontSize: 15, lineHeight: 20 },
  warningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  warning: { flex: 1, color: palette.coralText, fontWeight: '600', fontSize: 13, lineHeight: 18 },
  sub: { color: palette.inkMuted, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  account: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
    backgroundColor: palette.white,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: spacing.sm,
  },
  accountPressed: { backgroundColor: palette.cobaltTint },
  role: { flexShrink: 1, fontWeight: '600', fontSize: 14, lineHeight: 19, color: palette.ink },
  phone: { flexShrink: 0, color: palette.inkMuted, fontSize: 13, lineHeight: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
