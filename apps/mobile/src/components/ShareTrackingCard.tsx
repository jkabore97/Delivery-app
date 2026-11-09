import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import {
  copyText,
  recipientCallName,
  SHARE_FEEDBACK_MS,
  shareButtonLabel,
  shareButtonShortLabel,
  shareFeedback,
  shareTrackingLink,
} from '../lib/share';
import { colors, dark, radius, spacing } from '../theme';
import { Icon } from './design/Icon';
import { Pill } from './design/Pill';
import { Button } from './ui';

/** Message après un envoi ou une copie : réussite (effacée après quelques secondes) ou échec (reste affiché). */
export interface ShareNotice {
  text: string;
  ok: boolean;
}

/**
 * Message de partage : pictogramme du système de design (coche ou alerte) et texte, annoncé aux lecteurs d'écran.
 * `tone="dark"` : sur une feuille sombre.
 */
export function ShareFeedback({ notice, tone = 'light', testID }: { notice: ShareNotice; tone?: 'light' | 'dark'; testID?: string }) {
  const d = tone === 'dark';
  const color = notice.ok ? (d ? dark.green : colors.green) : d ? dark.amber : '#9A4F00';
  return (
    <View style={styles.feedbackRow} testID={testID}>
      <Icon name={notice.ok ? 'check' : 'alert'} size={16} color={color} strokeWidth={2.6} />
      <Text style={[styles.feedback, { color }]} accessibilityLiveRegion="polite">
        {notice.text}
      </Text>
    </View>
  );
}

/** Message de partage qui s'efface tout seul après une réussite (SHARE_FEEDBACK_MS) ; un échec reste affiché. */
export function useShareNotice(): [ShareNotice | null, (n: ShareNotice | null) => void] {
  const [notice, setNotice] = useState<ShareNotice | null>(null);
  useEffect(() => {
    if (!notice?.ok) return;
    const t = setTimeout(() => setNotice(null), SHARE_FEEDBACK_MS);
    return () => clearTimeout(t);
  }, [notice]);
  return [notice, setNotice];
}

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
  const [notice, setNotice] = useShareNotice();
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
    setNotice(null);
    try {
      const text = shareFeedback(await shareTrackingLink({ url, recipientName, recipientIsBusiness, recipientPhone, businessName }));
      setNotice(text ? { text, ok: true } : null);
    } catch {
      setNotice({ text: shareFeedback('failed')!, ok: false });
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    const ok = await copyText(url);
    setNotice(ok ? { text: shareFeedback('copied')!, ok: true } : { text: 'Copie impossible : sélectionnez le lien ci-dessous.', ok: false });
  };

  return (
    <View style={[styles.box, d && styles.boxDark, prominent && (d ? styles.prominentDark : styles.prominent)]} testID="share-tracking">
      <View style={styles.titleRow}>
        <Icon name="share" size={20} color={d ? dark.green : colors.green} />
        <Text style={[styles.title, d && styles.titleDark]}>{prominent ? 'Prévenez le destinataire' : 'Lien de suivi du destinataire'}</Text>
      </View>
      <Text style={[styles.muted, d && styles.mutedDark]}>
        {who} suivra le livreur en direct sur la carte, sans créer de compte, et y trouvera le code à donner au livreur.
      </Text>
      {d ? (
        <Pill label={shareButtonShortLabel()} icon="share" tone="green" size="lg" onPress={send} loading={busy} style={styles.stretch} testID="share-link-button" />
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
      {notice ? <ShareFeedback notice={notice} tone={tone} /> : null}
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
  title: { flex: 1, fontSize: 16, fontWeight: '900', color: colors.text },
  titleDark: { color: dark.text, fontSize: 17 },
  muted: { fontSize: 13, color: colors.textMuted },
  mutedDark: { color: dark.textMuted, fontSize: 13.5, lineHeight: 19 },
  stretch: { alignSelf: 'stretch', justifyContent: 'center' },
  center: { alignSelf: 'center' },
  feedbackRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  feedback: { flexShrink: 1, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  url: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  // Lien sur la carte mise en avant (#13261E) : textMuted (7,0:1) plutôt que textFaint (4,6:1), il doit se lire.
  urlDark: { color: dark.textMuted },
});
