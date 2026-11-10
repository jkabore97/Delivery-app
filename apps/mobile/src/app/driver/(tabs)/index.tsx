import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '../../../components/Text';
import { Redirect, router, useFocusEffect, useIsFocused } from 'expo-router';
import { LABELS, type DriverProfileDto, type DriverStatus, type OrderDto } from '@yaar/shared';
import { Icon, type IconName } from '../../../components/design/Icon';
import { Pill, StatusChip, type ChipTone } from '../../../components/design/Pill';
import { CashMeter, IconDisc, Meter, Money, ScreenTitle, WhiteCard, type KitTone } from '../../../components/driver/DriverKit';
import { GoOfflinePill, GoOnlineButton, OnlineStatusPill, SosButton } from '../../../components/DriverWidgets';
import { avatarInitials } from '../../../components/map/markerArt';
import type { MapPoint, SceneLine, SceneMarker } from '../../../components/map/types';
import { LiveTrackingLayout } from '../../../components/tracking/LiveTrackingLayout';
import { Banner, Button, Loading, Screen } from '../../../components/ui';
import { useAsync } from '../../../hooks/useAsync';
import { useReadyScreenGate } from '../../../hooks/useReadyScreen';
import { hasTrackingConsent } from '../../../lib/consent';
import { amountsToCollect } from '../../../lib/delivery';
import { formatFcfa, formatOrderNumber } from '../../../lib/format';
import { documentChecklist, kycProgress } from '../../../lib/kyc';
import { buildScene, orderSceneInput } from '../../../lib/liveScene';
import { visibleOffer } from '../../../lib/offer';
import { useApi } from '../../../state/auth';
import { useDriver } from '../../../state/driver';
import { palette, radii, spacing } from '../../../theme';

/** Puce d'état d'une course en cours, vue par le livreur : retrait (soleil), en livraison (cobalt). */
function orderChip(o: OrderDto): { label: string; tone: ChipTone } {
  return o.status === 'PICKED_UP' ? { label: 'En livraison', tone: 'blue' } : { label: 'Retrait', tone: 'amber' };
}

/**
 * Course en cours, dans la feuille : étape et numéro, cible de l'étape en grand, adresse, espèces de l'étape (barre
 * soleil) et « Ouvrir la course » (un seul bouton : le bloc lui-même n'en est pas un, pas de bouton imbriqué).
 */
function CurrentOrderCard({ order: o }: { order: OrderDto }) {
  const pickupStage = o.status === 'ASSIGNED';
  const amounts = amountsToCollect(o);
  const collect = pickupStage && amounts.atPickup > 0 ? amounts.atPickup : amounts.atDropoff;
  const recipient = o.recipientName ?? o.client?.name ?? 'Destinataire';
  const chip = orderChip(o);
  const address = (pickupStage ? o.pickup?.address : o.dropoff?.address) ?? null;
  return (
    <View style={styles.order} testID="current-order">
      <View style={styles.orderTop}>
        <Text style={styles.orderKicker}>{`${pickupStage ? '1 · Récupérer' : '2 · Livrer'} · Course ${formatOrderNumber(o.number)}`}</Text>
        <StatusChip label={chip.label} tone={chip.tone} />
      </View>
      <Text style={styles.orderName} accessibilityRole="header">
        {pickupStage ? (o.store?.name ?? o.pickup?.address ?? 'Point de retrait') : `Colis pour ${recipient}`}
      </Text>
      {address ? (
        <View style={styles.orderLine}>
          <Icon name="pin" size={16} color={palette.inkMuted} strokeWidth={2.3} />
          <Text style={styles.orderAddress}>{address}</Text>
        </View>
      ) : null}
      {collect > 0 ? (
        <View style={styles.collect}>
          <Text style={styles.collectLabel}>{pickupStage && amounts.atPickup > 0 ? 'À encaisser au retrait' : 'À encaisser à la livraison'}</Text>
          <Money amount={collect} size={20} />
        </View>
      ) : null}
      <Pill label="Ouvrir la course" icon="chevronRight" tone="cobalt" size="lg" onPress={() => router.push('/driver/order')} style={styles.stretch} testID="open-order" />
    </View>
  );
}

/**
 * Gains du jour (grand chiffre cobalt) et espèces détenues / plafond (jauge soleil), dans un bloc rempli de la feuille.
 * `compact` (course en cours, petit téléphone) : chiffre moins grand, marges réduites.
 */
function TodayBlock({ profile, earnings, compact }: { profile: DriverProfileDto; earnings: { earnings: number; deliveries: number } | null; compact?: boolean }) {
  return (
    <View style={[styles.today, compact && styles.todayCompact]}>
      <View style={styles.todayTop}>
        <View style={styles.todayText}>
          <Text style={styles.todayLabel}>Gains du jour</Text>
          {earnings ? (
            <Money amount={earnings.earnings} size={compact ? 26 : 32} color={palette.cobalt} testID="today-earnings" />
          ) : (
            <Text style={[styles.todayPlaceholder, compact && { fontSize: 26, lineHeight: 30 }]} testID="today-earnings">
              —
            </Text>
          )}
        </View>
        {earnings ? (
          <View style={styles.countPill}>
            <Icon name="package" size={15} color={palette.cobaltText} strokeWidth={2.4} />
            <Text style={styles.countText}>{`${earnings.deliveries} course${earnings.deliveries > 1 ? 's' : ''}`}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.rule} />
      <CashMeter
        held={profile.cashHeld}
        limit={profile.cashLimit}
        blocked={profile.cashBlocked}
        caption={profile.cashBlocked ? 'atteint : dépôt nécessaire' : 'à déposer auprès de Yaar'}
      />
    </View>
  );
}

/** Pictogramme et ton de l'état du dossier (en attente : cobalt ; refusé, suspendu : rouge). */
const DOSSIER: Record<Exclude<DriverStatus, 'APPROVED'>, { icon: IconName; tone: KitTone }> = {
  PENDING: { icon: 'clock', tone: 'cobalt' },
  REJECTED: { icon: 'alert', tone: 'coral' },
  SUSPENDED: { icon: 'alert', tone: 'coral' },
};

/** Dossier pas encore validé (en attente, refusé, suspendu) : état, pièces fournies, actions. */
function DossierScreen({ profile, refreshing, refresh }: { profile: DriverProfileDto; refreshing: boolean; refresh: () => Promise<void> }) {
  const items = documentChecklist(profile.vehicleType, profile.documents);
  const { done, total } = kycProgress(items);
  const look = DOSSIER[profile.status as Exclude<DriverStatus, 'APPROVED'>] ?? DOSSIER.PENDING;
  const reason = profile.rejectionReason ? `Motif du refus : ${profile.rejectionReason}` : profile.suspensionReason ? `Motif de la suspension : ${profile.suspensionReason}` : null;
  return (
    <Screen refreshing={refreshing} onRefresh={() => void refresh()}>
      <ScreenTitle title="Mon dossier livreur" subtitle={`${LABELS.vehicleType[profile.vehicleType]}${profile.plate ? ` · ${profile.plate}` : ''}`} />
      <WhiteCard testID="dossier-status">
        <View style={styles.dossierHead}>
          <IconDisc icon={look.icon} tone={look.tone} size={48} />
          <Text style={styles.dossierTitle} accessibilityRole="header">
            {LABELS.driverStatus[profile.status]}
          </Text>
        </View>
        {profile.status === 'PENDING' ? (
          <Text style={styles.body}>
            {profile.kycComplete
              ? 'Votre dossier est complet. Un contrôleur Yaar va le vérifier (généralement sous 24 h).'
              : 'Ajoutez les pièces manquantes pour que votre dossier soit examiné.'}
          </Text>
        ) : null}
        {reason ? <Banner message={reason} tone="red" /> : null}
        {profile.status === 'REJECTED' ? <Text style={styles.body}>Corrigez vos pièces : le dossier repassera en vérification.</Text> : null}
      </WhiteCard>
      <WhiteCard>
        <View style={styles.piecesRow}>
          <Text style={styles.piecesLabel}>Pièces fournies</Text>
          <Text style={styles.piecesValue} accessibilityLabel={`${done} pièces fournies sur ${total}`}>
            {done}
            <Text style={styles.piecesTotal}>{` / ${total}`}</Text>
          </Text>
        </View>
        <Meter value={total ? done / total : 0} color={palette.cobalt} label="Pièces fournies" />
      </WhiteCard>
      {profile.status !== 'SUSPENDED' ? (
        <Button title="Compléter mes documents" icon={(c) => <Icon name="document" size={20} color={c} />} onPress={() => router.navigate('/driver/documents')} />
      ) : null}
      <Button title="Actualiser" variant="outline" icon={(c) => <Icon name="refresh" size={18} color={c} />} onPress={() => void refresh()} loading={refreshing} />
      <View style={styles.sosInline}>
        <SosButton />
        <Text style={styles.sosHint}>En cas de danger : alerte immédiate des contrôleurs Yaar.</Text>
      </View>
    </Screen>
  );
}

/**
 * Accueil du livreur (Cobalt) : carte claire plein écran (sa position), indicateur légal « En ligne : suivi GPS actif »
 * et SOS en haut. Hors ligne : grand bouton rond cobalt « Passer en ligne » au-dessus de la feuille. En ligne :
 * « En attente de courses… ». Toujours : gains du jour en grand (cobalt) et espèces détenues / plafond (jauge soleil).
 * Avec une course : sa carte (étape, cible, espèces) → « Ouvrir la course ». Dossier non validé : écran du dossier.
 */
export default function DriverHome() {
  const api = useApi();
  const { profile, profileError, currentOrder, position, refreshProfile } = useDriver();
  const focused = useIsFocused();
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const approved = profile?.status === 'APPROVED';
  // Gains du jour : au montage, quand le solde d'espèces change (course livrée) et au retour sur l'accueil.
  const earnings = useAsync(() => api.driverEarnings(), [api, profile?.cashHeld], approved);
  const { reload } = earnings;
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false; // premier affichage : déjà chargé par useAsync
        return;
      }
      if (approved) void reload(true);
    }, [approved, reload]),
  );
  useReadyScreenGate(profile, focused);

  const me = position ? { lat: position.lat, lng: position.lng, heading: position.heading ?? null } : null;
  // Carte : la course en cours (retrait / livraison, épingles aux initiales) ou seulement la position du livreur.
  const scene = useMemo(() => {
    if (currentOrder) {
      const recipient = currentOrder.recipientName ?? currentOrder.client?.name ?? null;
      return buildScene({
        ...orderSceneInput(currentOrder, me),
        initials: { pickup: avatarInitials(currentOrder.store?.name), dropoff: avatarInitials(recipient) },
      });
    }
    const markers: SceneMarker[] = me
      ? [{ id: 'me', kind: 'driver', lat: me.lat, lng: me.lng, heading: me.heading, vehicleType: profile?.vehicleType ?? 'MOTO', title: 'Vous' }]
      : [];
    return { markers, lines: [], fitPoints: me ? [me] : [] };
  }, [currentOrder, me?.lat, me?.lng, me?.heading, profile?.vehicleType]); // eslint-disable-line react-hooks/exhaustive-deps

  if (profile === undefined) {
    return profileError ? (
      <Screen>
        <ScreenTitle title="Accueil" />
        <Banner message={profileError} />
        <Button title="Réessayer" onPress={() => void refreshProfile()} />
      </Screen>
    ) : (
      <Loading />
    );
  }
  if (profile === null) return <Redirect href="/driver/onboarding" />;

  const refresh = async () => {
    setRefreshing(true);
    await refreshProfile();
    setRefreshing(false);
  };

  if (profile.status !== 'APPROVED') return <DossierScreen profile={profile} refreshing={refreshing} refresh={refresh} />;
  return (
    <HomeMap
      profile={profile}
      scene={scene}
      focused={focused}
      error={error}
      setError={setError}
      today={earnings.data?.today ?? null}
    />
  );
}

/** Petit téléphone (hauteur < 700 px, ex. 360 × 640) : textes courts, bloc du jour resserré. */
const SHORT_SCREEN = 700;
/** Fondu posé au-dessus du bas de la feuille (sous la barre d'onglets) : le contenu qui défile n'y est jamais coupé net. */
const FADE = 24;

/** Accueil d'un livreur validé : carte plein écran, bouton rond « Passer en ligne », feuille du jour. */
function HomeMap({
  profile,
  scene,
  focused,
  error,
  setError,
  today,
}: {
  profile: DriverProfileDto;
  scene: { markers: SceneMarker[]; lines: SceneLine[]; fitPoints: MapPoint[] };
  focused: boolean;
  error: string | null;
  setError: (m: string | null) => void;
  today: { earnings: number; deliveries: number } | null;
}) {
  const { currentOrder, orderNotice, clearOrderNotice, availabilityError, offers } = useDriver();
  const short = useWindowDimensions().height < SHORT_SCREEN;

  const online = profile.isOnline;
  // Plafond d'espèces atteint : le serveur refuse le passage en ligne (CASH_LIMIT_REACHED) tant que rien n'est déposé.
  const cashBlocked = profile.cashBlocked;
  const message = error ?? availabilityError;
  // Une offre affichée en plein écran a sa propre carte : celle de l'accueil est démontée (une carte WebGL à la fois).
  const offerShown = !!visibleOffer(profile, currentOrder, offers);

  return (
    <LiveTrackingLayout
      markers={scene.markers}
      lines={scene.lines}
      fitPoints={scene.fitPoints}
      stageKey={currentOrder?.status ?? (online ? 'online' : 'offline')}
      animationMs={1200}
      allowRotate
      insetBottom={false}
      // Petit téléphone : feuille un peu plus haute (la barre d'onglets flottante en prend le bas).
      sheetMaxRatio={short ? 0.6 : undefined}
      mapVisible={focused && !offerShown}
      topCenter={<OnlineStatusPill />}
      topRight={<SosButton size={48} />}
      // Hors ligne : grand bouton rond « Passer en ligne » ; en ligne sans course : pilule blanche « Passer hors ligne »,
      // au même endroit (la feuille garde la place des gains et des espèces).
      aboveSheet={!online ? <GoOnlineButton onError={setError} blocked={cashBlocked} /> : !currentOrder ? <GoOfflinePill onError={setError} floating /> : null}
      // Fondu au-dessus de la barre d'onglets : une ligne qui défile s'y efface au lieu d'être coupée net.
      footer={<View pointerEvents="none" style={styles.fade} testID="sheet-fade" />}
      testID="driver-home"
    >
      {message ? <Banner message={message} tone="red" /> : null}
      {orderNotice ? (
        <Pressable onPress={clearOrderNotice} accessibilityRole="button" accessibilityHint="Masquer le message" style={styles.notice}>
          <Icon name="alert" size={18} color={palette.sunText} strokeWidth={2.4} />
          <Text style={styles.noticeText}>{`${orderNotice} (toucher pour masquer)`}</Text>
        </Pressable>
      ) : null}
      {cashBlocked ? (
        <View style={styles.blocked} accessibilityRole="alert" testID="cash-blocked">
          <IconDisc icon="cash" tone="coral" size={40} style={styles.blockedIcon} />
          <View style={styles.flex}>
            <Text style={styles.blockedTitle}>{`Plafond d’espèces atteint (${formatFcfa(profile.cashHeld)}).`}</Text>
            <Text style={styles.blockedText}>
              {online
                ? 'Déposez l’argent auprès de Yaar pour recevoir des courses.'
                : 'Déposez l’argent auprès de Yaar : vous pourrez repasser en ligne dès que le dépôt sera enregistré.'}
            </Text>
          </View>
        </View>
      ) : null}

      {currentOrder ? (
        <CurrentOrderCard order={currentOrder} />
      ) : cashBlocked ? null : online ? (
        <View style={styles.head}>
          <View style={styles.waitRow}>
            <View style={styles.liveDot} />
            <Text style={styles.title} accessibilityRole="header">
              En attente de courses…
            </Text>
          </View>
          <Text style={styles.muted}>Les nouvelles courses apparaissent ici avec 30 secondes pour accepter.</Text>
        </View>
      ) : (
        <View style={styles.head}>
          <Text style={styles.title} accessibilityRole="header">
            Vous êtes hors ligne
          </Text>
          <Text style={styles.muted}>
            {short
              ? 'Passez en ligne pour recevoir des courses.'
              : 'Passez en ligne pour recevoir des courses. Votre position n’est suivie et partagée que lorsque vous êtes en ligne.'}
          </Text>
          {!hasTrackingConsent(profile) ? (
            <View style={styles.consentNote}>
              <Icon name="shield" size={16} color={palette.cobaltText} strokeWidth={2.4} />
              <Text style={styles.consentText}>Avant de passer en ligne, Yaar vous demandera d’accepter le suivi de votre position pendant le service.</Text>
            </View>
          ) : null}
        </View>
      )}

      <TodayBlock profile={profile} earnings={today} compact={short || !!currentOrder} />
      {/* Place du fondu : la dernière ligne peut remonter au-dessus de lui. */}
      <View style={{ height: FADE - spacing.md }} />
    </LiveTrackingLayout>
  );
}

const styles = StyleSheet.create({
  stretch: { alignSelf: 'stretch', justifyContent: 'center' },
  head: { gap: 6 },
  waitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.cobalt, boxShadow: '0 0 0 5px rgba(36, 72, 255, 0.16)' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: -0.4, color: palette.ink },
  muted: { fontSize: 15, lineHeight: 21, fontWeight: '500', color: palette.inkMuted },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '500', color: palette.ink },
  consentNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: radii.banner, backgroundColor: palette.cobaltTint, marginTop: 4 },
  consentText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600', color: palette.cobaltText },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radii.banner, backgroundColor: palette.sunTint },
  noticeText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600', color: palette.sunText },
  flex: { flex: 1, gap: 2 },
  blocked: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 20, backgroundColor: palette.coralTint },
  blockedIcon: { backgroundColor: palette.white },
  blockedTitle: { fontSize: 15, lineHeight: 20, fontWeight: '800', color: palette.coralText, fontVariant: ['tabular-nums'] },
  blockedText: { fontSize: 13.5, lineHeight: 19, fontWeight: '600', color: palette.coralText },
  today: { gap: 14, padding: spacing.lg, borderRadius: 24, backgroundColor: palette.raised },
  todayCompact: { gap: 10, paddingVertical: 14 },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -FADE,
    height: FADE,
    backgroundImage: 'linear-gradient(to bottom, rgba(255, 255, 255, 0), #FFFFFF)',
  },
  todayTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.sm },
  todayText: { flex: 1, gap: 2 },
  todayLabel: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: palette.inkMuted },
  todayPlaceholder: { fontSize: 34, lineHeight: 38, fontWeight: '800', color: palette.inkMuted },
  countPill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: palette.cobaltTint, marginBottom: 4 },
  countText: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: palette.cobaltText, fontVariant: ['tabular-nums'] },
  rule: { height: 1, backgroundColor: palette.line },
  order: { gap: 10 },
  orderTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  orderKicker: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: palette.cobaltText, fontVariant: ['tabular-nums'] },
  orderName: { fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: -0.4, color: palette.ink },
  orderLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  orderAddress: { flex: 1, fontSize: 15, lineHeight: 21, fontWeight: '500', color: palette.inkMuted },
  collect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    borderRadius: 18,
    backgroundColor: palette.sun,
  },
  collectLabel: { flexShrink: 1, fontSize: 14, lineHeight: 19, fontWeight: '700', color: palette.ink },
  dossierHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  dossierTitle: { flex: 1, fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: -0.4, color: palette.ink },
  piecesRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  piecesLabel: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: palette.ink },
  piecesValue: { fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -0.8, color: palette.ink, fontVariant: ['tabular-nums'] },
  piecesTotal: { fontSize: 18, fontWeight: '800', color: palette.inkMuted, letterSpacing: 0 },
  sosInline: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  sosHint: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: palette.inkMuted, textAlign: 'center' },
});
