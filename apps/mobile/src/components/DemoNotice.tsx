import { Pressable, StyleSheet, View } from 'react-native';
import { DEMO_DATA_WARNING } from '@yaar/shared';
import { DEMO_ACCOUNTS, DEMO_OTP_CODE } from '../lib/publicConfig';
import { formatPhone } from '../lib/phone';
import { palette, radii, shadows, spacing } from '../theme';
import { Text } from './Text';
import { TrackingIcon } from './tracking/TrackingIcon';

/**
 * Écran de connexion en mode démo (GET /config → demoMode), carte blanche Cobalt : code 123456 (bandeau cobalt doux),
 * avertissement « démonstration publique » (pictogramme d'alerte, rouge foncé) et comptes de démonstration
 * (entreprises et livreurs) en lignes remplies à toucher pour remplir le numéro.
 */
export function DemoNotice({ onPick }: { onPick: (phone: string, role: 'SELLER' | 'DRIVER') => void }) {
  return (
    <View style={[styles.card, shadows.tile]} accessibilityRole="summary" testID="demo-notice">
      <View style={styles.codeRow}>
        <View style={styles.codeDisc}>
          <TrackingIcon name="info" size={18} color={palette.cobaltText} strokeWidth={2.4} />
        </View>
        <Text style={styles.title}>Mode démo : utilisez le code {DEMO_OTP_CODE}</Text>
      </View>
      <DemoDataWarning />
      <Text style={styles.sub}>Comptes de démonstration (touchez pour remplir) :</Text>
      <View style={styles.accounts}>
        {DEMO_ACCOUNTS.map((a) => (
          <Pressable
            key={a.phone}
            accessibilityRole="button"
            accessibilityLabel={`${a.role} ${a.label}`}
            onPress={() => onPick(a.phone, a.signupRole)}
            style={({ pressed }) => [styles.account, pressed && styles.accountPressed]}
            testID={`demo-account-${a.phone}`}
          >
            <View style={styles.accountIcon}>
              <TrackingIcon name={a.signupRole === 'DRIVER' ? 'moto' : 'store'} size={18} color={palette.cobalt} strokeWidth={2.2} />
            </View>
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
    </View>
  );
}

/** « Démonstration publique : n'utilisez pas de vraies pièces d'identité… » (connexion, pièces KYC), pictogramme dessiné. */
export function DemoDataWarning() {
  return (
    <View style={styles.warningRow} testID="demo-data-warning">
      <TrackingIcon name="alert" size={18} color={palette.coralText} strokeWidth={2.4} />
      <Text style={styles.warning}>{DEMO_DATA_WARNING}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: palette.card, borderRadius: radii.card, padding: spacing.lg, gap: 12 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  codeDisc: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.cobaltTint },
  title: { flex: 1, fontWeight: '800', color: palette.ink, fontSize: 16, lineHeight: 21, fontVariant: ['tabular-nums'] },
  warningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: radii.banner, backgroundColor: palette.coralTint },
  warning: { flex: 1, color: palette.coralText, fontWeight: '600', fontSize: 13, lineHeight: 18 },
  sub: { color: palette.inkMuted, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  accounts: { gap: 8 },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    backgroundColor: palette.raised,
    borderRadius: 16,
    paddingLeft: 8,
    paddingRight: 14,
    paddingVertical: 8,
    gap: 10,
  },
  accountPressed: { backgroundColor: palette.cobaltTint },
  accountIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.white },
  role: { flex: 1, fontWeight: '600', fontSize: 14, lineHeight: 19, color: palette.ink },
  phone: { flexShrink: 0, color: palette.inkMuted, fontSize: 13, lineHeight: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
