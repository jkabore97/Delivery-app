import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import type { SelfSignupRole } from '@yaar/shared';
import { errorMessage } from '../lib/api';
import { formatPhone } from '../lib/phone';
import { BACK_OFFICE_MESSAGE, homePathForRole, spaceForRole } from '../lib/roles';
import { DEMO_OTP_CODE } from '../lib/publicConfig';
import { useAuth } from '../state/auth';
import { useAppConfig } from '../state/config';
import { colors, roleColor } from '../theme';
import { Banner, Button, Chip, Field, Muted, Row, Screen, SectionTitle, Title } from '../components/ui';

const ROLE_CHOICES: { role: SelfSignupRole; label: string }[] = [
  { role: 'CLIENT', label: 'Je suis client' },
  { role: 'SELLER', label: 'Je suis vendeur' },
  { role: 'DRIVER', label: 'Je suis livreur' },
];

export default function VerifyScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { api, signIn, signOut } = useAuth();
  const { config } = useAppConfig();
  const demo = config?.demoMode === true;
  const channel = config?.otpChannel === 'whatsapp' ? 'WhatsApp' : 'SMS';
  // Mode démo : le code 123456 est accepté pour tous les numéros, on le pré-remplit.
  const [code, setCode] = useState(demo ? DEMO_OTP_CODE : '');
  const [role, setRole] = useState<SelfSignupRole>('CLIENT');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      if (!spaceForRole(auth.user.role)) {
        await signOut(BACK_OFFICE_MESSAGE);
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
        <Banner message={`Mode démo : le code ${DEMO_OTP_CODE} est accepté (déjà saisi).`} tone="orange" />
      ) : (
        <Muted>
          Code envoyé par {channel} au {formatPhone(phone)}.
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

      <SectionTitle>Première connexion ?</SectionTitle>
      <Muted>Choisissez votre profil (ignoré si vous avez déjà un compte).</Muted>
      <Row style={{ flexWrap: 'wrap' }}>
        {ROLE_CHOICES.map((c) => (
          <Chip
            key={c.role}
            label={c.label}
            selected={role === c.role}
            color={roleColor[c.role]}
            onPress={() => setRole(c.role)}
          />
        ))}
      </Row>
      <Field label="Votre nom (facultatif)" placeholder="Ex. Aminata K." value={name} onChangeText={setName} maxLength={80} />

      {error ? <Banner message={error} /> : null}
      {info ? <Banner message={info} tone="green" /> : null}
      <Button title="Valider" onPress={submit} loading={busy} disabled={code.length !== 6} />
      <View style={{ alignItems: 'center' }}>
        <Button title="Renvoyer le code" variant="ghost" color={colors.green} onPress={resend} small />
        <Button title="Changer de numéro" variant="ghost" color={colors.textMuted} onPress={() => router.back()} small />
      </View>
    </Screen>
  );
}
