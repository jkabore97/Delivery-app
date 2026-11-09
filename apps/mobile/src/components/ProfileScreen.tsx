import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { errorMessage } from '../lib/api';
import { formatPhone } from '../lib/phone';
import { roleLabel } from '../lib/roles';
import { useAuth } from '../state/auth';
import { palette } from '../theme';
import { avatarInitials } from './map/markerArt';
import { Text } from './Text';
import { TrackingIcon } from './tracking/TrackingIcon';
import { Banner, Button, Card, Field, Muted, Screen, Subtitle, Title } from './ui';
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
 * Profil commun aux espaces Entreprise et Livreur (Cobalt) : pastille aux initiales, nom, téléphone et rôle, nom
 * affiché modifiable, déconnexion.
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

  return (
    <Screen>
      <Title>Mon profil</Title>
      {top}
      <Card>
        <View style={styles.identity}>
          <View style={styles.avatar}>
            {user.name ? (
              <Text style={styles.avatarText}>{avatarInitials(user.name)}</Text>
            ) : (
              <TrackingIcon name="user" size={22} color={palette.cobaltText} />
            )}
          </View>
          <View style={styles.identityText}>
            <Subtitle>{user.name ?? 'Sans nom'}</Subtitle>
            <Muted>
              {formatPhone(user.phone)} · {roleLabel(user.role)}
            </Muted>
          </View>
        </View>
        <Field label="Nom affiché" value={name} onChangeText={setName} maxLength={80} />
        {message ? <Banner message={message.text} tone={message.ok ? 'green' : 'red'} /> : null}
        <Button title="Enregistrer" color={color} textColor={buttonTextColor} onPress={save} loading={busy} disabled={!name.trim()} />
      </Card>
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
      <Muted style={styles.version}>Yaar Livraison · version 0.1.0 (Lot 1)</Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 4 },
  identityText: { flex: 1, gap: 2 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: palette.cobaltTint, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '800', color: palette.cobaltText, letterSpacing: 0.2 },
  version: { textAlign: 'center' },
});
