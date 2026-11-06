import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { errorMessage } from '../lib/api';
import { normalizePhone } from '../lib/phone';
import { useAuth } from '../state/auth';
import { colors, spacing } from '../theme';
import { Banner, Button, Field, Muted, Screen, Title } from '../components/ui';

export default function LoginScreen() {
  const { api, notice } = useAuth();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setError('Numéro invalide : 8 chiffres (ex. 70 12 34 56).');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.requestOtp(normalized);
      router.push({ pathname: '/verify', params: { phone: normalized } });
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
        </View>
        <Title>Connexion</Title>
        <Muted>Entrez votre numéro de téléphone : vous recevrez un code par SMS.</Muted>
        {notice ? <Banner message={notice} tone="orange" /> : null}
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
        <Button title="Recevoir le code" onPress={submit} loading={busy} disabled={phone.trim().length < 8} />
        <Muted style={{ textAlign: 'center' }}>Indicatif +226 (Burkina Faso) ajouté automatiquement.</Muted>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', marginVertical: spacing.xl },
  logo: { fontSize: 44, fontWeight: '900', color: colors.green },
  logoSub: { fontSize: 14, color: colors.orange, fontWeight: '700' },
});
