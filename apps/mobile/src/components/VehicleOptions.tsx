import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LABELS, type QuoteOptionDto, type VehicleType } from '@yaar/shared';
import { formatFcfa } from '../lib/format';
import { colors, radius, spacing } from '../theme';

export const VEHICLE_EMOJI: Record<VehicleType, string> = { BIKE: '🚲', MOTO: '🏍️', CAR: '🚗' };

export const VEHICLE_HINT: Record<VehicleType, string> = {
  BIKE: 'Petits colis, courtes distances',
  MOTO: 'Le plus rapide en ville',
  CAR: 'Colis volumineux ou fragiles',
};

/** Choix du véhicule avec le prix et la durée du devis (liste façon Uber). */
export function VehicleOptions({
  options,
  selected,
  onSelect,
  color = colors.green,
}: {
  options: QuoteOptionDto[];
  selected: VehicleType | null;
  onSelect: (v: VehicleType) => void;
  color?: string;
}) {
  return (
    <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup">
      {options.map((o) => {
        const isSel = selected === o.vehicleType;
        return (
          <Pressable
            key={o.vehicleType}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSel, disabled: !o.available }}
            accessibilityLabel={`${LABELS.vehicleType[o.vehicleType]}, ${o.available ? formatFcfa(o.deliveryFee) : 'indisponible'}`}
            disabled={!o.available}
            onPress={() => onSelect(o.vehicleType)}
            style={[styles.row, isSel && { borderColor: color, backgroundColor: colors.greenLight }, !o.available && styles.disabled]}
            testID={`vehicle-${o.vehicleType}`}
          >
            <Text style={styles.emoji}>{VEHICLE_EMOJI[o.vehicleType]}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{LABELS.vehicleType[o.vehicleType]}</Text>
              <Text style={styles.hint} numberOfLines={1}>
                {o.available ? `~${o.estimatedMinutes} min · ${VEHICLE_HINT[o.vehicleType]}` : 'Indisponible pour le moment'}
              </Text>
            </View>
            <Text style={[styles.price, isSel && { color }]}>{o.available ? formatFcfa(o.deliveryFee) : '—'}</Text>
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
    <View style={styles.pickRow}>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  pickRow: { flexDirection: 'row', gap: spacing.sm },
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
  disabled: { opacity: 0.4 },
  emoji: { fontSize: 26 },
  label: { fontSize: 16, fontWeight: '800', color: colors.text },
  hint: { fontSize: 12, color: colors.textMuted },
  price: { fontSize: 16, fontWeight: '900', color: colors.text },
});
