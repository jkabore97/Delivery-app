import { useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '../../components/Text';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { CourierIllustration } from '../../components/design/CourierIllustration';
import { Pill } from '../../components/design/Pill';
import { DarkScreen } from '../../components/design/Surfaces';
import { shouldShowReadyScreen } from '../../lib/readyScreen';
import { saveDriverReadyDismissed } from '../../lib/storage';
import { useDriver } from '../../state/driver';
import { dark, MAX_APP_WIDTH, MIN_TOUCH, spacing, typeScale } from '../../theme';

/**
 * « Vous êtes prêt ! » : dossier validé, jamais passé en ligne. « Passer en ligne » passe par le consentement au
 * suivi GPS (setOnline l'ouvre la première fois, puis passe en ligne) ; « Plus tard » écarte l'écran pour ce livreur
 * sur cet appareil. Dès que le consentement est donné, retour à l'accueil (qui affiche « En ligne »).
 */
export default function DriverReadyScreen() {
  const { profile, setOnline, togglingOnline, availabilityError } = useDriver();
  const { width } = useWindowDimensions();
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const left = useRef(false);

  const leave = () => {
    if (left.current) return;
    left.current = true;
    if (router.canGoBack()) router.back();
    else router.replace('/driver');
  };

  // Consentement donné (ou dossier qui ne correspond plus) : l'écran n'a plus lieu d'être.
  const stillReady = profile === undefined || shouldShowReadyScreen(profile, false);
  useEffect(() => {
    if (!stillReady) leave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stillReady]);

  const goOnline = async () => {
    setError(null);
    const err = await setOnline(true);
    if (err) setError(err);
  };

  const later = async () => {
    setLeaving(true);
    if (profile) await saveDriverReadyDismissed(profile.userId);
    leave();
  };

  const message = error ?? availabilityError;
  const art = Math.min(320, Math.min(width, MAX_APP_WIDTH) - spacing.xl * 2);

  return (
    <DarkScreen
      edges={['top', 'bottom']}
      contentStyle={styles.content}
      testID="ready-screen"
      footer={
        <View style={styles.footer}>
          <Pill
            label="Passer en ligne"
            icon="power"
            tone="green"
            size="lg"
            onPress={goOnline}
            loading={togglingOnline}
            disabled={leaving}
            style={styles.primary}
            testID="ready-go-online"
          />
          <Pill label="Plus tard" tone="outline" size="lg" onPress={later} disabled={leaving || togglingOnline} style={styles.secondary} testID="ready-later" />
        </View>
      }
    >
      <StatusBar style="dark" />
      <View style={styles.art}>
        <CourierIllustration width={art} />
      </View>
      <Text style={[typeScale.hero, styles.title]} accessibilityRole="header">
        Vous êtes prêt !
      </Text>
      <Text style={styles.body}>Votre dossier est validé. Passez en ligne pour recevoir des courses.</Text>
      {message ? (
        <Text style={styles.error} accessibilityRole="alert">
          {message}
        </Text>
      ) : null}
      <Text style={styles.note}>Avant de passer en ligne, Yaar vous demandera d’accepter le suivi de votre position pendant le service.</Text>
    </DarkScreen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md, paddingTop: spacing.xl },
  art: { alignItems: 'center', marginBottom: spacing.sm },
  title: { color: dark.text, textAlign: 'center', fontSize: 34 },
  body: { color: dark.textMuted, fontSize: 17, lineHeight: 25, textAlign: 'center', maxWidth: 340, fontWeight: '600' },
  note: { color: dark.textFaint, fontSize: 13, lineHeight: 18, textAlign: 'center', maxWidth: 320 },
  error: { color: dark.red, backgroundColor: dark.redSoft, borderRadius: 12, padding: spacing.md, fontWeight: '700', textAlign: 'center', overflow: 'hidden' },
  footer: { gap: spacing.sm },
  primary: { alignSelf: 'stretch', minHeight: MIN_TOUCH },
  secondary: { alignSelf: 'stretch', minHeight: MIN_TOUCH, borderColor: 'transparent' },
});
