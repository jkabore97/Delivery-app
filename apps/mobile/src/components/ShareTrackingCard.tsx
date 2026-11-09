import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { copyText, recipientCallName, shareButtonLabel, shareTrackingLink } from '../lib/share';
import { colors, radius, spacing } from '../theme';
import { Button } from './ui';

/**
 * « Envoyer le lien de suivi au destinataire » : il n'a pas de compte, le lien lui ouvre la carte en direct
 * (livreur, heure d'arrivée, code à donner au livreur). Feuille de partage du téléphone ; sur le web,
 * navigator.share ou WhatsApp, et « Copier le lien ».
 */
export function ShareTrackingCard({
  url,
  recipientName,
  recipientIsBusiness,
  recipientPhone,
  businessName,
  prominent,
}: {
  url: string | null | undefined;
  recipientName: string | null;
  /** Destinataire entreprise : son nom complet dans les textes. */
  recipientIsBusiness?: boolean | null;
  recipientPhone: string | null;
  businessName: string | null;
  /** Juste après la demande : carte mise en avant. */
  prominent?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  if (!url) {
    return (
      <View style={styles.box}>
        <Text style={styles.muted}>Le lien de suivi sera disponible dans un instant.</Text>
      </View>
    );
  }
  const who = recipientCallName(recipientName, recipientIsBusiness) || 'Le destinataire';

  const send = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const outcome = await shareTrackingLink({ url, recipientName, recipientIsBusiness, recipientPhone, businessName });
      if (outcome === 'whatsapp') setFeedback('WhatsApp ouvert avec le message prêt à envoyer.');
      else if (outcome === 'shared') setFeedback('Lien envoyé.');
    } catch {
      setFeedback('Partage impossible : copiez le lien.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    const ok = await copyText(url);
    setFeedback(ok ? 'Lien copié ✓' : 'Copie impossible : sélectionnez le lien ci-dessous.');
  };

  return (
    <View style={[styles.box, prominent && styles.prominent]} testID="share-tracking">
      <Text style={styles.title}>{prominent ? '📩 Prévenez le destinataire' : '📩 Lien de suivi du destinataire'}</Text>
      <Text style={styles.muted}>
        {who} suivra le livreur en direct sur la carte, sans créer de compte, et y trouvera le code à donner au livreur.
      </Text>
      <Button title={shareButtonLabel()} color={colors.green} onPress={send} loading={busy} testID="share-link-button" />
      {Platform.OS === 'web' ? (
        <Button title="Copier le lien" variant="outline" small onPress={copy} testID="copy-link-button" />
      ) : null}
      {feedback ? (
        <Text style={styles.feedback} accessibilityLiveRegion="polite">
          {feedback}
        </Text>
      ) : null}
      <Text style={styles.url} selectable numberOfLines={1} testID="tracking-url">
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
  prominent: { borderColor: colors.green, borderWidth: 2, backgroundColor: colors.greenLight },
  title: { fontSize: 16, fontWeight: '900', color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
  feedback: { fontSize: 13, color: colors.green, fontWeight: '700', textAlign: 'center' },
  url: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
});
