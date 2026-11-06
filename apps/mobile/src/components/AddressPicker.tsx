import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { OUAGADOUGOU_CENTER, type AddressDto } from '@yaar/shared';
import { colors, radius, spacing } from '../theme';
import { isPinAtDefault, PIN_NOT_PLACED_MESSAGE } from '../lib/address';
import { Button, Field, Muted } from './ui';

const DEFAULT_DELTA = 0.02;

export function regionFor(lat: number, lng: number, delta = DEFAULT_DELTA): Region {
  return { latitude: lat, longitude: lng, latitudeDelta: delta, longitudeDelta: delta };
}

/**
 * Choix d'une adresse : épingle fixe au centre de la carte (on déplace la carte), adresse en texte libre
 * et point de repère (indispensable à Ouagadougou où beaucoup de rues n'ont pas de nom).
 * La position du client n'est lue qu'à sa demande (« Ma position ») et n'est jamais envoyée en dehors d'une commande.
 */
export function AddressPicker({
  value,
  onChange,
  pinColor = colors.green,
  mapHeight = 220,
  addressLabel = 'Adresse',
  testID,
}: {
  value: AddressDto | null;
  onChange: (a: AddressDto) => void;
  pinColor?: string;
  mapHeight?: number;
  addressLabel?: string;
  testID?: string;
}) {
  const mapRef = useRef<MapView>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const current: AddressDto = value ?? {
    lat: OUAGADOUGOU_CENTER.lat,
    lng: OUAGADOUGOU_CENTER.lng,
    address: '',
    landmark: '',
  };
  const currentRef = useRef(current);
  currentRef.current = current;
  const [initialRegion] = useState(() => regionFor(current.lat, current.lng));

  // Recentre la carte si l'adresse change de l'extérieur (adresse enregistrée choisie).
  const lastCentered = useRef({ lat: current.lat, lng: current.lng });
  useEffect(() => {
    if (!value) return;
    const moved =
      Math.abs(value.lat - lastCentered.current.lat) > 1e-5 || Math.abs(value.lng - lastCentered.current.lng) > 1e-5;
    if (moved) {
      lastCentered.current = { lat: value.lat, lng: value.lng };
      mapRef.current?.animateToRegion(regionFor(value.lat, value.lng), 400);
    }
  }, [value]);

  const useMyPosition = async () => {
    setLocError(null);
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setLocError('Localisation refusée : déplacez la carte pour placer l’épingle.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const next = { ...currentRef.current, lat: pos.coords.latitude, lng: pos.coords.longitude };
      lastCentered.current = { lat: next.lat, lng: next.lng };
      mapRef.current?.animateToRegion(regionFor(next.lat, next.lng, 0.01), 400);
      onChange(next);
    } catch {
      setLocError('Position indisponible.');
    } finally {
      setLocating(false);
    }
  };

  return (
    <View style={{ gap: spacing.md }} testID={testID}>
      <View style={[styles.mapWrap, { height: mapHeight }]}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={initialRegion}
          onRegionChangeComplete={(r) => {
            lastCentered.current = { lat: r.latitude, lng: r.longitude };
            onChange({ ...currentRef.current, lat: r.latitude, lng: r.longitude });
          }}
          toolbarEnabled={false}
        />
        <View pointerEvents="none" style={styles.pinWrap}>
          <View style={[styles.pinHead, { backgroundColor: pinColor }]} />
          <View style={[styles.pinTail, { backgroundColor: pinColor }]} />
        </View>
        <View style={styles.locateBtn}>
          <Button title="📍 Ma position" small variant="outline" onPress={useMyPosition} loading={locating} />
        </View>
      </View>
      <Muted>Déplacez la carte pour placer l’épingle sur le lieu exact.</Muted>
      {locError ? <Text style={{ color: colors.red }}>{locError}</Text> : null}
      {current.address.trim() && isPinAtDefault(current) ? (
        <Text style={{ color: colors.red }} testID={testID ? `${testID}-pin-warning` : undefined}>
          {PIN_NOT_PLACED_MESSAGE}
        </Text>
      ) : null}
      <Field
        label={addressLabel}
        placeholder="Quartier, rue (ex. Patte d’Oie, secteur 15)"
        value={current.address}
        onChangeText={(t) => onChange({ ...current, address: t })}
        maxLength={200}
      />
      <Field
        label="Point de repère"
        placeholder="Ex. derrière la station Total, portail bleu"
        value={current.landmark}
        onChangeText={(t) => onChange({ ...current, landmark: t })}
        maxLength={200}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrap: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#E8ECEF' },
  pinWrap: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -11,
    marginTop: -34,
    alignItems: 'center',
  },
  pinHead: { width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: colors.white },
  pinTail: { width: 3, height: 12 },
  locateBtn: { position: 'absolute', right: spacing.sm, bottom: spacing.sm },
});
