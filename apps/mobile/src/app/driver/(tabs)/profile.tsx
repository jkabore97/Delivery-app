import { useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { LABELS } from '@yaar/shared';
import { ProfileScreen } from '../../../components/ProfileScreen';
import { Banner, Button, Card, KeyValue, Muted, Subtitle } from '../../../components/ui';
import { hasTrackingConsent, trackingConsentStatus } from '../../../lib/consent';
import { useDriver } from '../../../state/driver';
import { colors } from '../../../theme';

/** Suivi GPS : état du consentement, lecture / acceptation, retrait (hors ligne forcé). */
function TrackingConsentCard() {
  const { profile, currentOrder, openConsentPrompt, withdrawTrackingConsent, consentBusy } = useDriver();
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  if (!profile) return null;
  const consented = hasTrackingConsent(profile);

  const withdraw = () => {
    Alert.alert(
      'Retirer votre consentement ?',
      'Vous passerez immédiatement hors ligne, votre dernière position sera effacée et vous ne recevrez plus de courses tant que vous n’aurez pas de nouveau accepté le suivi.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: async () => {
            setMessage(null);
            const err = await withdrawTrackingConsent();
            setMessage(err ? { text: err, ok: false } : { text: 'Consentement retiré : vous êtes hors ligne.', ok: true });
          },
        },
      ],
    );
  };

  return (
    <Card>
      <Subtitle>📍 Suivi GPS</Subtitle>
      <KeyValue label="Consentement" value={trackingConsentStatus(profile)} />
      <Muted>
        Position collectée uniquement en ligne ou pendant une course, partagée avec le client pendant sa livraison et avec
        les contrôleurs Yaar, conservée 12 mois.
      </Muted>
      {message ? <Banner message={message.text} tone={message.ok ? 'green' : 'red'} /> : null}
      {consented ? (
        <Button
          title="Retirer mon consentement"
          variant="outline"
          onPress={withdraw}
          loading={consentBusy}
          disabled={currentOrder !== null}
          testID="withdraw-consent"
        />
      ) : (
        <Button
          title="Lire et accepter le suivi"
          color={colors.blue}
          onPress={() => {
            setMessage(null);
            openConsentPrompt(false);
          }}
          testID="open-consent"
        />
      )}
      {consented && currentOrder ? <Muted>Terminez la course en cours avant de retirer votre consentement.</Muted> : null}
    </Card>
  );
}

export default function DriverProfile() {
  const { profile, currentOrder, setOnline } = useDriver();
  // Un livreur qui se déconnecte doit d'abord passer hors ligne : sinon le serveur continue
  // de lui proposer des courses et garde sa dernière position comme s'il était en ligne.
  const beforeSignOut = async (): Promise<string | null> => {
    if (currentOrder) return 'Terminez la course en cours avant de vous déconnecter.';
    if (profile?.isOnline) {
      const err = await setOnline(false);
      if (err) return `Impossible de passer hors ligne : ${err}`;
    }
    return null;
  };
  return (
    <ProfileScreen color={colors.blue} beforeSignOut={beforeSignOut}>
      {profile ? (
        <Card>
          <KeyValue label="Statut" value={LABELS.driverStatus[profile.status]} />
          <KeyValue label="Véhicule" value={`${LABELS.vehicleType[profile.vehicleType]}${profile.plate ? ` · ${profile.plate}` : ''}`} />
          <KeyValue
            label="Note moyenne"
            value={profile.ratingAvg !== null ? `⭐ ${profile.ratingAvg.toFixed(1).replace('.', ',')} (${profile.ratingCount})` : '—'}
          />
        </Card>
      ) : null}
      <TrackingConsentCard />
      <Button title="🧾 Historique de mes courses" variant="outline" onPress={() => router.push('/driver/history')} />
    </ProfileScreen>
  );
}
