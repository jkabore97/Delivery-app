import { router } from 'expo-router';
import { ProfileScreen } from '../../../components/ProfileScreen';
import { Button } from '../../../components/ui';
import { colors } from '../../../theme';

export default function ClientProfile() {
  return (
    <ProfileScreen color={colors.green}>
      <Button title="📍 Mes adresses enregistrées" variant="outline" onPress={() => router.push('/client/addresses')} />
    </ProfileScreen>
  );
}
