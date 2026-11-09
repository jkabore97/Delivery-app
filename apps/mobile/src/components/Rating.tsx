import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { errorMessage } from '../lib/api';
import { palette, spacing } from '../theme';
import { TrackingIcon } from './tracking/TrackingIcon';
import { Button, Card, Field, Subtitle } from './ui';
import { Text } from './Text';

/** Étoile vide : contour gris (la forme, pleine ou vide, dit la note sans dépendre de la couleur). */
const EMPTY_STAR = '#B8C0CD';

/**
 * Note en étoiles dessinées (la police n'a pas d'étoile utilisable partout) : pleines en soleil, vides en contour.
 * `onChange` : chaque étoile devient un bouton (zone tactile élargie).
 */
export function Stars({
  value,
  onChange,
  size = 32,
  emptyColor = EMPTY_STAR,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  /** Couleur du contour des étoiles non choisies. */
  emptyColor?: string;
}) {
  return (
    <View style={styles.row} accessibilityRole="adjustable" accessibilityValue={{ min: 1, max: 5, now: value }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={onChange ? () => onChange(n) : undefined} accessibilityLabel={`${n} étoile(s)`} hitSlop={6} disabled={!onChange}>
          <TrackingIcon name={n <= value ? 'star' : 'starOutline'} size={size} color={n <= value ? palette.sun : emptyColor} strokeWidth={1.8} />
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Carte de notation après livraison (client → livreur, livreur → client) : carte blanche Cobalt, étoiles, commentaire,
 * « Envoyer ma note ». `tone` : @deprecated (même rendu clair).
 */
export function RatingCard({
  title,
  onSubmit,
  color = palette.cobalt,
  tone: _tone,
}: {
  title: string;
  onSubmit: (score: number, comment: string) => Promise<void>;
  color?: string;
  /** @deprecated */
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

  return (
    <Card style={styles.card}>
      <Subtitle>{title}</Subtitle>
      <Stars value={score} onChange={setScore} size={36} />
      <Field label="Commentaire (facultatif)" value={comment} onChangeText={setComment} maxLength={300} />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button title="Envoyer ma note" color={color} loading={busy} onPress={submit} testID="rating-submit" />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  card: { gap: spacing.md },
  error: { color: palette.coralText, fontSize: 13, lineHeight: 18, fontWeight: '600' },
});
