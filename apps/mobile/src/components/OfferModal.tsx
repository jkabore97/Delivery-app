import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { OfferDto } from '@yaar/shared';
import { useCountdown } from '../hooks/useCountdown';
import { errorMessage, isApiError } from '../lib/api';
import { formatCountdown } from '../lib/countdown';
import { offerPlaces } from '../lib/offer';
import { formatFcfa, formatFcfaShort, formatKm } from '../lib/format';
import { useApi } from '../state/auth';
import { useDriver } from '../state/driver';
import { colors, radius, spacing, MAX_APP_WIDTH } from '../theme';
import { Banner, Button, Dot, KeyValue, Muted, ProgressBar, Row, Subtitle } from './ui';

/** Nouvelle course : compte à rebours de 30 s, Accepter / Refuser (maquette « Nouvelle course 🔔 »). */
export function OfferModal() {
  const { offers, profile, currentOrder } = useDriver();
  const offer = profile?.isOnline && !currentOrder ? (offers[0] ?? null) : null;
  return (
    <Modal visible={!!offer} transparent animationType="slide" onRequestClose={() => undefined}>
      <View style={styles.backdrop}>{offer ? <OfferSheet key={offer.id} offer={offer} /> : null}</View>
    </Modal>
  );
}

function OfferSheet({ offer }: { offer: OfferDto }) {
  const api = useApi();
  const { removeOffer, setCurrentOrder, refreshProfile } = useDriver();
  const secs = useCountdown(offer.expiresAt);
  const total = Math.max(1, (Date.parse(offer.expiresAt) - Date.parse(offer.offeredAt)) / 1000);
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const places = offerPlaces(offer);

  useEffect(() => {
    if (secs <= 0 && busy === null) {
      const t = setTimeout(() => removeOffer(offer.id), 800);
      return () => clearTimeout(t);
    }
  }, [secs, busy, offer.id, removeOffer]);

  const accept = async () => {
    setBusy('accept');
    setError(null);
    try {
      const order = await api.acceptOffer(offer.id);
      setCurrentOrder(order);
      removeOffer(offer.id);
      void refreshProfile();
      router.push('/driver/order');
    } catch (e) {
      if (isApiError(e, 'OFFER_EXPIRED')) {
        removeOffer(offer.id);
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    setBusy('reject');
    try {
      await api.rejectOffer(offer.id);
    } catch {
      /* déjà expirée : rien à faire */
    } finally {
      removeOffer(offer.id);
      setBusy(null);
    }
  };

  return (
    <View style={styles.sheet}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Subtitle>Nouvelle course 🔔</Subtitle>
        <View style={styles.timer}>
          <Text style={styles.timerText}>{formatCountdown(secs)}</Text>
        </View>
      </Row>
      <ProgressBar value={secs / total} color={secs <= 10 ? colors.red : colors.blue} />
      <Row style={{ alignItems: 'flex-start' }}>
        <Dot color={colors.orange} />
        <View style={{ flex: 1 }}>
          <Text style={styles.addr}>Récupérer : {places.pickupTitle}</Text>
          <Muted>
            {[
              offer.pickup.distanceFromDriverKm !== null ? `à ${formatKm(offer.pickup.distanceFromDriverKm)} de vous` : null,
              places.pickupAddress,
              places.pickupZone,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Muted>
        </View>
      </Row>
      <Row style={{ alignItems: 'flex-start' }}>
        <Dot color={colors.green} />
        <View style={{ flex: 1 }}>
          <Text style={styles.addr}>Livrer : {places.dropoffZone}</Text>
          <Muted>
            {formatKm(offer.distanceKm)} · Espèces à encaisser : {formatFcfaShort(offer.cashToCollect)}
          </Muted>
        </View>
      </Row>
      <Muted>Zone approximative : l’adresse exacte du client s’affiche une fois la course acceptée.</Muted>
      <View style={styles.gain}>
        <KeyValue label="Votre gain" value={formatFcfa(offer.driverEarning)} valueColor={colors.green} strong />
      </View>
      {error ? <Banner message={error} /> : null}
      <Row>
        <Button
          title="Refuser"
          variant="outline"
          style={{ flex: 1 }}
          onPress={reject}
          loading={busy === 'reject'}
          disabled={busy !== null}
        />
        <Button
          title="Accepter"
          color={colors.blue}
          style={{ flex: 2 }}
          onPress={accept}
          loading={busy === 'accept'}
          disabled={busy !== null || secs <= 0}
          testID="accept-offer"
        />
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    // Sur le web, la fenêtre modale couvre tout l'écran : la feuille garde la largeur de l'application.
    width: '100%',
    maxWidth: MAX_APP_WIDTH,
    alignSelf: 'center',
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xl * 1.5,
  },
  timer: { backgroundColor: colors.blueLight, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4 },
  timerText: { color: colors.blue, fontWeight: '800', fontSize: 16 },
  addr: { fontSize: 15, fontWeight: '700', color: colors.text },
  gain: { backgroundColor: colors.greenLight, borderRadius: radius.md, padding: spacing.md },
});
