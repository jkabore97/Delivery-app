import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { errorMessage } from '../lib/api';
import { useRadioGroupKeys } from '../hooks/useRadioGroupKeys';
import { touchTarget } from '../lib/touchTarget';
import { palette, spacing } from '../theme';
import { TrackingIcon } from './tracking/TrackingIcon';
import { Button, Card, Field } from './ui';
import { Text } from './Text';

const STAR_VALUES = [1, 2, 3, 4, 5] as const;

/**
 * Note en étoiles dessinées (la police n'a pas d'étoile utilisable partout). Pleine : soleil cerclé d'ambre foncé
 * (contour 5,35:1 sur blanc) ; vide : contour gris foncé (inkMuted, 6,3:1) : la forme, pleine ou vide, dit la note
 * sans dépendre de la couleur, et chaque étoile reste visible en plein soleil.
 * Lecture seule : une image « 4 étoiles sur 5 ». `onChange` : un groupe de boutons radio (« 3 étoiles », coché ou non),
 * chaque étoile d'au moins 48 px (hitSlop en natif, marge compensée sur le web) ; au clavier (web), flèches et Espace.
 */
export function Stars({
  value,
  onChange,
  size = 32,
  emptyColor = palette.inkMuted,
  label = 'Note',
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  /** Couleur du contour des étoiles non choisies. */
  emptyColor?: string;
  /** Nom du groupe pour les lecteurs d'écran (« Note »). */
  label?: string;
}) {
  const touch = onChange ? touchTarget(size, 48) : {};
  const keys = useRadioGroupKeys(STAR_VALUES, value as (typeof STAR_VALUES)[number], (v) => onChange?.(v));
  const star = (n: number) => (
    <View style={{ width: size, height: size }}>
      {n <= value ? (
        <>
          <TrackingIcon name="star" size={size} color={palette.sun} strokeWidth={1.8} />
          <View style={StyleSheet.absoluteFill}>
            <TrackingIcon name="starOutline" size={size} color={palette.amberText} strokeWidth={1.6} />
          </View>
        </>
      ) : (
        <TrackingIcon name="starOutline" size={size} color={emptyColor} strokeWidth={1.8} />
      )}
    </View>
  );
  if (!onChange) {
    return (
      <View style={styles.row} accessible accessibilityRole="image" accessibilityLabel={`${value} étoile${value > 1 ? 's' : ''} sur 5`}>
        {STAR_VALUES.map((n) => (
          <View key={n}>{star(n)}</View>
        ))}
      </View>
    );
  }
  return (
    <View style={[styles.row, styles.rowEditable]} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {STAR_VALUES.map((n, i) => (
        <Pressable
          key={n}
          onPress={() => onChange(n)}
          accessibilityRole="radio"
          accessibilityState={{ checked: n === value }}
          aria-checked={n === value}
          accessibilityLabel={`${n} étoile${n > 1 ? 's' : ''}`}
          hitSlop={touch.hitSlop}
          style={touch.style}
          testID={`star-${n}`}
          {...keys(i)}
        >
          {star(n)}
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Carte de notation après livraison (client → livreur, livreur → client) : carte blanche Cobalt, étoiles, commentaire,
 * « Envoyer ma note » (plein, ou en contour : `submitVariant`).
 */
export function RatingCard({
  title,
  onSubmit,
  color = palette.cobalt,
  submitVariant = 'solid',
}: {
  title: string;
  onSubmit: (score: number, comment: string) => Promise<void>;
  color?: string;
  /** « Envoyer ma note » en contour quand l'écran a déjà son action principale pleine (écran de livraison réussie). */
  submitVariant?: 'solid' | 'outline';
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
      <Text style={styles.title} accessibilityRole="header" aria-level={2}>
        {title}
      </Text>
      <Stars value={score} onChange={setScore} size={40} />
      <Field label="Commentaire (facultatif)" value={comment} onChangeText={setComment} maxLength={300} />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button title="Envoyer ma note" color={color} variant={submitVariant} loading={busy} onPress={submit} testID="rating-submit" />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  rowEditable: { gap: spacing.md, justifyContent: 'center', paddingVertical: 4 },
  card: { gap: spacing.md },
  title: { fontSize: 18, lineHeight: 23, fontWeight: '800', letterSpacing: -0.2, color: palette.ink },
  error: { color: palette.coralText, fontSize: 13, lineHeight: 18, fontWeight: '600' },
});
