import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import * as Location from 'expo-location';
import { approximateZone, OUAGADOUGOU_CENTER, type AddressDto } from '@yaar/shared';
import { isPinAtDefault, PIN_NOT_PLACED_MESSAGE } from '../lib/address';
import { palette, radii, shadows, spacing } from '../theme';
import { Icon } from './design/Icon';
import { CenterPin } from './map/CenterPin';
import { PickerMap, type PickerMapHandle } from './map/PickerMap';
import { Button, Field, Muted } from './ui';

/** « Secteur Zogona » → « Zogona » (bulle de l'épingle). */
export function zoneName(p: { lat: number; lng: number }): string {
  return approximateZone(p).replace(/^Secteur\s+/, '');
}

/**
 * Choix d'une adresse sur une carte intégrée (profil de l'entreprise) : épingle fixe au centre, adresse en
 * texte libre et point de repère (indispensables à Ouagadougou). La position n'est lue qu'à la demande.
 */
export function AddressPicker({
  value,
  onChange,
  variant = 'pickup',
  mapHeight = 220,
  addressLabel = 'Adresse',
  testID,
}: {
  value: AddressDto | null;
  onChange: (a: AddressDto) => void;
  variant?: 'pickup' | 'dropoff';
  mapHeight?: number;
  addressLabel?: string;
  testID?: string;
}) {
  const mapRef = useRef<PickerMapHandle>(null);
  const [moving, setMoving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const current: AddressDto = value ?? { lat: OUAGADOUGOU_CENTER.lat, lng: OUAGADOUGOU_CENTER.lng, address: '', landmark: '' };
  const currentRef = useRef(current);
  currentRef.current = current;
  const [initialCenter] = useState(() => ({ lat: current.lat, lng: current.lng }));

  // Recentre la carte si l'adresse change de l'extérieur (formulaire rechargé).
  const lastCentered = useRef({ lat: current.lat, lng: current.lng });
  useEffect(() => {
    if (!value) return;
    const moved = Math.abs(value.lat - lastCentered.current.lat) > 1e-5 || Math.abs(value.lng - lastCentered.current.lng) > 1e-5;
    if (moved) {
      lastCentered.current = { lat: value.lat, lng: value.lng };
      mapRef.current?.centerOn(value.lat, value.lng);
    }
  }, [value]);

  const useMyPosition = async () => {
    setLocError(null);
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setLocError('Localisation refusée : déplacez la carte pour placer l’épingle.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const next = { ...currentRef.current, lat: pos.coords.latitude, lng: pos.coords.longitude };
      lastCentered.current = { lat: next.lat, lng: next.lng };
      mapRef.current?.centerOn(next.lat, next.lng, 16);
      onChange(next);
    } catch {
      setLocError('Position indisponible : déplacez la carte pour placer l’épingle.');
    } finally {
      setLocating(false);
    }
  };

  return (
    <View style={{ gap: spacing.md }} testID={testID}>
      <View style={[styles.mapWrap, { height: mapHeight }]}>
        <PickerMap
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initial={initialCenter}
          onMoveStart={() => setMoving(true)}
          onCenterChange={(lat, lng) => {
            setMoving(false);
            lastCentered.current = { lat, lng };
            onChange({ ...currentRef.current, lat, lng });
          }}
        />
        <CenterPin moving={moving} variant={variant} bubble={isPinAtDefault(current) ? null : { title: zoneName(current) }} />
        <View style={styles.locateBtn}>
          <Button
            title="Ma position"
            small
            variant="outline"
            icon={() => <Icon name="navigation" size={15} color={palette.cobalt} />}
            onPress={useMyPosition}
            loading={locating}
            style={[styles.locate, shadows.float]}
          />
        </View>
      </View>
      <Muted>Déplacez la carte pour placer l’épingle sur l’entrée exacte.</Muted>
      {locError ? (
        <Text style={styles.error} accessibilityRole="alert">
          {locError}
        </Text>
      ) : null}
      {current.address.trim() && isPinAtDefault(current) ? (
        <Text style={styles.error} testID={testID ? `${testID}-pin-warning` : undefined}>
          {PIN_NOT_PLACED_MESSAGE}
        </Text>
      ) : null}
      <Field
        label={addressLabel}
        placeholder="Quartier, rue (ex. Zogona, avenue de l’Université)"
        value={current.address}
        onChangeText={(t) => onChange({ ...current, address: t })}
        maxLength={200}
      />
      <Field
        label="Point de repère"
        placeholder="Ex. à côté de la pharmacie, portail bleu"
        value={current.landmark}
        onChangeText={(t) => onChange({ ...current, landmark: t })}
        maxLength={200}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrap: { borderRadius: radii.card, overflow: 'hidden', backgroundColor: '#F3F5F8' },
  locateBtn: { position: 'absolute', right: spacing.sm, bottom: spacing.lg + 4 },
  locate: { borderColor: palette.white },
  error: { color: palette.coralText, fontSize: 13, lineHeight: 18, fontWeight: '600' },
});
