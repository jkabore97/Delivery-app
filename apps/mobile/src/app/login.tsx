import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../components/Text';
import { router } from 'expo-router';
import { errorMessage } from '../lib/api';
import { normalizePhone } from '../lib/phone';
import { blockedAccountMessage, CLIENT_ACCOUNT_MESSAGE, SIGNUP_ROLES, type SignupRole } from '../lib/roles';
import { useAuth } from '../state/auth';
import { palette, radii, shadows, spacing } from '../theme';
import { Banner, Button, Screen } from '../components/ui';
import { Icon } from '../components/design/Icon';
import { DemoNotice } from '../components/DemoNotice';
import { Wordmark } from '../components/driver/Wordmark';
import { DEMO_OTP_CODE } from '../lib/publicConfig';
import { hideWebSplash } from '../lib/webShell';
import { useAppConfig } from '../state/config';

/**
 * Champ du numéro : indicatif « +226 » à gauche (ajouté automatiquement), champ rempli de 56 px, anneau cobalt de 2 px
 * au focus, erreur en rouge foncé dessous.
 */
function PhoneField({
  value,
  onChangeText,
  onSubmit,
  error,
}: {
  value: string;
  onChangeText: (v: string) => void;
  onSubmit: () => void;
  error: string | null;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Numéro de téléphone</Text>
      <View style={[styles.phoneBox, focused && styles.phoneBoxFocused, error ? styles.phoneBoxError : null]}>
        <View style={styles.prefix} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={styles.prefixText}>+226</Text>
        </View>
        <TextInput
          placeholder="70 12 34 56"
          placeholderTextColor={palette.inkMuted}
          selectionColor={palette.cobalt}
          keyboardType="phone-pad"
          autoComplete="tel"
          value={value}
          onChangeText={onChangeText}
          maxLength={20}
          onSubmitEditing={onSubmit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel="Numéro de téléphone"
          accessibilityHint="Indicatif +226 ajouté automatiquement"
          style={styles.phoneInput}
          testID="phone-input"
        />
      </View>
      {error ? (
        <Text style={styles.fieldError} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Connexion par téléphone + code (Cobalt). Deux profils seulement : Entreprise (demande des livraisons) et Livreur,
 * en tuiles à pictogramme. Les destinataires n'ont pas de compte : ils suivent leur colis avec le lien reçu.
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
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={styles.brand}>
          <Wordmark />
          <Text style={styles.brandSub}>Livraison · Ouagadougou</Text>
        </View>
        <View style={styles.intro}>
          <Text style={styles.title} accessibilityRole="header">
            Connexion
          </Text>
          <Text style={styles.lead}>Faites livrer vos clients en moto, vélo ou voiture, suivis en direct.</Text>
        </View>
        {notice ? <Banner message={notice} tone={notice === CLIENT_ACCOUNT_MESSAGE ? 'blue' : 'orange'} /> : null}

        <Text style={styles.sectionLabel}>Vous êtes</Text>
        <View style={styles.roles} accessibilityRole="radiogroup">
          {SIGNUP_ROLES.map((r) => {
            const selected = role === r.role;
            return (
              <Pressable
                key={r.role}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                aria-checked={selected}
                accessibilityLabel={r.label}
                accessibilityHint={r.hint}
                onPress={() => setRole(r.role)}
                style={({ pressed }) => [styles.role, selected ? styles.roleSelected : shadows.tile, pressed && styles.rolePressed]}
                testID={`role-${r.role}`}
              >
                <View style={[styles.roleDisc, selected && styles.roleDiscSelected]}>
                  <Icon name={r.icon} size={26} color={selected ? palette.white : palette.cobalt} strokeWidth={2.2} />
                </View>
                <Text style={[styles.roleLabel, selected && styles.roleLabelSelected]}>{r.label}</Text>
                <Text style={styles.roleHint}>{r.hint}</Text>
                {selected ? (
                  <View style={styles.roleCheck}>
                    <Icon name="check" size={14} color={palette.white} strokeWidth={3} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {demo ? (
          <DemoNotice
            onPick={(p, r) => {
              setPhone(p);
              setRole(r);
              setError(null);
            }}
          />
        ) : null}

        <Text style={styles.hint} testID="login-code-hint">
          {demo
            ? `Entrez votre numéro de téléphone, puis le code de démonstration ${DEMO_OTP_CODE} (aucun SMS n’est envoyé).`
            : `Entrez votre numéro de téléphone : vous recevrez un code par ${channel}.`}
        </Text>
        <PhoneField value={phone} onChangeText={setPhone} onSubmit={() => void submit()} error={error} />
        <Button
          title={demo ? 'Continuer' : 'Recevoir le code'}
          icon={(c) => <Icon name="chevronRight" size={20} color={c} strokeWidth={2.6} />}
          onPress={submit}
          loading={busy}
          disabled={phone.trim().length < 8}
          testID="login-submit"
        />

        <View style={[styles.recipient, shadows.tile]} testID="recipient-hint">
          <View style={styles.recipientDisc}>
            <Icon name="package" size={22} color={palette.cobaltText} strokeWidth={2.2} />
          </View>
          <View style={styles.recipientText}>
            <Text style={styles.recipientTitle}>Vous attendez un colis ?</Text>
            <Text style={styles.recipientBody}>Pas besoin de compte : ouvrez le lien de suivi reçu par SMS ou WhatsApp pour suivre votre livreur.</Text>
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  brand: { alignItems: 'flex-start', gap: 2, marginTop: spacing.lg },
  brandSub: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: palette.inkMuted },
  intro: { gap: 6, marginTop: spacing.sm },
  title: { fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -0.9, color: palette.ink },
  lead: { fontSize: 15, lineHeight: 21, fontWeight: '500', color: palette.inkMuted },
  sectionLabel: { fontSize: 17, lineHeight: 22, fontWeight: '800', letterSpacing: -0.2, color: palette.ink, marginTop: spacing.sm },
  roles: { flexDirection: 'row', gap: spacing.md },
  role: {
    flex: 1,
    minHeight: 132,
    borderRadius: radii.card,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: palette.card,
    padding: spacing.lg,
    gap: 4,
  },
  // Choisie : fond cobaltTint, contour cobalt de 2 px (l'état se lit aussi sans la couleur : coche).
  roleSelected: { backgroundColor: palette.cobaltTint, borderColor: palette.cobalt },
  rolePressed: { opacity: 0.9 },
  roleDisc: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.cobaltTint, marginBottom: 6 },
  roleDiscSelected: { backgroundColor: palette.cobalt },
  roleLabel: { fontSize: 17, lineHeight: 22, fontWeight: '800', color: palette.ink },
  roleLabelSelected: { color: palette.cobaltText },
  roleHint: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: palette.inkMuted },
  roleCheck: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: palette.cobalt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: palette.inkMuted, marginTop: spacing.xs },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: palette.ink },
  phoneBox: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    borderRadius: radii.input,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: palette.card,
  },
  phoneBoxFocused: { borderColor: palette.cobalt },
  phoneBoxError: { borderColor: palette.coralText },
  prefix: { alignSelf: 'stretch', justifyContent: 'center', paddingLeft: spacing.lg, paddingRight: 12, borderRightWidth: 1, borderRightColor: palette.line },
  prefixText: { fontSize: 16, lineHeight: 20, fontWeight: '700', color: palette.ink, fontVariant: ['tabular-nums'] },
  phoneInput: {
    flex: 1,
    alignSelf: 'stretch',
    paddingHorizontal: 12,
    // 16 px : en dessous, Safari sur iPhone agrandit la page au focus du champ.
    fontSize: 16,
    fontWeight: '600',
    color: palette.ink,
    fontVariant: ['tabular-nums'],
    // Pas d'anneau du navigateur : la boîte entière se cercle de cobalt au focus.
    outlineStyle: 'solid',
    outlineWidth: 0,
  },
  fieldError: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: palette.coralText },
  recipient: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: spacing.lg, borderRadius: radii.card, backgroundColor: palette.card, marginTop: spacing.sm },
  recipientDisc: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.cobaltTint },
  recipientText: { flex: 1, gap: 3 },
  recipientTitle: { fontSize: 16, lineHeight: 21, fontWeight: '800', color: palette.ink },
  recipientBody: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: palette.inkMuted },
});
