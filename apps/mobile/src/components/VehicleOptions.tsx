import { Pressable, StyleSheet, View } from 'react-native';
import { LABELS, type QuoteOptionDto, type VehicleType } from '@yaar/shared';
import { formatFcfa } from '../lib/format';
import { palette, spacing } from '../theme';
import { Text } from './Text';
import { TrackingIcon, type IconName } from './tracking/TrackingIcon';

/** @deprecated Émojis des véhicules : remplacés par les pictogrammes dessinés `VEHICLE_ICON` (Cobalt n'a pas d'émoji). */
export const VEHICLE_EMOJI: Record<VehicleType, string> = { BIKE: '🚲', MOTO: '🏍️', CAR: '🚗' };

/** Pictogramme de chaque véhicule (vélo, moto, voiture de profil). */
export const VEHICLE_ICON: Record<VehicleType, IconName> = { BIKE: 'bike', MOTO: 'moto', CAR: 'car' };

export const VEHICLE_HINT: Record<VehicleType, string> = {
  BIKE: 'Petits colis, courtes distances',
  MOTO: 'Le plus rapide en ville',
  CAR: 'Colis volumineux ou fragiles',
};

/** Disque cobaltTint du pictogramme d'un véhicule (blanc quand la ligne est choisie). */
function VehicleDisc({ type, selected }: { type: VehicleType; selected: boolean }) {
  return (
    <View style={[styles.disc, selected && styles.discOn]}>
      <TrackingIcon name={VEHICLE_ICON[type]} size={24} color={palette.cobalt} strokeWidth={2.2} />
    </View>
  );
}

/** Choix du véhicule avec le prix et la durée du devis (liste façon Uber). `color` : contour de la ligne choisie. */
export function VehicleOptions({
  options,
  selected,
  onSelect,
  color = palette.cobalt,
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
            accessibilityState={{ selected: isSel, checked: isSel, disabled: !o.available }}
            aria-checked={isSel}
            accessibilityLabel={`${LABELS.vehicleType[o.vehicleType]}, ${o.available ? formatFcfa(o.deliveryFee) : 'indisponible'}`}
            disabled={!o.available}
            onPress={() => onSelect(o.vehicleType)}
            style={[styles.row, isSel && [styles.selected, { borderColor: color }], !o.available && styles.disabled]}
            testID={`vehicle-${o.vehicleType}`}
          >
            <VehicleDisc type={o.vehicleType} selected={isSel} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.label}>{LABELS.vehicleType[o.vehicleType]}</Text>
              <Text style={styles.hint} numberOfLines={1}>
                {o.available ? `~${o.estimatedMinutes} min · ${VEHICLE_HINT[o.vehicleType]}` : 'Indisponible pour le moment'}
              </Text>
            </View>
            <Text style={styles.price}>{o.available ? formatFcfa(o.deliveryFee) : '—'}</Text>
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
  color = palette.cobalt,
}: {
  selected: VehicleType | null;
  onSelect: (v: VehicleType) => void;
  color?: string;
}) {
  const types: VehicleType[] = ['BIKE', 'MOTO', 'CAR'];
  return (
    <View style={styles.pickRow} accessibilityRole="radiogroup">
      {types.map((t) => {
        const isSel = selected === t;
        return (
          <Pressable
            key={t}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSel, checked: isSel }}
            aria-checked={isSel}
            onPress={() => onSelect(t)}
            style={[styles.card, isSel && [styles.selected, { borderColor: color }]]}
          >
            <VehicleDisc type={t} selected={isSel} />
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
    minHeight: 64,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: palette.raised,
  },
  selected: { backgroundColor: palette.cobaltTint },
  pickRow: { flexDirection: 'row', gap: spacing.sm },
  card: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: palette.raised,
    gap: 6,
  },
  disabled: { opacity: 0.45 },
  disc: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.cobaltTint },
  discOn: { backgroundColor: palette.white },
  label: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: palette.ink },
  hint: { fontSize: 12.5, lineHeight: 17, fontWeight: '500', color: palette.inkMuted },
  price: { fontSize: 16, lineHeight: 21, fontWeight: '800', color: palette.ink, fontVariant: ['tabular-nums'] },
});
