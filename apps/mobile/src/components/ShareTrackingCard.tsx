import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { copyText, recipientCallName, shareButtonLabel, shareFeedback, shareTrackingLink } from '../lib/share';
import { colors, dark, radius, spacing } from '../theme';
import { Icon } from './design/Icon';
import { Pill } from './design/Pill';
import { Button } from './ui';

/**
 * « Envoyer le lien de suivi au destinataire » : il n'a pas de compte, le lien lui ouvre la carte en direct
 * (livreur, heure d'arrivée, code à donner au livreur). Feuille de partage du téléphone ; sur le web,
 * navigator.share ou WhatsApp, et « Copier le lien ». `tone="dark"` : version pour une feuille sombre.
 */
export function ShareTrackingCard({
  url,
  recipientName,
  recipientIsBusiness,
  recipientPhone,
  businessName,
  prominent,
  tone = 'light',
}: {
  url: string | null | undefined;
  recipientName: string | null;
  /** Destinataire entreprise : son nom complet dans les textes. */
  recipientIsBusiness?: boolean | null;
  recipientPhone: string | null;
  businessName: string | null;
  /** Juste après la demande : carte mise en avant. */
  prominent?: boolean;
  tone?: 'light' | 'dark';
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const d = tone === 'dark';
  if (!url) {
    return (
      <View style={[styles.box, d && styles.boxDark]}>
        <Text style={[styles.muted, d && styles.mutedDark]}>Le lien de suivi sera disponible dans un instant.</Text>
      </View>
    );
  }
  const who = recipientCallName(recipientName, recipientIsBusiness) || 'Le destinataire';

  const send = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      setFeedback(shareFeedback(await shareTrackingLink({ url, recipientName, recipientIsBusiness, recipientPhone, businessName })));
    } catch {
      setFeedback(shareFeedback('failed'));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    const ok = await copyText(url);
    setFeedback(ok ? 'Lien copié ✓' : 'Copie impossible : sélectionnez le lien ci-dessous.');
  };

  return (
    <View style={[styles.box, d && styles.boxDark, prominent && (d ? styles.prominentDark : styles.prominent)]} testID="share-tracking">
      {d ? (
        <View style={styles.titleRow}>
          <Icon name="share" size={20} color={dark.green} />
          <Text style={[styles.title, styles.titleDark]}>{prominent ? 'Prévenez le destinataire' : 'Lien de suivi du destinataire'}</Text>
        </View>
      ) : (
        <Text style={styles.title}>{prominent ? '📩 Prévenez le destinataire' : '📩 Lien de suivi du destinataire'}</Text>
      )}
      <Text style={[styles.muted, d && styles.mutedDark]}>
        {who} suivra le livreur en direct sur la carte, sans créer de compte, et y trouvera le code à donner au livreur.
      </Text>
      {d ? (
        <Pill label={shareButtonLabel()} icon="share" tone="green" size="lg" onPress={send} loading={busy} style={styles.stretch} testID="share-link-button" />
      ) : (
        <Button title={shareButtonLabel()} color={colors.green} onPress={send} loading={busy} testID="share-link-button" />
      )}
      {Platform.OS === 'web' ? (
        d ? (
          <Pill label="Copier le lien" icon="link" tone="outline" onPress={copy} style={styles.center} testID="copy-link-button" />
        ) : (
          <Button title="Copier le lien" variant="outline" small onPress={copy} testID="copy-link-button" />
        )
      ) : null}
      {feedback ? (
        <Text style={[styles.feedback, d && { color: dark.green }]} accessibilityLiveRegion="polite">
          {feedback}
        </Text>
      ) : null}
      <Text style={[styles.url, d && styles.urlDark]} selectable numberOfLines={1} testID="tracking-url">
        {url.replace(/^https?:\/\//, '')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: spacing.md,
    gap: spacing.sm,
  },
  boxDark: { backgroundColor: dark.raised, borderColor: dark.border, borderRadius: 18, gap: 10 },
  prominent: { borderColor: colors.green, borderWidth: 2, backgroundColor: colors.greenLight },
  prominentDark: { borderColor: dark.green, borderWidth: 2, backgroundColor: '#13261E' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: 16, fontWeight: '900', color: colors.text },
  titleDark: { color: dark.text, fontSize: 17 },
  muted: { fontSize: 13, color: colors.textMuted },
  mutedDark: { color: dark.textMuted, fontSize: 13.5, lineHeight: 19 },
  stretch: { alignSelf: 'stretch', justifyContent: 'center' },
  center: { alignSelf: 'center' },
  feedback: { fontSize: 13, color: colors.green, fontWeight: '700', textAlign: 'center' },
  url: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  urlDark: { color: dark.textFaint },
});
