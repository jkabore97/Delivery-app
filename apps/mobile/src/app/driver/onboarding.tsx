import { useState } from 'react';
import { router } from 'expo-router';
import { plateRequired, type VehicleType } from '@yaar/shared';
import { VehiclePicker } from '../../components/VehicleOptions';
import { Banner, Button, Field, Muted, Screen, SectionTitle, Title } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { useApi } from '../../state/auth';
import { useDriver } from '../../state/driver';
import { colors } from '../../theme';

/** Étape 1 du KYC : véhicule et immatriculation (création du dossier en attente de validation). */
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
    <Screen edges={['bottom']}>
      <Title>{profile ? 'Changer de véhicule' : 'Bienvenue chez Yaar !'}</Title>
      <Muted>
        {profile
          ? 'Attention : changer de véhicule ou d’immatriculation renvoie votre dossier en vérification.'
          : 'Indiquez votre véhicule. Vous ajouterez ensuite vos pièces (CNIB, permis, carte grise, assurance, selfie).'}
      </Muted>
      <SectionTitle>Votre véhicule</SectionTitle>
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
        <Muted>Vélo : pas d’immatriculation ni de permis. Pièces demandées : CNIB et selfie.</Muted>
      ) : null}
      {error ? <Banner message={error} /> : null}
      <Button title="Continuer" color={colors.blue} onPress={save} loading={busy} disabled={!vehicle || !plateOk} />
    </Screen>
  );
}
