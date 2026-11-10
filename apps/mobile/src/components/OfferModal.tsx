import { memo, useEffect, useMemo, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, useWindowDimensions, Vibration, View } from 'react-native';
import { Text } from './Text';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LABELS, type OfferDto } from '@yaar/shared';
import { useExpired } from '../hooks/useCountdown';
import { errorMessage, isApiError } from '../lib/api';
import { offerCash } from '../lib/delivery';
import { formatOfferEta, offerPlaces, offerScene, visibleOffer, type OfferScene } from '../lib/offer';
import { formatFcfa, formatKm } from '../lib/format';
import { useApi } from '../state/auth';
import { useDriver } from '../state/driver';
import { MAX_APP_WIDTH, palette, radii, shadows, spacing } from '../theme';
import { CountdownRing } from './design/CountdownRing';
import { Icon } from './design/Icon';
import { Pill } from './design/Pill';
import { RoundButton } from './design/RoundButton';
import { SheetSurface } from './design/Surfaces';
import { Money } from './driver/DriverKit';
import { LiveMap } from './map/LiveMap';
import { avatarInitials, vehicleSideGlyph } from './map/markerArt';
import { ArtView } from './map/MarkerViews';
import type { MapPadding } from './map/types';

/** Vibration d'une nouvelle offre (Android : motif ; iOS : deux impulsions). Jamais sur le web. */
const OFFER_VIBRATION = [0, 280, 160, 280];

/** En dessous de cette hauteur de fenêtre (ex. 360 × 640) : mise en page resserrée. */
const COMPACT_MAX_HEIGHT = 720;

/**
 * Hauteur maximale du détail (part de la fenêtre). Petit écran : jusqu'à la moitié, la carte cède la place pour que
 * gain, espèces, retrait et zone de livraison tiennent sans défiler ; le détail ne prend que la hauteur de son contenu.
 */
const DETAILS_MAX_HEIGHT = { regular: 0.42, compact: 0.5 } as const;

/** Rappel de confidentialité sous la zone de livraison (« Zone approximative » seulement sur un petit écran). */
const DROPOFF_PRIVACY_NOTE = 'Zone approximative : l’adresse exacte du destinataire s’affiche une fois la course acceptée.';

/**
 * Nouvelle course, en plein écran (comme les applications de coursiers), au dessin Cobalt : carte Cobalt claire avec
 * le livreur, le retrait (carré encre aux initiales de l'entreprise) et la zone de livraison (cercle doux : jamais
 * l'adresse du destinataire avant acceptation), pastilles blanches « Nouvelle course » et « ≈ N min · X km » jusqu'au
 * retrait, grand bouton rond cobalt « Accepter » dans l'anneau du compte à rebours de 30 s (rouge les 10 dernières
 * secondes), « Refuser » en pilule rouge pleine, puis la feuille blanche : gain (tuile cobalt douce), espèces (tuile
 * SOLEIL, texte encre ; retrait / livraison), entreprise, zone, distance. Sur un grand écran web, la colonne garde la
 * largeur de l'application. La barre d'état reste celle de l'application (texte foncé sur fond clair).
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
  const [topHeight, setTopHeight] = useState(0);
  const places = offerPlaces(offer);
  const cash = offerCash(offer);
  const eta = formatOfferEta(offer);
  // Petit téléphone (moins de 720 px de haut, ex. 360 × 640) : « Refuser » à côté de l'anneau, détail resserré (voir
  // DETAILS_MAX_HEIGHT) pour que le gain, les espèces et la zone de livraison se lisent sans défiler.
  const compact = height < COMPACT_MAX_HEIGHT;
  const ring = compact ? 108 : 136;

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
  // Cadrage dans la fenêtre de carte laissée libre entre la pastille du haut et le bloc du bas (mesurés).
  const padding = useMemo<MapPadding>(
    () => ({
      top: insets.top + spacing.md + (topHeight || 40) + 28,
      right: 48,
      bottom: (bottomHeight || Math.round(height * 0.55)) + 20,
      left: 48,
    }),
    [insets.top, topHeight, bottomHeight, height],
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
  const refuse = (
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
  );

  return (
    <View style={styles.root} accessibilityViewIsModal testID="offer-screen">
      {/* Recadrage une fois les blocs mesurés, puis à chaque changement de leur taille (message d'erreur…). */}
      <OfferMap scene={scene} padding={padding} recenterKey={bottomHeight > 0 && topHeight > 0 ? bottomHeight * 1000 + topHeight : 0} />

      <View
        style={[styles.top, { top: insets.top + spacing.md }]}
        pointerEvents="box-none"
        onLayout={(e) => setTopHeight(Math.round(e.nativeEvent.layout.height))}
      >
        {/* Le véhicule : son pictogramme dans la pastille (son nom dans le détail et pour les lecteurs d'écran). */}
        <Pill
          label="Nouvelle course"
          icon={<ArtView rects={vehicleSideGlyph(offer.vehicleType, palette.cobalt, palette.white)} size={22} />}
          tone="light"
          floating
          style={styles.topPill}
          textStyle={styles.topPillText}
          accessibilityLabel={`Nouvelle course, ${LABELS.vehicleType[offer.vehicleType]}`}
          testID="offer-title"
        />
        {eta ? (
          <Pill
            label={eta}
            icon="clock"
            tone="light"
            floating
            style={styles.topPill}
            textStyle={styles.topPillText}
            accessibilityLabel={`Retrait à ${eta.replace('≈', 'environ')}`}
            testID="offer-eta"
          />
        ) : null}
      </View>

      <View style={styles.bottom} onLayout={(e) => setBottomHeight(Math.round(e.nativeEvent.layout.height))}>
        <View style={[styles.actions, compact && styles.actionsRow]}>
          {compact ? refuse : null}
          <CountdownRing startAt={offer.offeredAt} endAt={offer.expiresAt} size={ring} strokeWidth={compact ? 7 : 8} testID="offer-countdown">
            {({ secondsLeft }) => (
              <RoundButton
                label={expired ? 'Expirée' : 'Accepter'}
                caption={expired ? null : `${secondsLeft} s`}
                icon="check"
                diameter={ring - 22}
                tone="primary"
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
          {compact ? null : refuse}
        </View>

        <SheetSurface
          style={[styles.sheet, compact && styles.sheetCompact, { paddingBottom: Math.max(insets.bottom, compact ? spacing.sm : spacing.md) }]}
          testID="offer-details"
        >
          {/* Rien n'est coupé (pas d'ellipse) : un contenu exceptionnellement long défile, barre de défilement visible. */}
          <ScrollView
            style={{ maxHeight: Math.round(height * (compact ? DETAILS_MAX_HEIGHT.compact : DETAILS_MAX_HEIGHT.regular)) }}
            showsVerticalScrollIndicator
            persistentScrollbar
            contentContainerStyle={[styles.details, compact && styles.detailsCompact]}
            testID="offer-details-scroll"
          >
            {/* Le véhicule passe sous le titre plutôt que d'être coupé quand la ligne est trop courte. */}
            <View style={[styles.detailsHeader, compact && styles.detailsHeaderCompact]}>
              <Text style={styles.kicker} accessibilityRole="header">
                Détails de la course
              </Text>
              <Text style={styles.facts} testID="offer-vehicle">
                {LABELS.vehicleType[offer.vehicleType]} · {formatKm(offer.distanceKm)} de course
              </Text>
            </View>
            {error ? (
              <View style={styles.error} accessibilityRole="alert">
                <Icon name="alert" size={18} color={palette.coralText} strokeWidth={2.4} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.money}>
              {/* Gain : tuile cobalt douce (le cobalt plein est réservé au bouton « Accepter »). */}
              <View style={[styles.moneyBox, compact && styles.moneyBoxCompact, styles.earning]} testID="offer-earning">
                <Text style={[styles.moneyLabel, { color: palette.cobaltText }]}>Votre gain</Text>
                <Money amount={offer.driverEarning} size={compact ? 26 : 34} color={palette.cobaltText} style={styles.moneyFigure} />
              </View>
              {/* Espèces : tuile SOLEIL pleine, texte encre (12,2:1), détail en encre brune (7,1:1). */}
              <View style={[styles.moneyBox, compact && styles.moneyBoxCompact, styles.cash, shadows.sun]} testID="offer-cash">
                <Text style={styles.moneyLabel}>Espèces à encaisser</Text>
                <Money amount={cash.total} size={compact ? 22 : 24} style={styles.moneyFigure} testID="offer-cash-total" />
                {split && !compact ? (
                  <Text style={styles.cashSplit} testID="offer-cash-split">
                    {split}
                  </Text>
                ) : null}
              </View>
            </View>
            {/* Petit écran : le détail retrait / livraison sur toute la largeur (une ligne) plutôt que sur trois lignes
                dans la case des espèces. */}
            {split && compact ? (
              <Text style={[styles.cashSplit, styles.cashSplitWide]} testID="offer-cash-split">
                {split}
              </Text>
            ) : null}

            <View style={styles.stop} testID="offer-pickup">
              {/* Entreprise : carré arrondi encre, initiales blanches (comme son marqueur sur la carte Cobalt). */}
              <View style={[styles.stopIcon, styles.businessIcon]}>
                {pickupInitials ? <Text style={styles.stopInitials}>{pickupInitials}</Text> : <Icon name="store" size={18} color={palette.white} />}
              </View>
              <View style={styles.flex}>
                <Text style={[styles.stopTitle, compact && styles.stopTitleCompact]}>
                  {offer.pickup.name ? `Récupérer chez ${places.pickupTitle}` : `Récupérer : ${places.pickupTitle}`}
                </Text>
                {pickupLine ? <Text style={styles.stopLine}>{pickupLine}</Text> : null}
              </View>
            </View>
            <View style={styles.connector} />
            <View style={styles.stop} testID="offer-dropoff">
              <View style={[styles.stopIcon, styles.zoneIcon]}>
                <Icon name="pin" size={18} color={palette.cobalt} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.stopTitle, compact && styles.stopTitleCompact]}>Livrer : {places.dropoffZone}</Text>
                <Text style={styles.stopLine}>{compact ? 'Zone approximative' : DROPOFF_PRIVACY_NOTE}</Text>
              </View>
            </View>
          </ScrollView>
        </SheetSurface>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  backdrop: { flex: 1, backgroundColor: palette.overlay, alignItems: 'center' },
  // Sur le web, la fenêtre modale couvre tout l'écran : la colonne garde la largeur de l'application.
  frame: { flex: 1, width: '100%', maxWidth: MAX_APP_WIDTH, overflow: 'hidden' },
  root: { flex: 1, backgroundColor: palette.canvas },
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
  topPill: { paddingHorizontal: 14, gap: 8 },
  topPillText: { fontSize: 14 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: spacing.md },
  actions: { alignItems: 'center', gap: 12 },
  actionsRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl },
  sheet: { paddingTop: 20 },
  sheetCompact: { paddingTop: spacing.md },
  details: { gap: spacing.md },
  detailsCompact: { gap: 10 },
  // Titre et véhicule sur une ligne ; s'ils n'y tiennent pas, le véhicule passe dessous (jamais coupé).
  detailsHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: spacing.sm, rowGap: 2 },
  detailsHeaderCompact: { flexDirection: 'column', alignItems: 'flex-start', gap: 2 },
  kicker: { fontSize: 17, lineHeight: 22, fontWeight: '800', letterSpacing: -0.2, color: palette.ink },
  facts: { color: palette.inkMuted, fontSize: 13, lineHeight: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  error: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radii.banner, backgroundColor: palette.coralTint },
  errorText: { flex: 1, color: palette.coralText, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  money: { flexDirection: 'row', gap: 10 },
  moneyBox: { flex: 1, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 14, gap: 4 },
  moneyBoxCompact: { paddingVertical: 10 },
  earning: { backgroundColor: palette.cobaltTint },
  cash: { backgroundColor: palette.sun },
  moneyLabel: { color: palette.ink, fontSize: 13, lineHeight: 17, fontWeight: '700' },
  moneyFigure: { marginTop: 2 },
  cashSplit: { color: palette.onSun2, fontSize: 12, lineHeight: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  // Petit écran : détail sur toute la largeur, sous les tuiles (fond blanc : encre brune des espèces, 5,9:1).
  cashSplitWide: { color: palette.amberText, fontSize: 12.5, marginTop: -2, paddingHorizontal: 2 },
  stop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  stopIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  businessIcon: { backgroundColor: palette.ink, borderRadius: 13 },
  zoneIcon: { backgroundColor: palette.cobaltTint, borderWidth: 1.5, borderColor: palette.cobalt, borderStyle: 'dashed' },
  stopInitials: { color: palette.white, fontWeight: '800', fontSize: 13.5, letterSpacing: 0.2 },
  stopTitle: { color: palette.ink, fontSize: 16, lineHeight: 21, fontWeight: '800', letterSpacing: -0.2 },
  stopTitleCompact: { fontSize: 15, lineHeight: 20 },
  stopLine: { color: palette.inkMuted, fontSize: 13.5, lineHeight: 19, fontWeight: '500' },
  connector: { width: 2, height: 12, marginLeft: 19, marginVertical: -7, borderRadius: 1, backgroundColor: palette.line },
});
