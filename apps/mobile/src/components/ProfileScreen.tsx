import { useState, type ReactNode } from 'react';
import { Alert } from 'react-native';
import { LABELS } from '@yaar/shared';
import { errorMessage } from '../lib/api';
import { formatPhone } from '../lib/phone';
import { useAuth } from '../state/auth';
import { colors } from '../theme';
import { Banner, Button, Card, Field, Muted, Screen, Subtitle, Title } from './ui';

export interface ProfileScreenProps {
  color: string;
  children?: ReactNode;
  /**
   * Appelé avant la déconnexion (ex. livreur : passer hors ligne).
   * Renvoie un message pour bloquer la déconnexion, ou null pour continuer.
   */
  beforeSignOut?: () => Promise<string | null>;
}

/** Profil commun aux trois espaces : nom, téléphone, déconnexion. */
export function ProfileScreen({ color, children, beforeSignOut }: ProfileScreenProps) {
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
        Alert.alert('Déconnexion impossible', blocked);
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
      <Card>
        <Subtitle>{user.name ?? 'Sans nom'}</Subtitle>
        <Muted>
          {formatPhone(user.phone)} · {LABELS.role[user.role]}
        </Muted>
        <Field label="Nom affiché" value={name} onChangeText={setName} maxLength={80} />
        {message ? <Banner message={message.text} tone={message.ok ? 'green' : 'red'} /> : null}
        <Button title="Enregistrer" color={color} onPress={save} loading={busy} disabled={!name.trim()} />
      </Card>
      {children}
      <Button
        title="Se déconnecter"
        variant="outline"
        loading={signingOut}
        testID="signout-button"
        onPress={() =>
          Alert.alert('Déconnexion', 'Voulez-vous vous déconnecter ?', [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Se déconnecter', style: 'destructive', onPress: () => void doSignOut() },
          ])
        }
      />
      <Muted style={{ textAlign: 'center', color: colors.textMuted }}>Yaar Livraison · version 0.1.0 (Lot 1)</Muted>
    </Screen>
  );
}
