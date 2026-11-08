import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DEMO_ACCOUNTS, DEMO_OTP_CODE } from '../lib/publicConfig';
import { formatPhone } from '../lib/phone';
import { colors, radius, spacing } from '../theme';

/** Écran de connexion en mode démo (GET /config → demoMode) : code 123456 et comptes de démonstration. */
export function DemoNotice({ onPick }: { onPick: (phone: string) => void }) {
  return (
    <View style={styles.box} accessibilityRole="summary" testID="demo-notice">
      <Text style={styles.title}>Mode démo : utilisez le code {DEMO_OTP_CODE}</Text>
      <Text style={styles.sub}>Comptes de démonstration (touchez pour remplir) :</Text>
      {DEMO_ACCOUNTS.map((a) => (
        <Pressable
          key={a.phone}
          accessibilityRole="button"
          accessibilityLabel={`${a.role} ${a.label}`}
          onPress={() => onPick(a.phone)}
          style={({ pressed }) => [styles.account, pressed && { borderColor: colors.green }]}
          testID={`demo-account-${a.phone}`}
        >
          <Text style={styles.role}>
            {a.role} · {a.label}
          </Text>
          <Text style={styles.phone}>{formatPhone(`+226${a.phone}`)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#FDF0E1',
    borderColor: '#F6C891',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 6,
  },
  title: { fontWeight: '800', color: '#9A4F00', fontSize: 15 },
  sub: { color: colors.textMuted, fontSize: 13 },
  account: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    gap: spacing.sm,
  },
  role: { fontWeight: '600', color: colors.text, flexShrink: 1 },
  phone: { color: colors.textMuted },
});
