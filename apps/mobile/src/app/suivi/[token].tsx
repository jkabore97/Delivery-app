import { useEffect, useMemo, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Head from 'expo-router/head';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isTerminal, type TrackingDto } from '@yaar/shared';
import { FloatingChip, LiveTrackingLayout } from '../../components/tracking/LiveTrackingLayout';
import {
  AmountBox,
  ArrivalHeadline,
  CallButton,
  DeliveryCodeChip,
  DriverCard,
  InfoRow,
  StepsProgress,
} from '../../components/tracking/TrackingParts';
import { usePublicTracking } from '../../hooks/usePublicTracking';
import { formatOrderNumber, formatTime } from '../../lib/format';
import { buildScene, estimateArrivalMinutes, isLiveStage, trackingSceneInput } from '../../lib/liveScene';
import { preloadMapEngine } from '../../lib/map/preload';
import { trackingPollMs } from '../../lib/publicConfig';
import { trackingHeadline, trackingSteps } from '../../lib/trackingSteps';
import { hideWebSplash } from '../../lib/webShell';
import { useAppConfig } from '../../state/config';
import { colors, radius, spacing } from '../../theme';

const TRACKING_PAGE_TITLE = 'Suivi de livraison · Yaar Livraison';

// La carte est le cœur de la page : son moteur (MapLibre, web) est téléchargé dès le chargement de l'écran.
preloadMapEngine();

/**
 * Page publique du destinataire (lien reçu par SMS / WhatsApp), SANS compte ni connexion : carte en direct,
 * heure d'arrivée, étapes, livreur, code à donner au livreur, montant à payer. Rafraîchie toutes les
 * `trackingPollIntervalMs` de GET /config (8 s par défaut) pendant la course, deux fois moins souvent pendant la
 * recherche d'un livreur, en pause quand l'onglet est masqué.
 */
export default function PublicTrackingScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { config } = useAppConfig();
  const state = usePublicTracking(token, { intervalMs: (data) => trackingPollMs(config, data?.status) || 60_000 });
  useEffect(() => hideWebSplash(), []);

  return (
    <>
      <Head>
        <title>{TRACKING_PAGE_TITLE}</title>
        <meta name="robots" content="noindex" />
        {/* Le jeton du lien ne doit jamais partir vers les serveurs de tuiles (en-tête Referer). */}
        <meta name="referrer" content="no-referrer" />
      </Head>
      <Stack.Screen options={{ title: TRACKING_PAGE_TITLE, headerShown: false }} />
      {state.status === 'loading' ? (
        <CenteredCard testID="tracking-loading">
          <ActivityIndicator size="large" color={colors.green} />
          <Text style={styles.cardText}>Chargement du suivi…</Text>
        </CenteredCard>
      ) : state.status === 'notFound' ? (
        <CenteredCard testID="tracking-expired">
          <Text style={styles.bigIcon}>🔗</Text>
          <Text style={styles.cardTitle}>Ce lien de suivi n’est plus valide</Text>
          <Text style={styles.cardText}>
            Il a expiré (24 h après la livraison) ou il est incomplet. Vérifiez le lien reçu par SMS ou WhatsApp, ou
            demandez-en un nouveau à l’expéditeur.
          </Text>
        </CenteredCard>
      ) : state.status === 'error' ? (
        state.rateLimited ? (
          <CenteredCard testID="tracking-rate-limited">
            <Text style={styles.bigIcon}>⏳</Text>
            <Text style={styles.cardTitle}>Trop de demandes depuis votre connexion</Text>
            <Text style={styles.cardText}>
              Beaucoup de personnes suivent un colis depuis le même réseau. Gardez cette page ouverte : le suivi reprend
              tout seul dans moins d’une minute.
            </Text>
          </CenteredCard>
        ) : (
          <CenteredCard testID="tracking-error">
            <Text style={styles.bigIcon}>📶</Text>
            <Text style={styles.cardTitle}>Connexion impossible</Text>
            <Text style={styles.cardText}>{state.message} Nouvel essai automatique dans quelques secondes.</Text>
          </CenteredCard>
        )
      ) : (
        <TrackingView data={state.data} stale={state.stale} animationMs={trackingPollMs(config, 'PICKED_UP')} />
      )}
    </>
  );
}

function CenteredCard({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <SafeAreaView style={styles.centerRoot}>
      <Brand />
      <View style={styles.card} testID={testID}>
        {children}
      </View>
      <Text style={styles.footerNote}>Yaar Livraison · Ouagadougou</Text>
    </SafeAreaView>
  );
}

function Brand() {
  return (
    <View style={styles.brand}>
      <Text style={styles.brandLogo}>Yaar</Text>
      <Text style={styles.brandSub}>Livraison</Text>
    </View>
  );
}

function TrackingView({ data: t, stale, animationMs }: { data: TrackingDto; stale: boolean; animationMs: number }) {
  const input = useMemo(() => trackingSceneInput(t), [t]);
  const scene = useMemo(() => buildScene(input), [input]);
  const eta = estimateArrivalMinutes(scene, input, t.etaMinutes);
  const headline = trackingHeadline(t.status, 'recipient', { sender: t.sender.name, driver: t.driver?.firstName });
  const done = isTerminal(t.status);

  return (
    <LiveTrackingLayout
      markers={scene.markers}
      lines={scene.lines}
      fitPoints={scene.fitPoints}
      stageKey={t.status}
      animationMs={animationMs}
      allowWide
      topCenter={
        <FloatingChip testID="brand-chip">
          <Text style={styles.chipLogo}>Yaar</Text>
          <Text style={styles.chipText}>Suivi de votre colis</Text>
        </FloatingChip>
      }
      testID="public-tracking"
    >
      {stale ? <Text style={styles.stale}>Connexion instable : position mise à jour dès que possible…</Text> : null}
      {t.status === 'DELIVERED' ? <Text style={styles.deliveredIcon}>✅</Text> : null}
      <ArrivalHeadline etaMinutes={eta} headline={headline} />
      {t.status !== 'CANCELLED' ? <StepsProgress steps={trackingSteps(t.status, 'recipient')} /> : null}

      {t.deliveryCode && !done ? <DeliveryCodeChip code={t.deliveryCode} /> : null}
      {t.amountToPay > 0 && !done ? (
        <AmountBox
          label="À payer au livreur à la réception"
          amount={t.amountToPay}
          detail="En espèces, quand vous recevez le colis."
          testID="amount-to-pay"
        />
      ) : null}

      {t.driver && isLiveStage(scene.stage) ? (
        <DriverCard
          name={t.driver.firstName}
          vehicleType={t.driver.vehicleType}
          plate={t.driver.plate}
          ratingAvg={t.driver.ratingAvg}
          phone={t.driver.phone}
        />
      ) : null}

      <View style={styles.block}>
        <InfoRow
          icon="🏪"
          title={t.sender.name}
          subtitle="Expéditeur"
          right={t.sender.phone && (t.status === 'CANCELLED' || t.status === 'SEARCHING_DRIVER') ? <CallButton phone={t.sender.phone} label="Appeler" /> : null}
          testID="sender"
        />
        <InfoRow
          icon="📍"
          title={t.dropoff.address}
          subtitle={t.dropoff.landmark ? `Repère : ${t.dropoff.landmark}` : null}
          testID="dropoff-address"
        />
        {t.packageDescription ? <InfoRow icon="📦" title={t.packageDescription} subtitle={t.recipientName ? `Pour ${t.recipientName}` : null} /> : null}
      </View>

      {t.status === 'DELIVERED' && t.deliveredAt ? (
        <Text style={styles.meta}>Livré à {formatTime(t.deliveredAt)} · ce lien expire 24 h après la livraison.</Text>
      ) : null}
      <Text style={styles.meta}>
        Colis {formatOrderNumber(t.number)} · Yaar Livraison, Ouagadougou{done ? '' : ' · mis à jour en direct'}
      </Text>
    </LiveTrackingLayout>
  );
}

const styles = StyleSheet.create({
  centerRoot: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    width: '100%',
    maxWidth: 440,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bigIcon: { fontSize: 44 },
  cardTitle: { fontSize: 20, fontWeight: '900', color: colors.text, textAlign: 'center' },
  cardText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  footerNote: { fontSize: 12, color: colors.textMuted },
  brand: { alignItems: 'center' },
  brandLogo: { fontSize: 40, fontWeight: '900', color: colors.green },
  brandSub: { fontSize: 14, fontWeight: '800', color: colors.orange, marginTop: -4 },
  chipLogo: { fontWeight: '900', color: colors.green, fontSize: 15 },
  chipText: { fontWeight: '700', color: colors.text, fontSize: 13 },
  stale: { fontSize: 12, color: colors.orange, fontWeight: '700' },
  deliveredIcon: { fontSize: 36 },
  block: { gap: spacing.md, padding: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  meta: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
});
