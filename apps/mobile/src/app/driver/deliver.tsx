import { useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';
import { router } from 'expo-router';
import type { FileUploadInput, OrderDto } from '@yaar/shared';
import { RatingCard } from '../../components/Rating';
import { Banner, Button, Card, KeyValue, Muted, ProgressBar, Row, Screen, Subtitle, Title } from '../../components/ui';
import { errorMessage, isApiError } from '../../lib/api';
import { formatFcfa, formatOrderNumber } from '../../lib/format';
import { useAsync } from '../../hooks/useAsync';
import { capturePhoto } from '../../lib/photo';
import { useApi } from '../../state/auth';
import { useDriver } from '../../state/driver';
import { colors, radius, spacing } from '../../theme';

const CODE_LENGTH = 4;

/** Preuve de livraison : code à 4 chiffres donné par le client + photo facultative. */
export default function DeliverScreen() {
  const api = useApi();
  const { currentOrder, profile, setCurrentOrder, refreshProfile } = useDriver();
  const [code, setCode] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; upload: FileUploadInput } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [delivered, setDelivered] = useState<OrderDto | null>(null);
  const [rated, setRated] = useState(false);
  const inputRef = useRef<TextInputInstance>(null);
  const earnings = useAsync(() => api.driverEarnings(), [api]);
  const today = earnings.data?.today ?? null;
  const todayCard = today ? (
    <Card>
      <KeyValue
        label={`Gains du jour · ${today.deliveries} course${today.deliveries > 1 ? 's' : ''}`}
        value={formatFcfa(today.earnings)}
        strong
        valueColor={colors.green}
      />
    </Card>
  ) : null;

  if (delivered) {
    return (
      <Screen edges={['bottom']}>
        <Title>Livraison confirmée ✅</Title>
        <Card>
          <KeyValue label={`Course ${formatOrderNumber(delivered.number)}`} value="Livrée" />
          {delivered.cashCollected !== null ? (
            <KeyValue label="Espèces encaissées" value={formatFcfa(delivered.cashCollected)} strong />
          ) : null}
          {delivered.driverEarning !== null ? (
            <KeyValue label="Votre gain" value={formatFcfa(delivered.driverEarning)} valueColor={colors.green} />
          ) : null}
        </Card>
        {todayCard}
        {!rated ? (
          <RatingCard
            title="Notez le client"
            color={colors.blue}
            onSubmit={async (score, comment) => {
              await api.rateOrder(delivered.id, { score, ...(comment ? { comment } : {}) });
              setRated(true);
            }}
          />
        ) : (
          <Banner message="Merci pour votre note." tone="green" />
        )}
        <Button title="Retour aux courses" color={colors.blue} onPress={() => router.dismissTo('/driver')} />
      </Screen>
    );
  }

  const o = currentOrder;
  if (!o || o.status !== 'PICKED_UP') {
    return (
      <Screen edges={['bottom']}>
        <Muted>Aucune course à livrer.</Muted>
        <Button title="Retour" color={colors.blue} onPress={() => router.back()} />
      </Screen>
    );
  }

  const takePhoto = async () => {
    setError(null);
    try {
      const p = await capturePhoto('camera');
      if (p) setPhoto(p);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const submit = async () => {
    if (code.length !== CODE_LENGTH) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.deliverOrder(o.id, { code, ...(photo ? { proofPhoto: photo.upload } : {}) });
      setDelivered(result);
      setCurrentOrder(null);
      void refreshProfile();
      void earnings.reload();
    } catch (e) {
      setError(errorMessage(e));
      if (isApiError(e, 'DELIVERY_CODE_INVALID')) setCode('');
    } finally {
      setBusy(false);
    }
  };

  const cashAfter = (profile?.cashHeld ?? 0) + (o.paymentMethod === 'CASH' ? o.total : 0);
  const limit = profile?.cashLimit ?? 0;

  return (
    <Screen
      edges={['bottom']}
      footer={
        <Button
          title="Valider la livraison"
          color={colors.blue}
          onPress={submit}
          loading={busy}
          disabled={code.length !== CODE_LENGTH}
          testID="deliver-button"
        />
      }
    >
      <Muted>
        Course {formatOrderNumber(o.number)} · {o.recipientName ?? o.client?.name ?? 'Client'}
      </Muted>
      <Subtitle style={{ textAlign: 'center' }}>Demandez le code au client</Subtitle>
      <Pressable onPress={() => inputRef.current?.focus()} accessibilityLabel="Saisir le code de livraison">
        <Row style={{ justifyContent: 'center' }} gap={12}>
          {Array.from({ length: CODE_LENGTH }).map((_, i) => {
            const active = i === code.length;
            return (
              <View key={i} style={[styles.codeBox, active && styles.codeBoxActive]}>
                <Text style={styles.codeDigit}>{code[i] ?? ''}</Text>
              </View>
            );
          })}
        </Row>
      </Pressable>
      <TextInput
        ref={inputRef}
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        keyboardType="number-pad"
        maxLength={CODE_LENGTH}
        autoFocus
        style={styles.hiddenInput}
        accessibilityLabel="Code de livraison"
        testID="delivery-code-input"
      />

      <Pressable onPress={takePhoto} style={styles.photoBox} accessibilityRole="button">
        {photo ? (
          <Image source={{ uri: photo.uri }} style={styles.photo} resizeMode="cover" />
        ) : (
          <Text style={{ color: colors.textMuted }}>📷 Photo du colis remis (facultatif)</Text>
        )}
      </Pressable>
      {photo ? <Button title="Retirer la photo" variant="ghost" small onPress={() => setPhoto(null)} /> : null}

      {o.paymentMethod === 'CASH' ? (
        <Card highlight={colors.orange}>
          <KeyValue label="💵 Espèces à encaisser" value={formatFcfa(o.total)} strong />
        </Card>
      ) : null}
      {profile ? (
        <Card>
          <KeyValue label="Cash détenu après cette course" value={formatFcfa(cashAfter)} />
          <ProgressBar value={limit ? cashAfter / limit : 0} color={limit && cashAfter >= limit ? colors.red : colors.orange} />
          <Muted>Plafond {formatFcfa(limit)} : au-delà, vous ne recevez plus de courses avant dépôt.</Muted>
        </Card>
      ) : null}
      {o.driverEarning !== null ? (
        <Card>
          <KeyValue label="Votre gain sur cette course" value={formatFcfa(o.driverEarning)} valueColor={colors.green} />
        </Card>
      ) : null}
      {todayCard}
      {error ? <Banner message={error} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  codeBox: {
    width: 58,
    height: 68,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBoxActive: { borderColor: colors.blue },
  codeDigit: { fontSize: 30, fontWeight: '800', color: colors.text },
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  photoBox: {
    minHeight: 90,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: spacing.md,
  },
  photo: { width: '100%', height: 180 },
});
