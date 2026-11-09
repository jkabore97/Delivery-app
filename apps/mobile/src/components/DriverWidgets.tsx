import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import * as Location from 'expo-location';
import { errorMessage } from '../lib/api';
import { onlineStatus } from '../lib/driverStatus';
import { useApi } from '../state/auth';
import { useDriver } from '../state/driver';
import { MIN_TOUCH, palette, shadows, spacing } from '../theme';
import { confirmAsync, notify } from '../lib/dialog';
import { Pill } from './design/Pill';
import { RoundButton } from './design/RoundButton';

/** Point d'état : vert (suivi actif), soleil (en attente, en pause), gris (hors ligne). */
const STATUS_DOT = { on: palette.mint, pending: palette.sun, paused: palette.sun, off: '#9AA3B2' } as const;
/** Halo du point d'état (en ligne : le point « vit »). */
const STATUS_HALO = { on: 'rgba(22, 196, 127, 0.22)', pending: 'rgba(255, 201, 60, 0.3)', paused: 'rgba(255, 201, 60, 0.3)', off: 'transparent' } as const;

/**
 * Indicateur légal permanent « En ligne : suivi GPS actif » / « Hors ligne : position non suivie » (pastille blanche
 * posée sur la carte, point d'état coloré), avec l'éventuelle erreur du GPS. Le suivi n'existe que lorsque le livreur est en ligne.
 */
export function OnlineStatusPill() {
  const { profile, gpsActive, gpsPaused, gpsError } = useDriver();
  const status = onlineStatus({ online: profile?.isOnline === true, gpsActive, gpsPaused });
  return (
    <View style={styles.statusWrap} pointerEvents="box-none">
      <Pill
        label={status.label}
        tone="light"
        floating
        live
        numberOfLines={2}
        style={styles.statusPill}
        textStyle={styles.statusText}
        leading={<View style={[styles.dot, { backgroundColor: STATUS_DOT[status.tone], boxShadow: `0 0 0 4px ${STATUS_HALO[status.tone]}` }]} />}
        testID="online-status"
      />
      {gpsError ? (
        <Text style={styles.gpsError} accessibilityRole="alert">
          {gpsError}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Grand bouton rond « Passer en ligne » (accueil hors ligne). Passe par le consentement au suivi GPS la première
 * fois (setOnline l'ouvre et reprend le passage en ligne après acceptation). `blocked` (plafond d'espèces atteint) :
 * le serveur refuserait le passage en ligne, le bouton est inactif et l'accueil explique le dépôt à faire.
 */
export function GoOnlineButton({ onError, blocked = false }: { onError: (msg: string | null) => void; blocked?: boolean }) {
  const { togglingOnline, setOnline } = useDriver();
  return (
    // Anneau blanc autour du disque cobalt : le bouton se détache de la carte, même en plein soleil.
    <View style={[styles.powerRing, shadows.float]}>
      <RoundButton
        label={'Passer\nen ligne'}
        icon="power"
        diameter={POWER_DIAMETER}
        tone="primary"
        labelInside
        elevated
        loading={togglingOnline}
        disabled={blocked}
        onPress={async () => {
          onError(null);
          const err = await setOnline(true);
          if (err) onError(err);
        }}
        accessibilityLabel="Passer en ligne"
        accessibilityHint={
          blocked
            ? 'Indisponible : plafond d’espèces atteint, déposez l’argent auprès de Yaar.'
            : 'Votre position sera suivie tant que vous êtes en ligne.'
        }
        testID="online-switch"
      />
    </View>
  );
}

/** Diamètre du grand bouton rond « Passer en ligne » (anneau blanc de 8 px autour). */
const POWER_DIAMETER = 112;
const POWER_RING = 8;

/**
 * « Passer hors ligne » (accueil en ligne, sans course en cours) : pilule de 56 px. `floating` : blanche à ombre
 * flottante, posée sur la carte au-dessus de la feuille (là où était « Passer en ligne ») ; sinon secondaire à filet.
 */
export function GoOfflinePill({ onError, floating = false }: { onError: (msg: string | null) => void; floating?: boolean }) {
  const { togglingOnline, setOnline } = useDriver();
  return (
    <Pill
      label="Passer hors ligne"
      icon="power"
      tone={floating ? 'light' : 'outline'}
      floating={floating}
      size="lg"
      style={floating ? styles.offlineFloating : styles.offline}
      loading={togglingOnline}
      onPress={async () => {
        onError(null);
        const err = await setOnline(false);
        if (err) onError(err);
      }}
      testID="online-switch"
    />
  );
}

/** Bouton SOS : alerte immédiate des contrôleurs avec la position (si disponible). */
export function SosButton({ size = 64 }: { size?: number }) {
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

  // Disque plus petit que la cible tactile minimale (48 px sur la carte) : zone tactile portée à MIN_TOUCH.
  const touchPad = Math.max(0, Math.ceil((MIN_TOUCH - size) / 2));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="SOS, alerter les contrôleurs"
      hitSlop={touchPad || undefined}
      style={({ pressed }) => [styles.sos, shadows.float, { width: size, height: size, borderRadius: size / 2 }, busy && { opacity: 0.6 }, pressed && { opacity: 0.88 }]}
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
      testID="sos-button"
    >
      <Text style={[styles.sosText, size < 56 && { fontSize: 14 }]} accessibilityElementsHidden importantForAccessibility="no">
        SOS
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  statusWrap: { alignItems: 'center', gap: 4, maxWidth: '100%' },
  statusPill: { paddingLeft: 14, paddingRight: 16, gap: 9 },
  statusText: { fontSize: 13.5, letterSpacing: 0 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  powerRing: {
    width: POWER_DIAMETER + POWER_RING * 2,
    height: POWER_DIAMETER + POWER_RING * 2,
    borderRadius: (POWER_DIAMETER + POWER_RING * 2) / 2,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offline: { alignSelf: 'stretch', justifyContent: 'center' },
  offlineFloating: { alignSelf: 'center', paddingHorizontal: 22 },
  gpsError: {
    color: palette.white,
    // Opaque : blanc sur coralFill = 4,8:1 quel que soit le fond de carte dessous.
    backgroundColor: palette.coralFill,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    borderRadius: 10,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  sos: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: palette.coralFill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: palette.white,
  },
  sosText: { color: palette.white, fontWeight: '800', fontSize: 17, letterSpacing: 0.4 },
});
