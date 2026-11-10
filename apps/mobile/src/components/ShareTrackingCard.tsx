import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import {
  copyText,
  recipientCallName,
  SHARE_FEEDBACK_MS,
  shareButtonLabel,
  shareButtonShortLabel,
  shareFeedback,
  shareTrackingLink,
} from '../lib/share';
import { palette, spacing } from '../theme';
import { Icon } from './design/Icon';
import { Pill } from './design/Pill';

/** Message après un envoi ou une copie : réussite (effacée après quelques secondes) ou échec (reste affiché). */
export interface ShareNotice {
  text: string;
  ok: boolean;
}

/**
 * Message de partage : pictogramme du système de design (coche ou alerte) et texte, annoncé aux lecteurs d'écran
 * (réussite en vert, échec en brun lisible).
 */
export function ShareFeedback({ notice, testID }: { notice: ShareNotice; testID?: string }) {
  const color = notice.ok ? palette.mintText : palette.amberText;
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
 * navigator.share ou WhatsApp, et « Copier le lien ». Carte remplie (cobaltTint quand elle est mise en avant), bouton
 * cobalt. `shortLabel` : libellé court du bouton (« Envoyer le lien de suivi », colonnes étroites des suivis).
 */
export function ShareTrackingCard({
  url,
  recipientName,
  recipientIsBusiness,
  recipientPhone,
  businessName,
  prominent,
  shortLabel,
}: {
  url: string | null | undefined;
  recipientName: string | null;
  /** Destinataire entreprise : son nom complet dans les textes. */
  recipientIsBusiness?: boolean | null;
  recipientPhone: string | null;
  businessName: string | null;
  /** Juste après la demande : carte mise en avant. */
  prominent?: boolean;
  /** Libellé court du bouton. */
  shortLabel?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useShareNotice();
  const short = !!shortLabel;
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
    setNotice(ok ? { text: shareFeedback('copied')!, ok: true } : { text: 'Copie impossible : sélectionnez le lien ci-dessous.', ok: false });
  };

  return (
    <View style={[styles.box, prominent && styles.prominent]} testID="share-tracking">
      <View style={styles.titleRow}>
        <View style={[styles.titleIcon, prominent && styles.titleIconProminent]}>
          <Icon name="share" size={18} color={prominent ? palette.onCobalt : palette.cobalt} strokeWidth={2.3} />
        </View>
        <Text style={styles.title}>{prominent ? 'Prévenez le destinataire' : 'Lien de suivi du destinataire'}</Text>
      </View>
      <Text style={styles.muted}>
        {who} suivra le livreur en direct sur la carte, sans créer de compte, et y trouvera le code à donner au livreur.
      </Text>
      <Pill
        label={short ? shareButtonShortLabel() : shareButtonLabel()}
        icon="share"
        tone="cobalt"
        size="lg"
        onPress={send}
        loading={busy}
        style={styles.stretch}
        testID="share-link-button"
      />
      {Platform.OS === 'web' ? <Pill label="Copier le lien" icon="link" tone="outline" onPress={copy} style={styles.center} testID="copy-link-button" /> : null}
      {notice ? <ShareFeedback notice={notice} /> : null}
      <Text style={styles.url} selectable numberOfLines={1} testID="tracking-url">
        {url.replace(/^https?:\/\//, '')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 20, backgroundColor: palette.raised, padding: spacing.lg, gap: spacing.md },
  prominent: { backgroundColor: palette.cobaltTint },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  titleIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.white },
  titleIconProminent: { backgroundColor: palette.cobalt },
  title: { flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '700', color: palette.ink },
  muted: { fontSize: 13.5, lineHeight: 19, fontWeight: '500', color: palette.inkMuted },
  stretch: { alignSelf: 'stretch', justifyContent: 'center' },
  center: { alignSelf: 'center' },
  feedbackRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  feedback: { flexShrink: 1, fontSize: 13, lineHeight: 18, fontWeight: '700', textAlign: 'center' },
  // Lien lisible sur les deux fonds (inkMuted : 5,5:1 sur raised, 5,1:1 sur cobaltTint).
  url: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: palette.inkMuted, textAlign: 'center' },
});
