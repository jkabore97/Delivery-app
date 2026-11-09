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
import { colors, spacing, MAX_APP_WIDTH, palette, SHEET_RADIUS } from '../theme';
import { Icon } from './design/Icon';
import { Banner, Button, Muted, Subtitle } from './ui';

/**
 * Consentement éclairé au suivi GPS (obligatoire avant le premier passage en ligne).
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

  return (
    <Modal
      visible={consentPromptOpen}
      transparent
      animationType="slide"
      onRequestClose={() => {
        setError(null);
        dismissConsentPrompt();
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="tracking-consent">
          <ScrollView contentContainerStyle={{ gap: spacing.md }}>
            <View style={styles.heading}>
              <Icon name="pin" size={20} color={colors.green} />
              <Subtitle style={styles.headingText}>{TRACKING_CONSENT_TITLE}</Subtitle>
            </View>
            <Muted>{TRACKING_CONSENT_INTRO}</Muted>
            {TRACKING_CONSENT_POINTS.map((p) => (
              <View key={p} style={styles.point}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.pointText}>{p}</Text>
              </View>
            ))}
          </ScrollView>
          {error ? <Banner message={error} /> : null}
          <Button
            title={TRACKING_CONSENT_ACCEPT}
            color={colors.green}
            onPress={accept}
            loading={consentBusy}
            testID="accept-tracking-consent"
          />
          <Button
            title="Pas maintenant"
            variant="outline"
            disabled={consentBusy}
            onPress={() => {
              setError(null);
              dismissConsentPrompt();
            }}
            testID="decline-tracking-consent"
          />
          <Muted>Sans ce consentement, vous ne pouvez pas passer en ligne ni recevoir de courses.</Muted>
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
    backgroundColor: colors.white,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xl * 1.5,
    maxHeight: '90%',
  },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headingText: { flex: 1, fontWeight: '900' },
  point: { flexDirection: 'row', gap: spacing.sm },
  bullet: { color: colors.green, fontWeight: '900', fontSize: 15 },
  pointText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 },
});
