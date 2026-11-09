import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { errorMessage } from '../lib/api';
import { formatPhone } from '../lib/phone';
import { blockedAccountMessage, homePathForRole, isSignupRole, SIGNUP_ROLES } from '../lib/roles';
import { DEMO_OTP_CODE } from '../lib/publicConfig';
import { useAuth } from '../state/auth';
import { useAppConfig } from '../state/config';
import { colors, roleColor } from '../theme';
import { Banner, Button, Field, Muted, Screen, Title } from '../components/ui';
import { hideWebSplash } from '../lib/webShell';

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
    if (!/^\d{6}$/.test(code)) {
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
    <Screen>
      <Title>Code de vérification</Title>
      {demo ? (
        <Banner message={`Mode démo : le code ${DEMO_OTP_CODE} est accepté (déjà saisi). C’est le code de démonstration : aucun SMS n’est envoyé.`} tone="orange" />
      ) : (
        <Muted>
          Saisissez le code reçu par {channel} au {formatPhone(phone)}.
        </Muted>
      )}
      <Field
        label="Code à 6 chiffres"
        placeholder="••••••"
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
        maxLength={6}
        style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center' }}
        testID="otp-input"
      />
      {__DEV__ ? <Muted>Développement : le code 123456 est accepté si l’API a OTP_DEV_BYPASS=true.</Muted> : null}

      <View testID="signup-role">
        <Muted>
          Première connexion ? Un compte {roleInfo.emoji} {roleInfo.label} sera créé pour ce numéro (ignoré si vous avez déjà un
          compte).
        </Muted>
      </View>
      <Field
        label="Votre nom (facultatif)"
        placeholder={role === 'SELLER' ? 'Ex. Awa Ouédraogo (gérante)' : 'Ex. Issouf Sawadogo'}
        value={name}
        onChangeText={setName}
        maxLength={80}
      />

      {error ? <Banner message={error} /> : null}
      {info ? <Banner message={info} tone="green" /> : null}
      <Button title="Valider" color={roleColor[role]} onPress={submit} loading={busy} disabled={code.length !== 6} />
      <View style={{ alignItems: 'center' }}>
        {demo ? null : <Button title="Renvoyer le code" variant="ghost" color={colors.green} onPress={resend} small />}
        <Button title="Changer de numéro ou de profil" variant="ghost" color={colors.textMuted} onPress={() => router.back()} small />
      </View>
    </Screen>
  );
}
