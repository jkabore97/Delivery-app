import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { plateRequired, type VehicleType } from '@yaar/shared';
import { Text } from '../../components/Text';
import { Icon } from '../../components/design/Icon';
import { ScreenHeader, SurfaceScreen } from '../../components/design/Surfaces';
import { ScreenTitle, WhiteCard } from '../../components/driver/DriverKit';
import { VehiclePicker } from '../../components/VehicleOptions';
import { Banner, Button, Field } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { useApi } from '../../state/auth';
import { useDriver } from '../../state/driver';
import { palette, spacing } from '../../theme';

/** Les trois étapes de l'inscription du livreur (la première est celle de cet écran). */
const STEPS = ['Véhicule', 'Pièces', 'Validation'] as const;

/** Étape 1 du KYC (Cobalt) : véhicule et immatriculation (création du dossier en attente de validation). */
export default function DriverOnboarding() {
  const api = useApi();
  const { profile, setProfile } = useDriver();
  const [vehicle, setVehicle] = useState<VehicleType | null>(profile?.vehicleType ?? null);
  const [plate, setPlate] = useState(profile?.plate ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsPlate = vehicle ? plateRequired(vehicle) : false;
  const plateOk = !needsPlate || plate.trim().length >= 4;

  const save = async () => {
    if (!vehicle || !plateOk) return;
    setBusy(true);
    setError(null);
    try {
      const p = await api.saveDriverProfile({ vehicleType: vehicle, ...(needsPlate ? { plate: plate.trim() } : {}) });
      setProfile(p);
      router.replace('/driver/documents');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SurfaceScreen
      edges={['top', 'bottom']}
      header={profile && router.canGoBack() ? <ScreenHeader title="" onBack={() => router.back()} /> : null}
      footer={<Button title="Continuer" onPress={save} loading={busy} disabled={!vehicle || !plateOk} testID="onboarding-continue" />}
    >
      {profile ? null : (
        <View style={styles.steps} accessibilityLabel="Étape 1 sur 3 : véhicule">
          {STEPS.map((s, i) => (
            <View key={s} style={styles.step}>
              <View style={[styles.stepBar, i === 0 && styles.stepBarNow]} />
              <Text style={[styles.stepLabel, i === 0 && styles.stepLabelNow]}>{s}</Text>
            </View>
          ))}
        </View>
      )}
      <ScreenTitle
        title={profile ? 'Changer de véhicule' : 'Bienvenue chez Yaar !'}
        subtitle={
          profile
            ? 'Attention : changer de véhicule ou d’immatriculation renvoie votre dossier en vérification.'
            : 'Indiquez votre véhicule. Vous ajouterez ensuite vos pièces (CNIB, permis, carte grise, assurance, selfie).'
        }
      />
      <WhiteCard>
        <Text style={styles.section}>Votre véhicule</Text>
        <VehiclePicker selected={vehicle} onSelect={setVehicle} />
        {needsPlate ? (
          <Field
            label="Immatriculation"
            placeholder="11 JJ 4521"
            autoCapitalize="characters"
            value={plate}
            onChangeText={setPlate}
            maxLength={15}
            error={plate && !plateOk ? 'Immatriculation trop courte.' : null}
          />
        ) : vehicle === 'BIKE' ? (
          <View style={styles.bike}>
            <Icon name="info" size={18} color={palette.cobaltText} strokeWidth={2.4} />
            <Text style={styles.bikeText}>Vélo : pas d’immatriculation ni de permis. Pièces demandées : CNIB et selfie.</Text>
          </View>
        ) : null}
      </WhiteCard>
      {error ? <Banner message={error} /> : null}
    </SurfaceScreen>
  );
}

const styles = StyleSheet.create({
  steps: { flexDirection: 'row', gap: 6, marginTop: spacing.sm },
  step: { flex: 1, gap: 8 },
  stepBar: { height: 8, borderRadius: 4, backgroundColor: palette.raisedHigh },
  stepBarNow: { backgroundColor: palette.cobalt },
  stepLabel: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: palette.inkMuted },
  stepLabelNow: { color: palette.cobaltText, fontWeight: '800' },
  section: { fontSize: 17, lineHeight: 22, fontWeight: '800', color: palette.ink },
  bike: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 16, backgroundColor: palette.cobaltTint },
  bikeText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600', color: palette.cobaltText },
});
