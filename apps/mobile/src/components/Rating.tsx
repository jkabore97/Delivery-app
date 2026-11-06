import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '../lib/api';
import { colors, spacing } from '../theme';
import { Button, Card, Field, Muted, Subtitle } from './ui';

export function Stars({ value, onChange, size = 32 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <View style={styles.row} accessibilityRole="adjustable" accessibilityValue={{ min: 1, max: 5, now: value }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={onChange ? () => onChange(n) : undefined} accessibilityLabel={`${n} étoile(s)`} hitSlop={6}>
          <Text style={{ fontSize: size, color: n <= value ? colors.orange : colors.border }}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Carte de notation après livraison (client → livreur, livreur → client). */
export function RatingCard({
  title,
  onSubmit,
  color = colors.green,
}: {
  title: string;
  onSubmit: (score: number, comment: string) => Promise<void>;
  color?: string;
}) {
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <Subtitle>{title}</Subtitle>
      <Stars value={score} onChange={setScore} />
      <Field label="Commentaire (facultatif)" value={comment} onChangeText={setComment} maxLength={300} />
      {error ? <Muted style={{ color: colors.red }}>{error}</Muted> : null}
      <Button
        title="Envoyer ma note"
        color={color}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            await onSubmit(score, comment.trim());
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: spacing.xs } });
