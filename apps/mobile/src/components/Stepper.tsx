import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius } from '../theme';
import { Row } from './ui';

/** Boutons − quantité + (panier). */
export function Stepper({
  quantity,
  onAdd,
  onRemove,
  disabled,
}: {
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <Row gap={10}>
      {quantity > 0 ? (
        <>
          <Pressable style={styles.stepBtn} onPress={onRemove} accessibilityLabel="Retirer un">
            <Text style={styles.stepText}>−</Text>
          </Pressable>
          <Text style={styles.qty}>{quantity}</Text>
        </>
      ) : null}
      <Pressable
        style={[styles.stepBtn, styles.addBtn, disabled && { opacity: 0.35 }]}
        onPress={disabled ? undefined : onAdd}
        accessibilityLabel="Ajouter un"
        accessibilityState={{ disabled: !!disabled }}
      >
        <Text style={[styles.stepText, { color: colors.white }]}>+</Text>
      </Pressable>
    </Row>
  );
}

const styles = StyleSheet.create({
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  addBtn: { backgroundColor: colors.green, borderColor: colors.green },
  stepText: { fontSize: 20, fontWeight: '700', color: colors.text, lineHeight: 22 },
  qty: { fontSize: 16, fontWeight: '700', minWidth: 18, textAlign: 'center' },
});
