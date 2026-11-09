import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { router } from 'expo-router';
import { errorMessage } from '../lib/api';
import { normalizePhone } from '../lib/phone';
import { blockedAccountMessage, CLIENT_ACCOUNT_MESSAGE, SIGNUP_ROLES, type SignupRole } from '../lib/roles';
import { useAuth } from '../state/auth';
import { colors, radius, roleColor, spacing } from '../theme';
import { Banner, Button, Field, Muted, Screen, SectionTitle, Title } from '../components/ui';
import { DemoNotice } from '../components/DemoNotice';
import { DEMO_OTP_CODE } from '../lib/publicConfig';
import { hideWebSplash } from '../lib/webShell';
import { useAppConfig } from '../state/config';

/**
 * Connexion par téléphone + code. Deux profils seulement : Entreprise (demande des livraisons) et Livreur.
 * Les destinataires n'ont pas de compte : ils suivent leur colis avec le lien reçu.
 */
export default function LoginScreen() {
  const { api, notice, status, user, signOut } = useAuth();
  const { config } = useAppConfig();
  const demo = config?.demoMode === true;
  const channel = config?.otpChannel === 'whatsapp' ? 'WhatsApp' : 'SMS';
  const [role, setRole] = useState<SignupRole>('SELLER');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => hideWebSplash(), []);

  // Session d'un compte sans espace dans l'application (ancien compte client, console) : déconnexion expliquée.
  useEffect(() => {
    if (status !== 'signedIn' || !user) return;
    const blocked = blockedAccountMessage(user.role);
    if (blocked) void signOut(blocked);
  }, [status, user, signOut]);

  const submit = async () => {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setError('Numéro invalide : 8 chiffres (ex. 70 12 34 56).');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      // Démonstration : aucun code n'est envoyé (le code de démonstration est toujours accepté). Ne pas en demander
      // évite la limite de 5 codes par heure et par numéro sur les comptes de démonstration partagés.
      if (!demo) await api.requestOtp(normalized);
      router.push({ pathname: '/verify', params: { phone: normalized, role } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={styles.brand}>
          <Text style={styles.logo}>Yaar</Text>
          <Text style={styles.logoSub}>Livraison · Ouagadougou</Text>
          <Muted style={{ textAlign: 'center' }}>Faites livrer vos clients en moto, vélo ou voiture, suivis en direct.</Muted>
        </View>
        <Title>Connexion</Title>
        {notice ? (
          <Banner message={notice} tone={notice === CLIENT_ACCOUNT_MESSAGE ? 'green' : 'orange'} />
        ) : null}
        <SectionTitle>Vous êtes</SectionTitle>
        <View style={styles.roles} accessibilityRole="radiogroup">
          {SIGNUP_ROLES.map((r) => {
            const selected = role === r.role;
            const color = roleColor[r.role];
            return (
              <Pressable
                key={r.role}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={r.label}
                onPress={() => setRole(r.role)}
                style={[styles.role, selected && { borderColor: color, backgroundColor: r.role === 'SELLER' ? colors.orangeLight : colors.blueLight }]}
                testID={`role-${r.role}`}
              >
                <Text style={styles.roleEmoji}>{r.emoji}</Text>
                <Text style={[styles.roleLabel, selected && { color }]}>{r.label}</Text>
                <Text style={styles.roleHint}>{r.hint}</Text>
              </Pressable>
            );
          })}
        </View>
        {config?.demoMode ? (
          <DemoNotice
            onPick={(p, r) => {
              setPhone(p);
              setRole(r);
              setError(null);
            }}
          />
        ) : null}
        <Muted testID="login-code-hint">
          {demo
            ? `Entrez votre numéro de téléphone, puis le code de démonstration ${DEMO_OTP_CODE} (aucun SMS n’est envoyé).`
            : `Entrez votre numéro de téléphone : vous recevrez un code par ${channel}.`}
        </Muted>
        <Field
          label="Numéro de téléphone"
          placeholder="70 12 34 56"
          keyboardType="phone-pad"
          autoComplete="tel"
          value={phone}
          onChangeText={setPhone}
          error={error}
          maxLength={20}
          onSubmitEditing={submit}
          testID="phone-input"
        />
        <Button
          title={demo ? 'Continuer' : 'Recevoir le code'}
          color={roleColor[role]}
          onPress={submit}
          loading={busy}
          disabled={phone.trim().length < 8}
          testID="login-submit"
        />
        <Muted style={{ textAlign: 'center' }}>Indicatif +226 (Burkina Faso) ajouté automatiquement.</Muted>
        <View style={styles.recipient} testID="recipient-hint">
          <Text style={styles.recipientTitle}>📦 Vous attendez un colis ?</Text>
          <Muted>Pas besoin de compte : ouvrez le lien de suivi reçu par SMS ou WhatsApp pour suivre votre livreur.</Muted>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.sm, gap: 4 },
  logo: { fontSize: 44, fontWeight: '900', color: colors.green },
  logoSub: { fontSize: 14, color: colors.orange, fontWeight: '700' },
  roles: { flexDirection: 'row', gap: spacing.sm },
  role: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  roleEmoji: { fontSize: 28 },
  roleLabel: { fontSize: 16, fontWeight: '900', color: colors.text },
  roleHint: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  recipient: { backgroundColor: colors.greenLight, borderRadius: radius.lg, padding: spacing.md, gap: 4 },
  recipientTitle: { fontWeight: '800', color: colors.green, fontSize: 15 },
});
