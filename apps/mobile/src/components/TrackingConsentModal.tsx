import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import {
  TRACKING_CONSENT_ACCEPT,
  TRACKING_CONSENT_INTRO,
  TRACKING_CONSENT_POINTS,
  TRACKING_CONSENT_TITLE,
} from '../lib/consent';
import { useDriver } from '../state/driver';
import { MAX_APP_WIDTH, palette, SHEET_RADIUS, shadows, spacing } from '../theme';
import { Icon, type IconName } from './design/Icon';
import { Banner, Button } from './ui';

/** Pictogramme de chaque point du texte de consentement (collecte, usage, partage, durée, retrait). */
const POINT_ICONS: IconName[] = ['pin', 'route', 'shield', 'clock', 'logout'];

/**
 * Consentement éclairé au suivi GPS (obligatoire avant le premier passage en ligne), en feuille blanche Cobalt
 * (coins de 32 px, poignée) : pastille, titre, points illustrés, « J'accepte… » en pilule cobalt, « Pas maintenant ». Tout
 * défile ensemble (barre de défilement visible) : les boutons viennent après le texte, jamais par-dessus.
 * Ouverte par `setOnline(true)` sans consentement, sur `403 CONSENT_REQUIRED`, ou depuis le profil.
 */
export function TrackingConsentModal() {
  const { consentPromptOpen, dismissConsentPrompt, acceptTrackingConsent, consentBusy } = useDriver();
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setError(null);
    const err = await acceptTrackingConsent();
    if (err) setError(err);
  };
  const close = () => {
    setError(null);
    dismissConsentPrompt();
  };

  return (
    <Modal visible={consentPromptOpen} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, shadows.sheet]} testID="tracking-consent" accessibilityViewIsModal>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator persistentScrollbar testID="tracking-consent-scroll">
            <View style={styles.heading}>
              <View style={styles.disc}>
                <Icon name="pin" size={26} color={palette.cobaltText} strokeWidth={2.3} />
              </View>
              <Text style={styles.title} accessibilityRole="header" aria-level={2}>
                {TRACKING_CONSENT_TITLE}
              </Text>
            </View>
            <Text style={styles.intro}>{TRACKING_CONSENT_INTRO}</Text>
            <View style={styles.points}>
              {TRACKING_CONSENT_POINTS.map((p, i) => (
                <View key={p} style={styles.point}>
                  <View style={styles.pointIcon}>
                    <Icon name={POINT_ICONS[i] ?? 'check'} size={16} color={palette.cobaltText} strokeWidth={2.4} />
                  </View>
                  <Text style={styles.pointText}>{p}</Text>
                </View>
              ))}
            </View>
            {/* Les boutons défilent avec le texte : sur un petit téléphone, « J'accepte » ne s'atteint qu'après avoir vu
                tous les points (pas de bouton fixé par-dessus un texte coupé). */}
            <View style={styles.actions}>
              {error ? <Banner message={error} /> : null}
              <Button title={TRACKING_CONSENT_ACCEPT} onPress={accept} loading={consentBusy} testID="accept-tracking-consent" />
              <Button title="Pas maintenant" variant="ghost" disabled={consentBusy} onPress={close} testID="decline-tracking-consent" />
              <Text style={styles.note}>Sans ce consentement, vous ne pouvez pas passer en ligne ni recevoir de courses.</Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: palette.overlay, justifyContent: 'flex-end' },
  sheet: {
    // Sur le web, la fenêtre modale couvre tout l'écran : la feuille garde la largeur de l'application.
    width: '100%',
    maxWidth: MAX_APP_WIDTH,
    alignSelf: 'center',
    backgroundColor: palette.card,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
    maxHeight: '92%',
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: palette.handle, marginBottom: spacing.sm },
  scroll: { gap: spacing.md, paddingBottom: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  disc: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.cobaltTint },
  title: { flex: 1, fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: -0.4, color: palette.ink },
  intro: { fontSize: 15, lineHeight: 21, fontWeight: '500', color: palette.inkMuted },
  points: { gap: 10, padding: spacing.lg, borderRadius: 20, backgroundColor: palette.raised },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  pointIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.white },
  pointText: { flex: 1, color: palette.ink, fontSize: 14, lineHeight: 20, fontWeight: '500', paddingTop: 4 },
  note: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: palette.inkMuted, textAlign: 'center' },
});
