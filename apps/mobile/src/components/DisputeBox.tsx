import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { errorMessage } from '../lib/api';
import { useApi } from '../state/auth';
import { colors, dark, spacing } from '../theme';
import { Banner, Button, Card, Field, SectionTitle } from './ui';

/**
 * « Signaler un problème » sur une commande (POST /orders/:id/dispute).
 * Utilisable par toute partie qui voit la commande : client, vendeur, livreur affecté. Replié par défaut (un simple
 * lien discret qui déplie le formulaire). `tone="dark"` : version pour une feuille sombre (livreur).
 */
export function DisputeBox({
  orderId,
  color,
  placeholder = 'Décrivez le problème',
  tone = 'light',
}: {
  orderId: string;
  color?: string;
  placeholder?: string;
  tone?: 'light' | 'dark';
}) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [state, setState] = useState<{ busy: boolean; msg: string | null; ok: boolean }>({ busy: false, msg: null, ok: false });

  const send = async () => {
    setState({ busy: true, msg: null, ok: false });
    try {
      await api.disputeOrder(orderId, text.trim());
      setState({ busy: false, msg: 'Signalement envoyé : un contrôleur va vous contacter.', ok: true });
    } catch (e) {
      setState({ busy: false, msg: errorMessage(e), ok: false });
    }
  };

  if (tone === 'dark') {
    if (!open) {
      return (
        <Pressable onPress={() => setOpen(true)} accessibilityRole="button" hitSlop={8} style={styles.darkLink} testID="dispute-open">
          <Text style={styles.darkLinkText}>Signaler un problème</Text>
        </Pressable>
      );
    }
    const disabled = text.trim().length < 3 || state.ok || state.busy;
    return (
      <View style={styles.darkBox}>
        <Text style={styles.darkTitle}>Signaler un problème</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          maxLength={1000}
          placeholder={placeholder}
          placeholderTextColor={dark.textFaint}
          accessibilityLabel={placeholder}
          style={styles.darkInput}
        />
        {state.msg ? (
          <Text style={[styles.darkMsg, { color: state.ok ? dark.green : dark.red }]} accessibilityRole="alert">
            {state.msg}
          </Text>
        ) : null}
        <Pressable
          onPress={disabled ? undefined : send}
          accessibilityRole="button"
          accessibilityState={{ disabled, busy: state.busy }}
          style={[styles.darkSend, disabled && { opacity: 0.45 }]}
          testID="dispute-send"
        >
          {state.busy ? <ActivityIndicator color={dark.text} /> : <Text style={styles.darkSendText}>Envoyer au support</Text>}
        </Pressable>
      </View>
    );
  }

  if (!open) {
    return (
      <Button
        title="Signaler un problème"
        variant="ghost"
        color={colors.textMuted}
        small
        onPress={() => setOpen(true)}
        testID="dispute-open"
      />
    );
  }
  return (
    <Card>
      <SectionTitle>Signaler un problème</SectionTitle>
      <Field label={placeholder} value={text} onChangeText={setText} multiline maxLength={1000} />
      {state.msg ? <Banner message={state.msg} tone={state.ok ? 'green' : 'red'} /> : null}
      <Button
        title="Envoyer au support"
        small
        {...(color ? { color } : {})}
        loading={state.busy}
        disabled={text.trim().length < 3 || state.ok}
        onPress={send}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  darkLink: { alignSelf: 'center', paddingVertical: spacing.sm },
  darkLinkText: { color: dark.textFaint, fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  darkBox: { gap: spacing.sm, padding: spacing.md, borderRadius: 16, backgroundColor: dark.raised, borderWidth: 1, borderColor: dark.border },
  darkTitle: { color: dark.text, fontSize: 14, fontWeight: '900' },
  darkInput: {
    minHeight: 80,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    color: dark.text,
    padding: spacing.md,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  darkMsg: { fontSize: 13, fontWeight: '700' },
  darkSend: { minHeight: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: dark.raisedHigh },
  darkSendText: { color: dark.text, fontWeight: '900', fontSize: 15 },
});
