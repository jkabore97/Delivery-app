import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { errorMessage } from '../lib/api';
import { useApi } from '../state/auth';
import { useDriver } from '../state/driver';
import { colors, radius, spacing } from '../theme';
import { confirmAsync, notify } from '../lib/dialog';

/**
 * Bandeau en ligne / hors ligne avec l'indicateur légal « En ligne : suivi GPS actif ».
 * Le suivi n'existe que lorsque le livreur est en ligne.
 */
export function OnlineToggle({ onError }: { onError: (msg: string | null) => void }) {
  const { profile, gpsActive, gpsPaused, gpsError, togglingOnline, setOnline, currentOrder } = useDriver();
  const online = profile?.isOnline === true;
  const label = online
    ? gpsPaused
      ? 'En ligne : suivi GPS en pause (Yaar en arrière-plan)'
      : gpsActive
      ? 'En ligne : suivi GPS actif'
      : 'En ligne : activation du GPS…'
    : 'Hors ligne : position non suivie';
  return (
    <View style={[styles.toggle, online ? styles.toggleOn : styles.toggleOff]} accessibilityLiveRegion="polite">
      <View style={{ flex: 1 }}>
        <Text style={[styles.toggleText, { color: online ? colors.green : colors.textMuted }]}>● {label}</Text>
        {gpsError ? <Text style={{ color: colors.red, fontSize: 12 }}>{gpsError}</Text> : null}
      </View>
      <Switch
        value={online}
        disabled={togglingOnline || (online && currentOrder !== null)}
        onValueChange={async (v) => {
          onError(null);
          const err = await setOnline(v);
          if (err) onError(err);
        }}
        trackColor={{ true: colors.green, false: colors.border }}
        accessibilityLabel={online ? 'Passer hors ligne' : 'Passer en ligne'}
        testID="online-switch"
      />
    </View>
  );
}

/** Bouton SOS : alerte immédiate des contrôleurs avec la position (si disponible). */
export function SosButton() {
  const api = useApi();
  const { position, currentOrder } = useDriver();
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      let coords = position ? { lat: position.lat, lng: position.lng } : null;
      if (!coords) {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.granted) {
          const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          coords = { lat: p.coords.latitude, lng: p.coords.longitude };
        }
      }
      if (!coords) {
        notify('SOS', 'Position indisponible : appelez directement le support.');
        return;
      }
      await api.sos({ ...coords, message: 'SOS livreur', ...(currentOrder ? { orderId: currentOrder.id } : {}) });
      notify('SOS envoyé', 'Les contrôleurs ont reçu votre alerte et votre position. Restez en sécurité.');
    } catch (e) {
      notify('SOS', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="SOS, alerter les contrôleurs"
      style={[styles.sos, busy && { opacity: 0.6 }]}
      onPress={() =>
        void confirmAsync({
          title: 'Envoyer un SOS ?',
          message: 'Votre position sera transmise immédiatement aux contrôleurs Yaar.',
          confirmText: 'Envoyer le SOS',
          destructive: true,
        }).then((ok) => {
          if (ok) void send();
        })
      }
      disabled={busy}
    >
      <Text style={styles.sosText}>SOS</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
  },
  toggleOn: { backgroundColor: colors.greenLight, borderColor: colors.green },
  toggleOff: { backgroundColor: colors.white, borderColor: colors.border },
  toggleText: { fontSize: 15, fontWeight: '800' },
  sos: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  sosText: { color: colors.white, fontWeight: '900', fontSize: 18 },
});
