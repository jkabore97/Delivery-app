import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { DEMO_DATA_WARNING, LABELS } from '@yaar/shared';
import { Badge, Banner, Button, Card, Field, KeyValue, Loading, Muted, ProgressBar, Row, Screen, Subtitle, Title } from '../../../components/ui';
import { errorMessage } from '../../../lib/api';
import { formatDateTime } from '../../../lib/format';
import { documentChecklist, kycProgress, parseExpiryDate, type DocumentChecklistItem } from '../../../lib/kyc';
import { capturePhoto, type PhotoSource } from '../../../lib/photo';
import { useApi } from '../../../state/auth';
import { useAppConfig } from '../../../state/config';
import { useDriver } from '../../../state/driver';
import { colors, radius } from '../../../theme';

const STATE_BADGE = {
  missing: { label: 'MANQUANTE', tone: 'orange' },
  expired: { label: 'EXPIRÉE', tone: 'red' },
  ok: { label: 'REÇUE ✓', tone: 'green' },
} as const;

const HINTS: Partial<Record<DocumentChecklistItem['type'], string>> = {
  CNIB: 'Photo nette du recto de votre CNIB.',
  PERMIS: 'Permis de conduire valable pour votre véhicule.',
  CARTE_GRISE: 'Carte grise du véhicule déclaré.',
  ASSURANCE: 'Attestation d’assurance en cours de validité.',
  SELFIE: 'Selfie de face, visage bien visible, sans lunettes de soleil.',
};

/** Pièces justificatives du livreur (KYC). Les fichiers sont chiffrés et vus uniquement par les contrôleurs. */
export default function DriverDocuments() {
  const { profile } = useDriver();
  const { config } = useAppConfig();
  if (profile === undefined) return <Loading />;
  if (profile === null) return <Redirect href="/driver/onboarding" />;

  const items = documentChecklist(profile.vehicleType, profile.documents);
  const { done, total } = kycProgress(items);
  const locked = profile.status === 'SUSPENDED';

  return (
    <Screen>
      <Title style={styles.title}>Mes documents</Title>
      {/* Démo publique : aucune vraie pièce d'identité ne doit être déposée. */}
      {config?.demoMode ? <Banner message={`⚠️ ${DEMO_DATA_WARNING}`} tone="orange" /> : null}
      <Card>
        <KeyValue label={`Dossier : ${LABELS.driverStatus[profile.status]}`} value={`${done} / ${total}`} strong />
        <ProgressBar value={total ? done / total : 0} color={colors.green} />
        <Muted>
          {LABELS.vehicleType[profile.vehicleType]}
          {profile.plate ? ` · ${profile.plate}` : ''} · Vos documents sont chiffrés et consultés uniquement par les contrôleurs
          Yaar.
        </Muted>
      </Card>
      {locked ? <Banner message="Compte livreur suspendu : contactez Yaar." /> : null}
      {items.map((item) => (
        <DocumentCard key={item.type} item={item} disabled={locked || profile.isOnline} />
      ))}
      {profile.isOnline ? <Muted>Passez hors ligne pour modifier vos documents.</Muted> : null}
      {!locked ? (
        <Button
          title="Changer de véhicule"
          variant="ghost"
          color={colors.green}
          onPress={() => router.push('/driver/onboarding')}
          disabled={profile.isOnline}
        />
      ) : null}
    </Screen>
  );
}

function DocumentCard({ item, disabled }: { item: DocumentChecklistItem; disabled: boolean }) {
  const api = useApi();
  const { setProfile, profile } = useDriver();
  const [expiry, setExpiry] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const badge = STATE_BADGE[item.state];
  const uploadedAt = profile?.documents.find((d) => d.type === item.type)?.uploadedAt;

  const upload = async (source: PhotoSource) => {
    setError(null);
    let expiresAt: string | undefined;
    if (item.needsExpiry) {
      const parsed = parseExpiryDate(expiry);
      if (!parsed) {
        setError('Indiquez une date d’expiration valide et future (JJ/MM/AAAA).');
        return;
      }
      expiresAt = parsed;
    }
    setBusy(true);
    try {
      const photo = await capturePhoto(source, { front: item.type === 'SELFIE' });
      if (!photo) return;
      setPreview(photo.uri);
      const updated = await api.uploadDocument(item.type, { ...photo.upload, ...(expiresAt ? { expiresAt } : {}) });
      setProfile(updated);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card highlight={item.state === 'ok' ? undefined : item.state === 'expired' ? colors.red : colors.orange}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Subtitle style={{ fontSize: 16, flex: 1, fontWeight: '800' }}>{item.label}</Subtitle>
        <Badge label={badge.label} tone={badge.tone} />
      </Row>
      <Muted>{HINTS[item.type]}</Muted>
      {uploadedAt ? <Muted>Envoyée le {formatDateTime(uploadedAt)}</Muted> : null}
      {item.expiresAt ? <Muted>Expire le {item.expiresAt.slice(0, 10).split('-').reverse().join('/')}</Muted> : null}
      {preview ? (
        <View style={styles.previewWrap}>
          <Image source={{ uri: preview }} style={styles.preview} resizeMode="cover" />
        </View>
      ) : null}
      {item.needsExpiry ? (
        <Field
          label="Date d’expiration"
          placeholder="JJ/MM/AAAA"
          keyboardType="numbers-and-punctuation"
          value={expiry}
          onChangeText={setExpiry}
          maxLength={10}
        />
      ) : null}
      {error ? <Banner message={error} /> : null}
      <Row>
        <Button
          title={item.type === 'SELFIE' ? '🤳 Prendre le selfie' : '📷 Photographier'}
          color={colors.green}
          small
          style={{ flex: 1 }}
          onPress={() => void upload('camera')}
          loading={busy}
          disabled={disabled}
        />
        {item.type !== 'SELFIE' ? (
          <Button title="🖼️ Galerie" variant="outline" small onPress={() => void upload('library')} disabled={disabled || busy} />
        ) : null}
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: '900', letterSpacing: -0.4 },
  previewWrap: { borderRadius: radius.md, overflow: 'hidden' },
  preview: { width: '100%', height: 140 },
});
