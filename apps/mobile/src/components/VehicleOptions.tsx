import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LABELS, type QuoteOptionDto, type VehicleType } from '@yaar/shared';
import { formatFcfaShort } from '../lib/format';
import { colors, radius, spacing } from '../theme';

export const VEHICLE_EMOJI: Record<VehicleType, string> = { BIKE: '🚲', MOTO: '🏍️', CAR: '🚗' };

/** Choix du véhicule avec le prix de chaque option (maquette « Vélo / Moto / Voiture »). */
export function VehicleOptions({
  options,
  selected,
  onSelect,
}: {
  options: QuoteOptionDto[];
  selected: VehicleType | null;
  onSelect: (v: VehicleType) => void;
}) {
  return (
    <View style={styles.row}>
      {options.map((o) => {
        const isSel = selected === o.vehicleType;
        return (
          <Pressable
            key={o.vehicleType}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSel, disabled: !o.available }}
            disabled={!o.available}
            onPress={() => onSelect(o.vehicleType)}
            style={[styles.card, isSel && styles.selected, !o.available && styles.disabled]}
          >
            <Text style={styles.emoji}>{VEHICLE_EMOJI[o.vehicleType]}</Text>
            <Text style={styles.label}>{LABELS.vehicleType[o.vehicleType]}</Text>
            <Text style={styles.price}>{o.available ? formatFcfaShort(o.deliveryFee) : 'Indisponible'}</Text>
            {o.available ? <Text style={styles.eta}>~{o.estimatedMinutes} min</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Sélecteur de véhicule sans prix (inscription livreur). */
export function VehiclePicker({
  selected,
  onSelect,
  color = colors.blue,
}: {
  selected: VehicleType | null;
  onSelect: (v: VehicleType) => void;
  color?: string;
}) {
  const types: VehicleType[] = ['BIKE', 'MOTO', 'CAR'];
  return (
    <View style={styles.row}>
      {types.map((t) => {
        const isSel = selected === t;
        return (
          <Pressable
            key={t}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSel }}
            onPress={() => onSelect(t)}
            style={[styles.card, isSel && { borderColor: color, backgroundColor: colors.blueLight }]}
          >
            <Text style={styles.emoji}>{VEHICLE_EMOJI[t]}</Text>
            <Text style={styles.label}>{LABELS.vehicleType[t]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  card: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.white,
    gap: 2,
  },
  selected: { borderColor: colors.green, backgroundColor: colors.greenLight },
  disabled: { opacity: 0.4 },
  emoji: { fontSize: 24 },
  label: { fontSize: 15, fontWeight: '700', color: colors.text },
  price: { fontSize: 13, color: colors.textMuted },
  eta: { fontSize: 12, color: colors.textMuted },
});
