import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect, useIsFocused } from 'expo-router';
import { LABELS, type DriverProfileDto, type OrderDto } from '@yaar/shared';
import { PackageCard } from '../../../components/design/PackageCard';
import { Pill, type ChipTone } from '../../../components/design/Pill';
import { DarkProgress } from '../../../components/design/Surfaces';
import { GoOfflinePill, GoOnlineButton, OnlineStatusPill, SosButton } from '../../../components/DriverWidgets';
import { avatarInitials } from '../../../components/map/markerArt';
import type { SceneMarker } from '../../../components/map/types';
import { LiveTrackingLayout } from '../../../components/tracking/LiveTrackingLayout';
import { Banner, Button, Card, KeyValue, Loading, Muted, ProgressBar, Screen, Subtitle, Title } from '../../../components/ui';
import { useAsync } from '../../../hooks/useAsync';
import { useReadyScreenGate } from '../../../hooks/useReadyScreen';
import { hasTrackingConsent } from '../../../lib/consent';
import { amountsToCollect } from '../../../lib/delivery';
import { cashRatio } from '../../../lib/driverStatus';
import { formatFcfa, formatOrderNumber } from '../../../lib/format';
import { documentChecklist, kycProgress } from '../../../lib/kyc';
import { buildScene, orderSceneInput } from '../../../lib/liveScene';
import { visibleOffer } from '../../../lib/offer';
import { useApi } from '../../../state/auth';
import { useDriver } from '../../../state/driver';
import { colors, dark, spacing, typeScale } from '../../../theme';

/** Puce d'état d'une course en cours (accueil). */
function orderChip(o: OrderDto): { label: string; tone: ChipTone } {
  return { label: LABELS.orderStatus[o.status].toUpperCase(), tone: o.status === 'PICKED_UP' ? 'green' : 'amber' };
}

/** Course en cours : carte de colis (étape, cible, montant de l'étape) et « Ouvrir la course ». */
function CurrentOrderCard({ order: o }: { order: OrderDto }) {
  const pickupStage = o.status === 'ASSIGNED';
  const amounts = amountsToCollect(o);
  const open = () => router.push('/driver/order');
  const collect = pickupStage && amounts.atPickup > 0 ? amounts.atPickup : amounts.atDropoff;
  const recipient = o.recipientName ?? o.client?.name ?? 'Destinataire';
  return (
    <PackageCard
      kicker={`${pickupStage ? '1 · Récupérer' : '2 · Livrer'} · Course ${formatOrderNumber(o.number)}`}
      status={orderChip(o)}
      name={pickupStage ? (o.store?.name ?? o.pickup?.address ?? 'Point de retrait') : `Colis pour ${recipient}`}
      initials={avatarInitials(pickupStage ? o.store?.name : recipient)}
      address={(pickupStage ? o.pickup?.address : o.dropoff?.address) ?? null}
      description={o.parcelDescription}
      amount={collect > 0 ? { label: pickupStage && amounts.atPickup > 0 ? 'À encaisser au retrait' : 'À encaisser à la livraison', value: collect } : null}
      onPress={open}
      footer={<Pill label="Ouvrir la course" icon="chevronRight" tone="green" size="lg" onPress={open} style={styles.stretch} testID="open-order" />}
      testID="current-order"
    />
  );
}

/** Gains du jour et espèces détenues / plafond (feuille de l'accueil). */
function TodayBlock({ profile, earnings }: { profile: DriverProfileDto; earnings: { earnings: number; deliveries: number } | null }) {
  const ratio = cashRatio(profile.cashHeld, profile.cashLimit);
  return (
    <View style={styles.today}>
      <View style={styles.todayTop}>
        <View style={{ gap: 2 }}>
          <Text style={[typeScale.kicker, styles.faint]}>Aujourd’hui</Text>
          <Text style={styles.todayEarnings} testID="today-earnings">
            {earnings ? formatFcfa(earnings.earnings) : '—'}
          </Text>
        </View>
        <Text style={styles.todayCount}>
          {earnings ? `${earnings.deliveries} course${earnings.deliveries > 1 ? 's' : ''}` : ''}
        </Text>
      </View>
      <View style={styles.cashRow}>
        <Text style={styles.cashLabel}>Espèces détenues</Text>
        <Text style={styles.cashValue} testID="cash-held">
          {formatFcfa(profile.cashHeld)}
          <Text style={styles.cashLimit}> / {formatFcfa(profile.cashLimit)}</Text>
        </Text>
      </View>
      <DarkProgress value={ratio} color={ratio >= 0.8 ? dark.red : dark.amber} />
      <Text style={styles.small}>À déposer auprès de Yaar avant d’atteindre le plafond.</Text>
    </View>
  );
}

/**
 * Accueil du livreur : carte claire plein écran (sa position), pastille d'état « En ligne : suivi GPS actif » et SOS
 * en haut. Hors ligne : grand bouton rond « Passer en ligne ». En ligne : feuille sombre « En attente de courses… »
 * avec les gains du jour et les espèces détenues ; avec une course : sa carte de colis → « Ouvrir la course ».
 * Dossier non validé (en attente, refusé, suspendu) : écran du dossier.
 */
export default function DriverHome() {
  const api = useApi();
  const { profile, profileError, currentOrder, position, refreshProfile, orderNotice, clearOrderNotice, availabilityError, offers } = useDriver();
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
        <Banner message={profileError} />
        <Button title="Réessayer" color={colors.green} onPress={() => void refreshProfile()} />
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

  if (profile.status !== 'APPROVED') {
    const items = documentChecklist(profile.vehicleType, profile.documents);
    const { done, total } = kycProgress(items);
    return (
      <Screen refreshing={refreshing} onRefresh={refresh}>
        <Title style={styles.heavyTitle}>Mon dossier livreur</Title>
        <Card highlight={profile.status === 'PENDING' ? colors.orange : colors.red}>
          <Subtitle style={{ fontWeight: '900' }}>{LABELS.driverStatus[profile.status]}</Subtitle>
          {profile.status === 'PENDING' ? (
            <Muted>
              {profile.kycComplete
                ? 'Votre dossier est complet. Un contrôleur Yaar va le vérifier (généralement sous 24 h).'
                : 'Ajoutez les pièces manquantes pour que votre dossier soit examiné.'}
            </Muted>
          ) : null}
          {profile.rejectionReason ? <Muted>Motif du refus : {profile.rejectionReason}</Muted> : null}
          {profile.suspensionReason ? <Muted>Motif de la suspension : {profile.suspensionReason}</Muted> : null}
          {profile.status === 'REJECTED' ? <Muted>Corrigez vos pièces : le dossier repassera en vérification.</Muted> : null}
        </Card>
        <Card>
          <KeyValue label="Pièces fournies" value={`${done} / ${total}`} strong />
          <ProgressBar value={total ? done / total : 0} color={colors.green} />
          <KeyValue label="Véhicule" value={`${LABELS.vehicleType[profile.vehicleType]}${profile.plate ? ` · ${profile.plate}` : ''}`} />
        </Card>
        {profile.status !== 'SUSPENDED' ? (
          <Button title="Compléter mes documents" color={colors.green} onPress={() => router.navigate('/driver/documents')} />
        ) : null}
        <Button title="Actualiser" variant="outline" onPress={refresh} loading={refreshing} />
        <View style={styles.sosInline}>
          <SosButton />
        </View>
      </Screen>
    );
  }

  const online = profile.isOnline;
  const message = error ?? availabilityError;
  // Une offre affichée en plein écran a sa propre carte : celle de l'accueil est démontée (une carte WebGL à la fois).
  const offerShown = !!visibleOffer(profile, currentOrder, offers);
  const today = earnings.data?.today ?? null;

  return (
    <LiveTrackingLayout
      markers={scene.markers}
      lines={scene.lines}
      fitPoints={scene.fitPoints}
      stageKey={currentOrder?.status ?? (online ? 'online' : 'offline')}
      animationMs={1200}
      allowRotate
      sheetTheme="dark"
      insetBottom={false}
      mapVisible={focused && !offerShown}
      topCenter={<OnlineStatusPill />}
      topRight={<SosButton size={48} />}
      aboveSheet={!online ? <GoOnlineButton onError={setError} /> : null}
      testID="driver-home"
    >
      {message ? (
        <Text style={styles.error} accessibilityRole="alert">
          {message}
        </Text>
      ) : null}
      {orderNotice ? (
        <Pressable onPress={clearOrderNotice} accessibilityRole="button" accessibilityHint="Masquer le message">
          <Text style={styles.notice}>{`${orderNotice} (toucher pour masquer)`}</Text>
        </Pressable>
      ) : null}
      {profile.cashBlocked ? (
        <Text style={styles.error} accessibilityRole="alert">
          {`Plafond d’espèces atteint (${formatFcfa(profile.cashHeld)}). Déposez l’argent auprès de Yaar pour recevoir des courses.`}
        </Text>
      ) : null}

      {currentOrder ? (
        <CurrentOrderCard order={currentOrder} />
      ) : online ? (
        <View style={{ gap: 4 }}>
          <View style={styles.waitTitleRow}>
            <View style={styles.liveDot} />
            <Text style={styles.title} accessibilityRole="header">
              En attente de courses…
            </Text>
          </View>
          <Text style={styles.muted}>Les nouvelles courses apparaissent ici avec 30 secondes pour accepter.</Text>
        </View>
      ) : (
        <View style={{ gap: 4 }}>
          <Text style={styles.title} accessibilityRole="header">
            Vous êtes hors ligne
          </Text>
          <Text style={styles.muted}>
            Passez en ligne pour recevoir des courses. Votre position n’est suivie et partagée que lorsque vous êtes en ligne.
          </Text>
          {!hasTrackingConsent(profile) ? (
            <Text style={styles.small}>
              Avant votre premier passage en ligne, Yaar vous demandera d’accepter le suivi de votre position pendant le service.
            </Text>
          ) : null}
        </View>
      )}

      <TodayBlock profile={profile} earnings={today} />
      {online && !currentOrder ? (
        <View style={styles.offline}>
          <GoOfflinePill onError={setError} />
        </View>
      ) : null}
    </LiveTrackingLayout>
  );
}

const styles = StyleSheet.create({
  stretch: { alignSelf: 'stretch' },
  heavyTitle: { fontWeight: '900', letterSpacing: -0.4 },
  sosInline: { alignItems: 'center', marginTop: spacing.lg },
  offline: { alignItems: 'center', paddingTop: 2 },
  waitTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: dark.green },
  title: { ...typeScale.subtitle, color: dark.text, fontSize: 20, fontWeight: '900' },
  muted: { color: dark.textMuted, fontSize: 14, lineHeight: 20 },
  faint: { color: dark.textFaint },
  small: { color: dark.textFaint, fontSize: 12.5, lineHeight: 17 },
  error: { color: dark.red, backgroundColor: dark.redSoft, borderRadius: 12, padding: spacing.md, fontWeight: '700', overflow: 'hidden' },
  notice: { color: dark.amber, backgroundColor: dark.amberSoft, borderRadius: 12, padding: spacing.md, fontWeight: '700', overflow: 'hidden' },
  today: { gap: spacing.sm, padding: spacing.md, borderRadius: 18, backgroundColor: dark.raised, borderWidth: 1, borderColor: dark.border },
  todayTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  todayEarnings: { color: dark.green, fontSize: 28, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  todayCount: { color: dark.textMuted, fontSize: 14, fontWeight: '800', paddingBottom: 4 },
  cashRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm, marginTop: 4 },
  cashLabel: { color: dark.textMuted, fontSize: 14, fontWeight: '700' },
  cashValue: { color: dark.text, fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  cashLimit: { color: dark.textFaint, fontSize: 13, fontWeight: '700' },
});
