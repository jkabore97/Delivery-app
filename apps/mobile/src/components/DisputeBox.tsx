import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { errorMessage } from '../lib/api';
import { useApi } from '../state/auth';
import { palette, spacing } from '../theme';
import { Text } from './Text';
import { TrackingIcon } from './tracking/TrackingIcon';
import { Banner, Button, Field } from './ui';

/**
 * « Signaler un problème » sur une commande (POST /orders/:id/dispute).
 * Utilisable par toute partie qui voit la commande : client, vendeur, livreur affecté. Replié par défaut (un simple
 * lien discret qui déplie le formulaire dans un bloc rempli : il est posé dans une feuille ou une carte blanche, où
 * Cobalt n'empile pas de carte blanche).
 */
export function DisputeBox({
  orderId,
  color,
  placeholder = 'Décrivez le problème',
}: {
  orderId: string;
  color?: string;
  placeholder?: string;
}) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [state, setState] = useState<{ busy: boolean; msg: string | null; ok: boolean }>({ busy: false, msg: null, ok: false });

  const send = async () => {
    setState({ busy: true, msg: null, ok: false });
    try {
      await api.disputeOrder(orderId, text.trim());
      setState({ busy: false, msg: 'Signalement envoyé : un contrôleur va vous contacter.', ok: true });
    } catch (e) {
      setState({ busy: false, msg: errorMessage(e), ok: false });
    }
  };

  if (!open) {
    return (
      <Button
        title="Signaler un problème"
        variant="ghost"
        color={palette.inkMuted}
        icon={(c) => <TrackingIcon name="flag" size={16} color={c} strokeWidth={2.3} />}
        onPress={() => setOpen(true)}
        style={styles.link}
        testID="dispute-open"
      />
    );
  }
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <TrackingIcon name="flag" size={18} color={palette.coralText} strokeWidth={2.4} />
        <Text style={styles.title} accessibilityRole="header" aria-level={2}>
          Signaler un problème
        </Text>
      </View>
      <Field label={placeholder} value={text} onChangeText={setText} multiline maxLength={1000} style={styles.input} />
      {state.msg ? <Banner message={state.msg} tone={state.ok ? 'green' : 'red'} /> : null}
      <Button
        title="Envoyer au support"
        {...(color ? { color } : {})}
        loading={state.busy}
        disabled={text.trim().length < 3 || state.ok}
        onPress={send}
        testID="dispute-send"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  link: { alignSelf: 'center' },
  card: { gap: spacing.md, padding: spacing.lg, borderRadius: 20, backgroundColor: palette.raised },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '800', color: palette.ink },
  // Champ blanc dans le bloc rempli (le fond « raised » du champ s'y confondrait).
  input: { backgroundColor: palette.white },
});
