import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { errorMessage } from '../lib/api';
import { colors, dark, spacing } from '../theme';
import { Button, Card, Field, Muted, Subtitle } from './ui';

export function Stars({
  value,
  onChange,
  size = 32,
  emptyColor = colors.border,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  /** Couleur des étoiles non choisies (fond sombre : plus claire). */
  emptyColor?: string;
}) {
  return (
    <View style={styles.row} accessibilityRole="adjustable" accessibilityValue={{ min: 1, max: 5, now: value }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={onChange ? () => onChange(n) : undefined} accessibilityLabel={`${n} étoile(s)`} hitSlop={6}>
          <Text style={{ fontSize: size, color: n <= value ? colors.orange : emptyColor }}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Carte de notation après livraison (client → livreur, livreur → client). `tone="dark"` : version pour un écran
 * sombre (livreur) ; claire par défaut.
 */
export function RatingCard({
  title,
  onSubmit,
  color = colors.green,
  tone = 'light',
}: {
  title: string;
  onSubmit: (score: number, comment: string) => Promise<void>;
  color?: string;
  tone?: 'light' | 'dark';
}) {
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(score, comment.trim());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (tone === 'dark') {
    return (
      <View style={styles.darkCard}>
        <Text style={styles.darkTitle}>{title}</Text>
        <Stars value={score} onChange={setScore} size={36} emptyColor={dark.raisedHigh} />
        <TextInput
          value={comment}
          onChangeText={setComment}
          maxLength={300}
          placeholder="Commentaire (facultatif)"
          placeholderTextColor={dark.textFaint}
          accessibilityLabel="Commentaire (facultatif)"
          style={styles.darkInput}
        />
        {error ? <Text style={styles.darkError}>{error}</Text> : null}
        <Pressable onPress={busy ? undefined : submit} accessibilityRole="button" accessibilityState={{ busy }} style={styles.darkButton} testID="rating-submit">
          {busy ? <ActivityIndicator color={dark.text} /> : <Text style={styles.darkButtonText}>Envoyer ma note</Text>}
        </Pressable>
      </View>
    );
  }

  return (
    <Card>
      <Subtitle>{title}</Subtitle>
      <Stars value={score} onChange={setScore} />
      <Field label="Commentaire (facultatif)" value={comment} onChangeText={setComment} maxLength={300} />
      {error ? <Muted style={{ color: colors.red }}>{error}</Muted> : null}
      <Button title="Envoyer ma note" color={color} loading={busy} onPress={submit} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xs },
  darkCard: { gap: spacing.md, padding: spacing.lg, borderRadius: 20, backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.border },
  darkTitle: { color: dark.text, fontSize: 18, fontWeight: '900' },
  darkInput: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.raised,
    color: dark.text,
    paddingHorizontal: spacing.md,
    fontSize: 15,
  },
  darkError: { color: dark.red, fontSize: 13, fontWeight: '700' },
  darkButton: { minHeight: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: dark.raisedHigh },
  darkButtonText: { color: dark.text, fontWeight: '900', fontSize: 16 },
});
