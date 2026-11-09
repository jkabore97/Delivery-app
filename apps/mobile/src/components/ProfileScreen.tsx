import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { errorMessage } from '../lib/api';
import { formatPhone } from '../lib/phone';
import { roleLabel } from '../lib/roles';
import { useAuth } from '../state/auth';
import { palette, radii, shadows, spacing } from '../theme';
import { avatarInitials } from './map/markerArt';
import { Text } from './Text';
import { TrackingIcon } from './tracking/TrackingIcon';
import { Banner, Button, Field, Screen } from './ui';
import { confirmAsync, notify } from '../lib/dialog';

export interface ProfileScreenProps {
  /** Couleur des boutons pleins (cobalt). */
  color: string;
  /** Texte des boutons pleins de couleur `color` (blanc par défaut). */
  buttonTextColor?: string;
  /** Contenu affiché avant la carte du compte (profil de l'entreprise). */
  top?: ReactNode;
  children?: ReactNode;
  /**
   * Appelé avant la déconnexion (ex. livreur : passer hors ligne).
   * Renvoie un message pour bloquer la déconnexion, ou null pour continuer.
   */
  beforeSignOut?: () => Promise<string | null>;
}

/**
 * Profil commun aux espaces Entreprise et Livreur (Cobalt) : titre d'écran, carte blanche du compte (grande pastille
 * aux initiales, nom, téléphone et rôle), nom affiché modifiable, contenu propre à l'espace, déconnexion.
 */
export function ProfileScreen({ color, buttonTextColor, top, children, beforeSignOut }: ProfileScreenProps) {
  const { user, api, setUser, signOut } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  if (!user) return null;

  const doSignOut = async () => {
    setSigningOut(true);
    try {
      const blocked = beforeSignOut ? await beforeSignOut() : null;
      if (blocked) {
        notify('Déconnexion impossible', blocked);
        return;
      }
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      setUser(await api.updateMe(name.trim()));
      setMessage({ text: 'Nom enregistré.', ok: true });
    } catch (e) {
      setMessage({ text: errorMessage(e), ok: false });
    } finally {
      setBusy(false);
    }
  };

  const unchanged = name.trim() === (user.name ?? '').trim();

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        Mon profil
      </Text>
      {top}
      <View style={[styles.card, shadows.tile]}>
        <View style={styles.identity}>
          <View style={styles.avatar}>
            {user.name ? (
              <Text style={styles.avatarText}>{avatarInitials(user.name)}</Text>
            ) : (
              <TrackingIcon name="user" size={26} color={palette.cobaltText} />
            )}
          </View>
          <View style={styles.identityText}>
            <Text style={styles.name} numberOfLines={2}>
              {user.name ?? 'Sans nom'}
            </Text>
            <Text style={styles.meta}>
              {formatPhone(user.phone)} · {roleLabel(user.role)}
            </Text>
          </View>
        </View>
        <Field label="Nom affiché" value={name} onChangeText={setName} maxLength={80} />
        {message ? <Banner message={message.text} tone={message.ok ? 'green' : 'red'} /> : null}
        <Button
          title="Enregistrer"
          color={color}
          textColor={buttonTextColor}
          onPress={save}
          loading={busy}
          disabled={!name.trim() || unchanged}
          small
        />
      </View>
      {children}
      <Button
        title="Se déconnecter"
        variant="outline"
        icon={(c) => <TrackingIcon name="logout" size={18} color={c} strokeWidth={2.3} />}
        loading={signingOut}
        testID="signout-button"
        onPress={() =>
          void confirmAsync({
            title: 'Déconnexion',
            message: 'Voulez-vous vous déconnecter ?',
            confirmText: 'Se déconnecter',
            destructive: true,
          }).then((ok) => {
            if (ok) void doSignOut();
          })
        }
      />
      <Text style={styles.version}>Yaar Livraison · version 0.1.0 (Lot 1)</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -0.9, color: palette.ink, paddingTop: spacing.sm },
  card: { backgroundColor: palette.card, borderRadius: radii.card, padding: 20, gap: 14 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  identityText: { flex: 1, gap: 3 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: palette.cobaltTint, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontWeight: '800', color: palette.cobaltText, letterSpacing: 0.2 },
  name: { fontSize: 20, lineHeight: 26, fontWeight: '800', letterSpacing: -0.3, color: palette.ink },
  meta: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: palette.inkMuted, fontVariant: ['tabular-nums'] },
  version: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: palette.inkMuted, textAlign: 'center' },
});
