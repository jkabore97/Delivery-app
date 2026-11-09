import { memo, useEffect, useMemo, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, Vibration, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LABELS, type OfferDto } from '@yaar/shared';
import { useExpired } from '../hooks/useCountdown';
import { errorMessage, isApiError } from '../lib/api';
import { offerCash } from '../lib/delivery';
import { formatOfferEta, offerPlaces, offerScene, visibleOffer, type OfferScene } from '../lib/offer';
import { formatFcfa, formatKm, formatOrderNumber } from '../lib/format';
import { useApi } from '../state/auth';
import { useDriver } from '../state/driver';
import { dark, MAX_APP_WIDTH, spacing, typeScale } from '../theme';
import { CountdownRing } from './design/CountdownRing';
import { Icon } from './design/Icon';
import { Pill } from './design/Pill';
import { RoundButton } from './design/RoundButton';
import { SheetSurface } from './design/Surfaces';
import { LiveMap } from './map/LiveMap';
import { avatarInitials, vehicleSideGlyph } from './map/markerArt';
import { ArtView } from './map/MarkerViews';
import type { MapPadding } from './map/types';

/** Vibration d'une nouvelle offre (Android : motif ; iOS : deux impulsions). Jamais sur le web. */
const OFFER_VIBRATION = [0, 280, 160, 280];

/**
 * Nouvelle course, en plein écran (comme les applications de coursiers) : carte sombre avec le livreur, le retrait
 * et la zone de livraison (cercle doux : jamais l'adresse du destinataire avant acceptation), pastilles « Nouvelle
 * course » et « ≈ N min · X km » jusqu'au retrait, grand bouton rond « Accepter » dans l'anneau du compte à rebours
 * de 30 s, « Refuser » en rouge, puis le détail : gain, espèces (retrait / livraison), entreprise, zone, distance.
 * Sur un grand écran web, la colonne garde la largeur de l'application.
 */
export function OfferModal() {
  const { offers, profile, currentOrder } = useDriver();
  const offer = visibleOffer(profile, currentOrder, offers);
  return (
    <Modal visible={!!offer} transparent animationType="fade" statusBarTranslucent onRequestClose={() => undefined}>
      <View style={styles.backdrop}>
        <View style={styles.frame}>{offer ? <OfferTakeover key={offer.id} offer={offer} /> : null}</View>
      </View>
    </Modal>
  );
}

/** Carte de l'offre, isolée : jamais redessinée par le compte à rebours. */
const OfferMap = memo(function OfferMap({ scene, padding, recenterKey }: { scene: OfferScene; padding: MapPadding; recenterKey: number }) {
  return (
    <LiveMap
      style={StyleSheet.absoluteFill}
      theme="dark"
      markers={scene.markers}
      lines={scene.lines}
      zones={scene.zones}
      fitPoints={scene.fitPoints}
      follow={false}
      recenterKey={recenterKey}
      padding={padding}
      bottomInset={padding.bottom - 16}
      animationMs={1200}
      maxZoom={15.5}
    />
  );
});

function OfferTakeover({ offer }: { offer: OfferDto }) {
  const api = useApi();
  const { removeOffer, setCurrentOrder, refreshProfile, position, profile } = useDriver();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const expired = useExpired(offer.expiresAt);
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bottomHeight, setBottomHeight] = useState(0);
  const places = offerPlaces(offer);
  const cash = offerCash(offer);
  const eta = formatOfferEta(offer);
  const compact = height < 720;
  const ring = compact ? 128 : 150;

  // Nouvelle offre : vibration (téléphone uniquement).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    Vibration.vibrate(OFFER_VIBRATION);
    return () => Vibration.cancel();
  }, []);

  useEffect(() => {
    if (expired && busy === null) {
      const t = setTimeout(() => removeOffer(offer.id), 800);
      return () => clearTimeout(t);
    }
  }, [expired, busy, offer.id, removeOffer]);

  // Position du livreur (GPS en ligne, sinon dernière position connue), arrondie à ~10 m : pas de recalcul pour rien.
  const me = position ?? profile?.lastLocation ?? null;
  const meKey = me ? `${me.lat.toFixed(4)},${me.lng.toFixed(4)}` : '';
  const scene = useMemo(() => offerScene(offer, me ? { lat: me.lat, lng: me.lng } : null), [offer.id, meKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const padding = useMemo<MapPadding>(
    () => ({ top: insets.top + 84, right: 56, bottom: (bottomHeight || Math.round(height * 0.55)) + 16, left: 56 }),
    [insets.top, bottomHeight, height],
  );

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

  const pickupLine = [
    offer.pickup.distanceFromDriverKm !== null ? `à ${formatKm(offer.pickup.distanceFromDriverKm)} de vous` : null,
    places.pickupAddress,
    places.pickupZone,
  ]
    .filter(Boolean)
    .join(' · ');
  const split =
    cash.atPickup !== null && cash.atDelivery !== null && cash.total > 0
      ? [
          cash.atPickup > 0 ? `${formatFcfa(cash.atPickup)} au retrait` : null,
          cash.atDelivery > 0 ? `${formatFcfa(cash.atDelivery)} à la livraison` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : null;
  const pickupInitials = avatarInitials(offer.pickup.name);

  return (
    <View style={styles.root} accessibilityViewIsModal testID="offer-screen">
      <OfferMap scene={scene} padding={padding} recenterKey={bottomHeight > 0 ? 1 : 0} />

      <View style={[styles.top, { top: insets.top + spacing.md }]} pointerEvents="box-none">
        <Pill
          label={`Nouvelle course · ${LABELS.vehicleType[offer.vehicleType]}`}
          icon={<ArtView rects={vehicleSideGlyph(offer.vehicleType, dark.text, dark.surface)} size={22} />}
          tone="dark"
          floating
          accessibilityLabel={`Nouvelle course, ${LABELS.vehicleType[offer.vehicleType]}`}
          testID="offer-title"
        />
        {eta ? <Pill label={eta} icon="clock" tone="dark" floating accessibilityLabel={`Retrait à ${eta.replace('≈', 'environ')}`} testID="offer-eta" /> : null}
      </View>

      <View style={styles.bottom} onLayout={(e) => setBottomHeight(Math.round(e.nativeEvent.layout.height))}>
        <View style={styles.actions}>
          <CountdownRing startAt={offer.offeredAt} endAt={offer.expiresAt} size={ring} strokeWidth={compact ? 7 : 8} testID="offer-countdown">
            {({ secondsLeft }) => (
              <RoundButton
                label={expired ? 'Expirée' : 'Accepter'}
                caption={expired ? null : `${secondsLeft} s`}
                icon="check"
                diameter={ring - 24}
                tone="primary"
                surface="dark"
                labelInside
                elevated
                loading={busy === 'accept'}
                disabled={busy !== null || expired}
                onPress={accept}
                accessibilityLabel="Accepter la course"
                accessibilityHint={expired ? 'Offre expirée' : `Il reste ${secondsLeft} secondes pour accepter`}
                testID="accept-offer"
              />
            )}
          </CountdownRing>
          <Pill
            label="Refuser"
            icon="close"
            tone="red"
            size="lg"
            onPress={reject}
            loading={busy === 'reject'}
            disabled={busy !== null}
            accessibilityLabel="Refuser la course"
            testID="reject-offer"
          />
        </View>

        <SheetSurface style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]} testID="offer-details">
          <ScrollView style={{ maxHeight: Math.round(height * (compact ? 0.4 : 0.42)) }} showsVerticalScrollIndicator={false} contentContainerStyle={styles.details}>
            <View style={styles.detailsHeader}>
              <Text style={[typeScale.kicker, styles.kicker]} accessibilityRole="header">
                Détails de la course
              </Text>
              <Text style={styles.number}>{formatOrderNumber(offer.orderNumber)}</Text>
            </View>
            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}

            <View style={styles.money}>
              <View style={[styles.moneyBox, styles.earning]} testID="offer-earning">
                <Text style={styles.moneyLabel}>Votre gain</Text>
                <Text style={[styles.earningValue, compact && { fontSize: 24 }]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatFcfa(offer.driverEarning)}
                </Text>
              </View>
              <View style={[styles.moneyBox, styles.cash]} testID="offer-cash">
                <Text style={styles.moneyLabel}>Espèces à encaisser</Text>
                <Text style={styles.cashValue} numberOfLines={1} adjustsFontSizeToFit testID="offer-cash-total">
                  {formatFcfa(cash.total)}
                </Text>
                {split ? (
                  <Text style={styles.cashSplit} testID="offer-cash-split">
                    {split}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.stop} testID="offer-pickup">
              <View style={[styles.stopIcon, { backgroundColor: 'rgba(242,140,27,0.18)' }]}>
                {pickupInitials ? <Text style={styles.stopInitials}>{pickupInitials}</Text> : <Icon name="store" size={18} color="#FFAA48" />}
              </View>
              <View style={styles.flex}>
                <Text style={styles.stopTitle} numberOfLines={2}>
                  {offer.pickup.name ? `Récupérer chez ${places.pickupTitle}` : `Récupérer : ${places.pickupTitle}`}
                </Text>
                {pickupLine ? (
                  <Text style={styles.stopLine} numberOfLines={2}>
                    {pickupLine}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={styles.connector} />
            <View style={styles.stop} testID="offer-dropoff">
              <View style={[styles.stopIcon, styles.zoneIcon]}>
                <Icon name="pin" size={18} color={dark.green} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.stopTitle} numberOfLines={2}>
                  Livrer : {places.dropoffZone}
                </Text>
                <Text style={styles.stopLine} numberOfLines={compact ? 2 : 3}>
                  Zone approximative : l’adresse exacte du destinataire s’affiche une fois la course acceptée.
                </Text>
              </View>
            </View>

            <View style={styles.facts}>
              <Icon name="route" size={16} color={dark.textMuted} />
              <Text style={styles.factsText} testID="offer-vehicle">
                {LABELS.vehicleType[offer.vehicleType]} · {formatKm(offer.distanceKm)} de course
              </Text>
            </View>
          </ScrollView>
        </SheetSurface>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  backdrop: { flex: 1, backgroundColor: dark.overlay, alignItems: 'center' },
  // Sur le web, la fenêtre modale couvre tout l'écran : la colonne garde la largeur de l'application.
  frame: { flex: 1, width: '100%', maxWidth: MAX_APP_WIDTH, overflow: 'hidden' },
  root: { flex: 1, backgroundColor: dark.background },
  top: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: spacing.md },
  actions: { alignItems: 'center', gap: spacing.md },
  sheet: { paddingTop: spacing.lg },
  details: { gap: spacing.md },
  detailsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { color: dark.textMuted },
  number: { color: dark.textFaint, fontWeight: '800', fontSize: 13, fontVariant: ['tabular-nums'] },
  error: {
    color: dark.red,
    backgroundColor: dark.redSoft,
    borderRadius: 12,
    padding: spacing.md,
    fontWeight: '700',
    overflow: 'hidden',
  },
  money: { flexDirection: 'row', gap: spacing.sm },
  moneyBox: { flex: 1, borderRadius: 16, padding: spacing.md, gap: 2 },
  earning: { backgroundColor: dark.greenSoft },
  cash: { backgroundColor: dark.amberSoft },
  moneyLabel: { color: dark.textMuted, fontSize: 12.5, fontWeight: '800' },
  earningValue: { color: dark.green, fontSize: 28, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  cashValue: { color: dark.amber, fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'], marginTop: 4 },
  cashSplit: { color: dark.amber, fontSize: 11.5, fontWeight: '700', fontVariant: ['tabular-nums'], opacity: 0.9 },
  stop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  stopIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  zoneIcon: { backgroundColor: dark.greenSoft, borderWidth: 1.5, borderColor: 'rgba(47,211,138,0.6)', borderStyle: 'dashed' },
  stopInitials: { color: '#FFAA48', fontWeight: '900', fontSize: 13 },
  stopTitle: { color: dark.text, fontSize: 16, fontWeight: '900', letterSpacing: -0.2 },
  stopLine: { color: dark.textMuted, fontSize: 13, lineHeight: 18 },
  connector: { width: 2, height: 10, marginLeft: 17, marginVertical: -6, borderRadius: 1, backgroundColor: dark.border },
  facts: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: 2 },
  factsText: { color: dark.textMuted, fontSize: 13, fontWeight: '800' },
});
