import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { LABELS } from '@yaar/shared';
import { Text } from '../../../components/Text';
import { Icon } from '../../../components/design/Icon';
import { IconDisc, WhiteCard } from '../../../components/driver/DriverKit';
import { ProfileScreen } from '../../../components/ProfileScreen';
import { Banner, Button } from '../../../components/ui';
import { hasTrackingConsent, trackingConsentStatus } from '../../../lib/consent';
import { useDriver } from '../../../state/driver';
import { palette, radii, shadows, spacing } from '../../../theme';
import { confirmAsync } from '../../../lib/dialog';

/** Suivi GPS : état du consentement, lecture / acceptation, retrait (hors ligne forcé). */
function TrackingConsentCard() {
  const { profile, currentOrder, openConsentPrompt, withdrawTrackingConsent, consentBusy } = useDriver();
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  if (!profile) return null;
  const consented = hasTrackingConsent(profile);

  const withdraw = () => {
    void confirmAsync({
      title: 'Retirer votre consentement ?',
      message:
        'Vous passerez immédiatement hors ligne, votre dernière position sera effacée et vous ne recevrez plus de courses tant que vous n’aurez pas de nouveau accepté le suivi.',
      confirmText: 'Retirer',
      destructive: true,
    }).then(async (ok) => {
      if (!ok) return;
      setMessage(null);
      const err = await withdrawTrackingConsent();
      setMessage(err ? { text: err, ok: false } : { text: 'Consentement retiré : vous êtes hors ligne.', ok: true });
    });
  };

  return (
    <WhiteCard testID="tracking-consent-card">
      <View style={styles.heading}>
        <IconDisc icon="pin" tone={consented ? 'mint' : 'cobalt'} size={44} />
        <View style={styles.flex}>
          <Text style={styles.headingText} accessibilityRole="header">
            Suivi GPS
          </Text>
          <View style={styles.consentRow}>
            <Text style={styles.consentLabel}>Consentement : </Text>
            <Text style={[styles.consentValue, consented && { color: palette.mintText }]}>{trackingConsentStatus(profile)}</Text>
          </View>
        </View>
      </View>
      <Text style={styles.body}>
        Position collectée uniquement en ligne ou pendant une course, partagée avec le client pendant sa livraison et avec
        les contrôleurs Yaar, conservée 12 mois.
      </Text>
      {message ? <Banner message={message.text} tone={message.ok ? 'green' : 'red'} /> : null}
      {consented ? (
        <Button
          title="Retirer mon consentement"
          variant="outline"
          onPress={withdraw}
          loading={consentBusy}
          disabled={currentOrder !== null}
          small
          testID="withdraw-consent"
        />
      ) : (
        <Button
          title="Lire et accepter le suivi"
          onPress={() => {
            setMessage(null);
            openConsentPrompt(false);
          }}
          testID="open-consent"
        />
      )}
      {consented && currentOrder ? <Text style={styles.small}>Terminez la course en cours avant de retirer votre consentement.</Text> : null}
    </WhiteCard>
  );
}

/** Profil du livreur (Cobalt) : compte, note / véhicule / dossier en trois cases, suivi GPS, historique, déconnexion. */
export default function DriverProfile() {
  const { profile, currentOrder, setOnline } = useDriver();
  // Un livreur qui se déconnecte doit d'abord passer hors ligne : sinon le serveur continue
  // de lui proposer des courses et garde sa dernière position comme s'il était en ligne.
  const beforeSignOut = async (): Promise<string | null> => {
    if (currentOrder) return 'Terminez la course en cours avant de vous déconnecter.';
    if (profile?.isOnline) {
      const err = await setOnline(false);
      if (err) return `Impossible de passer hors ligne : ${err}`;
    }
    return null;
  };
  const rating = profile?.ratingAvg !== null && profile?.ratingAvg !== undefined ? profile.ratingAvg.toFixed(1).replace('.', ',') : null;
  return (
    <ProfileScreen color={palette.cobalt} beforeSignOut={beforeSignOut}>
      {profile ? (
        <View style={[styles.facts, shadows.tile]} testID="driver-facts">
          <View style={styles.fact} accessible accessibilityLabel={rating ? `Note moyenne ${rating} sur 5, ${profile.ratingCount} notes` : 'Pas encore de note'}>
            <View style={styles.factValueRow}>
              <Text style={styles.factValue}>{rating ?? '—'}</Text>
              {rating ? <Icon name="star" size={18} color={palette.sun} /> : null}
            </View>
            <Text style={styles.factLabel}>{rating ? `${profile.ratingCount} note${profile.ratingCount > 1 ? 's' : ''}` : 'Note moyenne'}</Text>
          </View>
          <View style={styles.factRule} />
          <View style={styles.fact}>
            <Text style={styles.factValue} numberOfLines={1}>
              {LABELS.vehicleType[profile.vehicleType]}
            </Text>
            <Text style={styles.factLabel} numberOfLines={1}>
              {profile.plate ?? 'Véhicule'}
            </Text>
          </View>
          <View style={styles.factRule} />
          <View style={styles.fact}>
            <Text style={styles.factValue} numberOfLines={1}>
              {LABELS.driverStatus[profile.status]}
            </Text>
            <Text style={styles.factLabel}>Dossier</Text>
          </View>
        </View>
      ) : null}
      <TrackingConsentCard />
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/driver/history')}
        style={({ pressed }) => [styles.link, shadows.tile, pressed && styles.linkPressed]}
        testID="open-history"
      >
        <IconDisc icon="history" tone="cobalt" size={44} />
        <View style={styles.flex}>
          <Text style={styles.linkTitle}>Historique de mes courses</Text>
          <Text style={styles.small}>Gains et espèces de chaque course livrée</Text>
        </View>
        <Icon name="chevronRight" size={22} color={palette.inkMuted} />
      </Pressable>
    </ProfileScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headingText: { fontSize: 18, lineHeight: 23, fontWeight: '800', color: palette.ink },
  consentRow: { flexDirection: 'row', flexWrap: 'wrap' },
  consentLabel: { fontSize: 13.5, lineHeight: 19, fontWeight: '600', color: palette.inkMuted },
  consentValue: { fontSize: 13.5, lineHeight: 19, fontWeight: '700', color: palette.ink, fontVariant: ['tabular-nums'] },
  body: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: palette.inkMuted },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: palette.inkMuted },
  facts: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: palette.card, borderRadius: radii.card, paddingVertical: 18, paddingHorizontal: 8 },
  fact: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 6 },
  factRule: { width: 1, backgroundColor: palette.line, marginVertical: 4 },
  factValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  factValue: { fontSize: 18, lineHeight: 23, fontWeight: '800', color: palette.ink, fontVariant: ['tabular-nums'] },
  factLabel: { fontSize: 12.5, lineHeight: 17, fontWeight: '600', color: palette.inkMuted, fontVariant: ['tabular-nums'] },
  link: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.lg, borderRadius: radii.card, backgroundColor: palette.card },
  linkPressed: { backgroundColor: palette.raised },
  linkTitle: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: palette.ink },
});
