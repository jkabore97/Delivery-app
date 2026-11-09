import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Text } from '../components/Text';
import { Icon } from '../components/design/Icon';
import { MapIconButton } from '../components/design/Pill';
import { CodeInput } from '../components/driver/CodeInput';
import { Banner, Button, Field, Screen } from '../components/ui';
import { errorMessage } from '../lib/api';
import { formatPhone } from '../lib/phone';
import { blockedAccountMessage, homePathForRole, isSignupRole, SIGNUP_ROLES } from '../lib/roles';
import { DEMO_OTP_CODE } from '../lib/publicConfig';
import { hideWebSplash } from '../lib/webShell';
import { useAuth } from '../state/auth';
import { useAppConfig } from '../state/config';
import { palette, radii, shadows, spacing } from '../theme';

const OTP_LENGTH = 6;

/** Code de vérification (Cobalt) : 6 cases (collage et code reçu par SMS acceptés), nom facultatif, « Valider ». */
export default function VerifyScreen() {
  const params = useLocalSearchParams<{ phone: string; role?: string }>();
  const phone = params.phone;
  // Profil choisi sur l'écran précédent ; jamais « client » (pas d'inscription client).
  const role = isSignupRole(params.role) ? params.role : 'SELLER';
  const roleInfo = SIGNUP_ROLES.find((r) => r.role === role)!;
  const { api, signIn, signOut } = useAuth();
  const { config } = useAppConfig();
  const demo = config?.demoMode === true;
  const channel = config?.otpChannel === 'whatsapp' ? 'WhatsApp' : 'SMS';
  // Mode démo : le code 123456 est accepté pour tous les numéros, on le pré-remplit.
  const [code, setCode] = useState(demo ? DEMO_OTP_CODE : '');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => hideWebSplash(), []);

  if (!phone) return <Redirect href="/login" />;

  const submit = async () => {
    if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code)) {
      setError('Le code comporte 6 chiffres.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const auth = await api.verifyOtp({ phone, code, role, ...(name.trim() ? { name: name.trim() } : {}) });
      const blocked = blockedAccountMessage(auth.user.role);
      if (blocked) {
        // Compte client (ancien modèle) ou de console : rien à faire dans l'application.
        await signOut(blocked);
        router.replace('/login');
        return;
      }
      await signIn(auth);
      router.replace(homePathForRole(auth.user.role));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    try {
      await api.requestOtp(phone);
      setInfo('Nouveau code envoyé.');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={styles.top}>
          <MapIconButton icon="back" onPress={() => router.back()} accessibilityLabel="Changer de numéro" />
        </View>
        <View style={styles.intro}>
          <Text style={styles.title} accessibilityRole="header">
            Code de vérification
          </Text>
          {demo ? null : (
            <Text style={styles.lead}>
              Saisissez le code reçu par {channel} au <Text style={styles.phone}>{formatPhone(phone)}</Text>.
            </Text>
          )}
        </View>
        {demo ? (
          <Banner
            message={`Mode démo : le code ${DEMO_OTP_CODE} est accepté (déjà saisi). C’est le code de démonstration : aucun SMS n’est envoyé.`}
            tone="blue"
          />
        ) : null}

        <View style={[styles.card, shadows.tile]}>
          <Text style={styles.cardLabel}>Code à 6 chiffres</Text>
          <CodeInput
            value={code}
            onChangeText={(t) => {
              setCode(t);
              if (error) setError(null);
            }}
            length={OTP_LENGTH}
            autoFocus={!demo}
            oneTimeCode
            error={!!error}
            onSubmit={() => void submit()}
            accessibilityLabel="Code à 6 chiffres"
            testID="otp-input"
          />
          {__DEV__ ? <Text style={styles.devNote}>Développement : le code 123456 est accepté si l’API a OTP_DEV_BYPASS=true.</Text> : null}
        </View>
        {error ? <Banner message={error} /> : null}
        {info ? <Banner message={info} tone="green" /> : null}

        <View style={[styles.card, shadows.tile]}>
          <View style={styles.signup} testID="signup-role">
            <View style={styles.signupDisc}>
              <Icon name={roleInfo.icon} size={20} color={palette.cobaltText} strokeWidth={2.2} />
            </View>
            <Text style={styles.signupText}>
              Première connexion ? Un compte <Text style={styles.signupStrong}>{roleInfo.label}</Text> sera créé pour ce numéro (ignoré si vous avez
              déjà un compte).
            </Text>
          </View>
          <Field
            label="Votre nom (facultatif)"
            placeholder={role === 'SELLER' ? 'Ex. Awa Ouédraogo (gérante)' : 'Ex. Issouf Sawadogo'}
            value={name}
            onChangeText={setName}
            maxLength={80}
          />
        </View>

        <Button title="Valider" onPress={submit} loading={busy} disabled={code.length !== OTP_LENGTH} testID="verify-submit" />
        <View style={styles.links}>
          {demo ? null : <Button title="Renvoyer le code" variant="ghost" onPress={resend} small />}
          <Button title="Changer de numéro ou de profil" variant="ghost" color={palette.inkMuted} onPress={() => router.back()} small />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', marginTop: spacing.xs },
  intro: { gap: 6 },
  title: { fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -0.9, color: palette.ink },
  lead: { fontSize: 15, lineHeight: 21, fontWeight: '500', color: palette.inkMuted },
  phone: { fontWeight: '700', color: palette.ink, fontVariant: ['tabular-nums'] },
  card: { backgroundColor: palette.card, borderRadius: radii.card, padding: 20, gap: 14 },
  cardLabel: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: palette.ink },
  devNote: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: palette.inkMuted },
  signup: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  signupDisc: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.cobaltTint },
  signupText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '500', color: palette.inkMuted },
  signupStrong: { fontWeight: '800', color: palette.ink },
  links: { alignItems: 'center', gap: 2 },
});
