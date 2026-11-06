import { useState } from 'react';
import { errorMessage } from '../lib/api';
import { useApi } from '../state/auth';
import { colors } from '../theme';
import { Banner, Button, Card, Field, SectionTitle } from './ui';

/**
 * « Signaler un problème » sur une commande (POST /orders/:id/dispute).
 * Utilisable par toute partie qui voit la commande : client, vendeur, livreur affecté.
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
        onPress={async () => {
          setState({ busy: true, msg: null, ok: false });
          try {
            await api.disputeOrder(orderId, text.trim());
            setState({ busy: false, msg: 'Signalement envoyé : un contrôleur va vous contacter.', ok: true });
          } catch (e) {
            setState({ busy: false, msg: errorMessage(e), ok: false });
          }
        }}
      />
    </Card>
  );
}
