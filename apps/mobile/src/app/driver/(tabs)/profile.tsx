import { router } from 'expo-router';
import { LABELS } from '@yaar/shared';
import { ProfileScreen } from '../../../components/ProfileScreen';
import { Button, Card, KeyValue } from '../../../components/ui';
import { useDriver } from '../../../state/driver';
import { colors } from '../../../theme';

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
      <Button title="🧾 Historique de mes courses" variant="outline" onPress={() => router.push('/driver/history')} />
    </ProfileScreen>
  );
}
