import { useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '../../components/Text';
import { router } from 'expo-router';
import { CourierIllustration } from '../../components/design/CourierIllustration';
import { Icon } from '../../components/design/Icon';
import { Pill } from '../../components/design/Pill';
import { SurfaceScreen } from '../../components/design/Surfaces';
import { TagChip } from '../../components/driver/DriverKit';
import { Banner, Button } from '../../components/ui';
import { shouldShowReadyScreen } from '../../lib/readyScreen';
import { saveDriverReadyDismissed } from '../../lib/storage';
import { useDriver } from '../../state/driver';
import { MAX_APP_WIDTH, palette, radii, spacing } from '../../theme';

/**
 * « Vous êtes prêt ! » (Cobalt) : fond canvas clair, illustration recolorée, « Passer en ligne » (pilule cobalt, l'action
 * évidente) et « Plus tard » (texte cobalt). « Passer en ligne » passe par le consentement au suivi GPS (setOnline
 * l'ouvre la première fois, puis passe en ligne) ; « Plus tard » écarte l'écran pour ce livreur sur cet appareil. Dès
 * que le consentement est donné, retour à l'accueil (qui affiche « En ligne »).
 */
export default function DriverReadyScreen() {
  const { profile, setOnline, togglingOnline, availabilityError } = useDriver();
  const { width, height } = useWindowDimensions();
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
  // Petit téléphone (360 × 640) : illustration plus petite, pour que tout tienne sans défiler.
  const short = height < 700;
  const art = Math.min(short ? 220 : 300, Math.min(width, MAX_APP_WIDTH) - spacing.xl * 2);

  return (
    <SurfaceScreen
      edges={['top', 'bottom']}
      contentStyle={[styles.content, short && styles.contentShort]}
      testID="ready-screen"
      footer={
        <View style={styles.footer}>
          <Pill
            label="Passer en ligne"
            icon="power"
            tone="cobalt"
            size="lg"
            onPress={goOnline}
            loading={togglingOnline}
            disabled={leaving}
            style={styles.primary}
            testID="ready-go-online"
          />
          <Button title="Plus tard" variant="ghost" onPress={later} disabled={leaving || togglingOnline} testID="ready-later" />
        </View>
      }
    >
      <View style={styles.chip}>
        <TagChip label="Dossier validé" tone="mint" icon="check" testID="ready-approved" />
      </View>
      <View style={styles.art}>
        <CourierIllustration width={art} />
      </View>
      <Text style={[styles.title, short && styles.titleShort]} accessibilityRole="header">
        Vous êtes prêt !
      </Text>
      <Text style={styles.body}>Votre dossier est validé. Passez en ligne pour recevoir des courses.</Text>
      {message ? <Banner message={message} tone="red" /> : null}
      <View style={styles.note}>
        <Icon name="shield" size={18} color={palette.cobaltText} strokeWidth={2.4} />
        <Text style={styles.noteText}>Avant de passer en ligne, Yaar vous demandera d’accepter le suivi de votre position pendant le service.</Text>
      </View>
    </SurfaceScreen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md, paddingTop: spacing.xl },
  contentShort: { paddingTop: spacing.md, gap: 10 },
  chip: { alignItems: 'center' },
  art: { alignItems: 'center', marginVertical: spacing.xs },
  title: { fontSize: 34, lineHeight: 38, fontWeight: '800', letterSpacing: -1, color: palette.ink, textAlign: 'center' },
  titleShort: { fontSize: 30, lineHeight: 34 },
  body: { fontSize: 17, lineHeight: 24, fontWeight: '500', color: palette.inkMuted, textAlign: 'center', maxWidth: 340 },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    maxWidth: 360,
    padding: 14,
    borderRadius: radii.banner,
    backgroundColor: palette.cobaltTint,
    marginTop: spacing.xs,
  },
  noteText: { flex: 1, fontSize: 13.5, lineHeight: 19, fontWeight: '600', color: palette.cobaltText },
  footer: { gap: 4 },
  primary: { alignSelf: 'stretch', justifyContent: 'center' },
});
