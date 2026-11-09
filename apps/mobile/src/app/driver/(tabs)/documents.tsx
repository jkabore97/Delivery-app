import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { DEMO_DATA_WARNING, LABELS, type DocumentType } from '@yaar/shared';
import { Text } from '../../../components/Text';
import { GalleryIcon } from '../../../components/design/GalleryIcon';
import { Icon, type IconName } from '../../../components/design/Icon';
import { IconDisc, Meter, ScreenTitle, TagChip, WhiteCard, type KitTone } from '../../../components/driver/DriverKit';
import { Banner, Button, Field, Loading, Screen } from '../../../components/ui';
import { errorMessage } from '../../../lib/api';
import { documentChecklist, kycProgress, parseExpiryDate, type DocumentChecklistItem, type DocumentState } from '../../../lib/kyc';
import { capturePhoto, type PhotoSource } from '../../../lib/photo';
import { useApi } from '../../../state/auth';
import { useAppConfig } from '../../../state/config';
import { useDriver } from '../../../state/driver';
import { palette, radii, spacing } from '../../../theme';

/**
 * État d'une pièce, en minuscules et avec un pictogramme (la police n'a pas de « ✓ ») : manquante (gris), expirée
 * (rouge), reçue (vert, coche).
 */
const DOCUMENT_STATE_CHIP: Record<DocumentState, { label: string; tone: KitTone; icon: IconName }> = {
  missing: { label: 'Manquante', tone: 'raised', icon: 'clock' },
  expired: { label: 'Expirée', tone: 'coral', icon: 'alert' },
  ok: { label: 'Reçue', tone: 'mint', icon: 'check' },
};

const HINTS: Partial<Record<DocumentType, string>> = {
  CNIB: 'Photo nette du recto de votre CNIB.',
  PERMIS: 'Permis de conduire valable pour votre véhicule.',
  CARTE_GRISE: 'Carte grise du véhicule déclaré.',
  ASSURANCE: 'Attestation d’assurance en cours de validité.',
  SELFIE: 'Selfie de face, visage bien visible, sans lunettes de soleil.',
};

const DOC_ICON: Partial<Record<DocumentType, IconName>> = { SELFIE: 'user', CARTE_GRISE: 'car', ASSURANCE: 'shield' };

/** Pièces justificatives du livreur (KYC), au dessin Cobalt. Les fichiers sont chiffrés et vus uniquement par les contrôleurs. */
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
      <ScreenTitle title="Mes documents" />
      {/* Démo publique : aucune vraie pièce d'identité ne doit être déposée. */}
      {config?.demoMode ? (
        <Banner message={DEMO_DATA_WARNING} tone="orange" icon={(c) => <Icon name="alert" size={18} color={c} testID="demo-warning-icon" />} />
      ) : null}
      <WhiteCard testID="kyc-summary">
        <View style={styles.summaryTop}>
          <View style={styles.flex}>
            <Text style={styles.summaryLabel}>Dossier</Text>
            <Text style={styles.summaryStatus}>{LABELS.driverStatus[profile.status]}</Text>
          </View>
          <Text style={styles.summaryCount} accessibilityLabel={`${done} pièces reçues sur ${total}`}>
            {done}
            <Text style={styles.summaryTotal}>{` / ${total}`}</Text>
          </Text>
        </View>
        <Meter value={total ? done / total : 0} color={palette.cobalt} label="Pièces reçues" />
        <View style={styles.privacy}>
          <Icon name="shield" size={16} color={palette.inkMuted} strokeWidth={2.3} />
          <Text style={styles.privacyText}>
            {LABELS.vehicleType[profile.vehicleType]}
            {profile.plate ? ` · ${profile.plate}` : ''} · Vos documents sont chiffrés et consultés uniquement par les contrôleurs Yaar.
          </Text>
        </View>
      </WhiteCard>
      {locked ? <Banner message="Compte livreur suspendu : contactez Yaar." /> : null}
      {items.map((item) => (
        <DocumentCard key={item.type} item={item} disabled={locked || profile.isOnline} />
      ))}
      {profile.isOnline ? <Banner message="Passez hors ligne pour modifier vos documents." tone="blue" /> : null}
      {!locked ? (
        <Button
          title="Changer de véhicule"
          variant="ghost"
          icon={(c) => <Icon name="moto" size={20} color={c} />}
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
  const chip = DOCUMENT_STATE_CHIP[item.state];
  const uploadedAt = profile?.documents.find((d) => d.type === item.type)?.uploadedAt;
  const dates = [
    uploadedAt ? `Envoyée le ${uploadedAt.slice(0, 10).split('-').reverse().join('/')}` : null,
    item.expiresAt ? `Expire le ${item.expiresAt.slice(0, 10).split('-').reverse().join('/')}` : null,
  ].filter(Boolean);

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
    <WhiteCard testID={`document-${item.type}`}>
      <View style={styles.docHead}>
        <IconDisc icon={DOC_ICON[item.type] ?? 'document'} tone={item.state === 'ok' ? 'mint' : item.state === 'expired' ? 'coral' : 'cobalt'} size={44} />
        <View style={styles.flex}>
          <Text style={styles.docTitle}>{item.label}</Text>
          {dates.length ? <Text style={styles.docMeta}>{dates.join(' · ')}</Text> : null}
        </View>
        <TagChip label={chip.label} tone={chip.tone} icon={chip.icon} testID={`document-${item.type}-state`} />
      </View>
      <Text style={styles.hint}>{HINTS[item.type]}</Text>
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
      <View style={styles.actions}>
        {/* Pièce à fournir : action principale (cobalt) ; pièce reçue : simple remplacement (secondaire). */}
        <Button
          title={item.type === 'SELFIE' ? (item.state === 'ok' ? 'Refaire le selfie' : 'Prendre le selfie') : item.state === 'ok' ? 'Remplacer' : 'Photographier'}
          icon={(c) => <Icon name="camera" size={18} color={c} />}
          variant={item.state === 'ok' ? 'outline' : 'solid'}
          small
          style={styles.flex}
          onPress={() => void upload('camera')}
          loading={busy}
          disabled={disabled}
        />
        {item.type !== 'SELFIE' ? (
          <Button
            title="Galerie"
            icon={(c) => <GalleryIcon size={18} color={c} />}
            variant="outline"
            small
            onPress={() => void upload('library')}
            disabled={disabled || busy}
          />
        ) : null}
      </View>
    </WhiteCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  summaryTop: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  summaryLabel: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: palette.inkMuted },
  summaryStatus: { fontSize: 20, lineHeight: 26, fontWeight: '800', letterSpacing: -0.3, color: palette.ink },
  summaryCount: { fontSize: 32, lineHeight: 36, fontWeight: '800', letterSpacing: -1, color: palette.ink, fontVariant: ['tabular-nums'] },
  summaryTotal: { fontSize: 18, fontWeight: '800', color: palette.inkMuted, letterSpacing: 0 },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  privacyText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '500', color: palette.inkMuted },
  docHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  docTitle: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: palette.ink },
  docMeta: { fontSize: 12.5, lineHeight: 17, fontWeight: '600', color: palette.inkMuted, fontVariant: ['tabular-nums'] },
  hint: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: palette.inkMuted },
  previewWrap: { borderRadius: radii.input, overflow: 'hidden' },
  preview: { width: '100%', height: 140 },
  actions: { flexDirection: 'row', gap: spacing.sm },
});
