import { useEffect, useMemo, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '../../components/Text';
import Head from 'expo-router/head';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isTerminal, type TrackingDto } from '@yaar/shared';
import { avatarInitials } from '../../components/map/markerArt';
import { FloatingChip, LiveTrackingLayout } from '../../components/tracking/LiveTrackingLayout';
import { RECIPIENT_SHEET_THEME } from '../../components/tracking/recipientSheetTheme';
import {
  AmountBox,
  ArrivalHeadline,
  DeliveryCodeChip,
  DriverCard,
  InfoBlock,
  InfoRow,
  openLink,
  StateDisc,
  StepsProgress,
  TRACKING_PALETTES,
  TrackingRoundButton,
  type TrackingTheme,
} from '../../components/tracking/TrackingParts';
import type { IconName } from '../../components/tracking/TrackingIcon';
import { usePublicTracking } from '../../hooks/usePublicTracking';
import { formatOrderNumber, formatTime } from '../../lib/format';
import { buildScene, estimateArrivalMinutes, isLiveStage, trackingSceneInput } from '../../lib/liveScene';
import { preloadMapEngine } from '../../lib/map/preload';
import { trackingPollMs } from '../../lib/publicConfig';
import { telUrl } from '../../lib/tel';
import { recipientToDriverText, trackingHeadline, trackingSteps } from '../../lib/trackingSteps';
import { hideWebSplash } from '../../lib/webShell';
import { useAppConfig } from '../../state/config';
import { colors, dark, radius, spacing } from '../../theme';

const TRACKING_PAGE_TITLE = 'Suivi de livraison · Yaar Livraison';

// La carte est le cœur de la page : son moteur (MapLibre, web) est téléchargé dès le chargement de l'écran.
preloadMapEngine();

/**
 * Page publique du destinataire (lien reçu par SMS / WhatsApp), SANS compte ni connexion : carte claire en direct
 * (itinéraire, entreprise en épingle à ses initiales, « chez vous » en épingle à maison, livreur), feuille sombre
 * (thème : RECIPIENT_SHEET_THEME) avec l'heure d'arrivée en grand, les 4 étapes, le code à donner au livreur, le
 * montant à payer et le livreur (boutons ronds Appeler / WhatsApp). Rafraîchie toutes les `trackingPollIntervalMs`
 * de GET /config (8 s par défaut) pendant la course, deux fois moins souvent pendant la recherche d'un livreur, en
 * pause quand l'onglet est masqué. Page légère (3G) : ni react-native-svg ni zod (voir TrackingParts.tsx).
 */
export default function PublicTrackingScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { config } = useAppConfig();
  const state = usePublicTracking(token, { intervalMs: (data) => trackingPollMs(config, data?.status) || 60_000 });
  const theme = RECIPIENT_SHEET_THEME;
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
        // Chargement : toujours clair, dans la continuité de l'écran de démarrage du HTML.
        <CenteredCard testID="tracking-loading" theme="light">
          <ActivityIndicator size="large" color={colors.green} />
          <Text style={[styles.cardText, { color: colors.textMuted }]}>Chargement du suivi…</Text>
        </CenteredCard>
      ) : state.status === 'notFound' ? (
        <MessageCard
          testID="tracking-expired"
          theme={theme}
          icon="link"
          title="Ce lien de suivi n’est plus valide"
          text="Il a expiré (24 h après la livraison) ou il est incomplet. Vérifiez le lien reçu par SMS ou WhatsApp, ou demandez-en un nouveau à l’expéditeur."
        />
      ) : state.status === 'error' ? (
        state.rateLimited ? (
          <MessageCard
            testID="tracking-rate-limited"
            theme={theme}
            icon="clock"
            title="Trop de demandes depuis votre connexion"
            text="Beaucoup de personnes suivent un colis depuis le même réseau. Gardez cette page ouverte : le suivi reprend tout seul dans moins d’une minute."
          />
        ) : (
          <MessageCard
            testID="tracking-error"
            theme={theme}
            icon="alert"
            title={state.network ? 'Connexion impossible' : 'Suivi momentanément indisponible'}
            // Réseau coupé : le titre le dit déjà, le texte donne la marche à suivre (pas « Connexion impossible » deux fois).
            text={`${state.network ? 'Vérifiez votre connexion Internet.' : sentence(state.message)} Nouvel essai automatique dans quelques secondes.`}
          />
        )
      ) : (
        <TrackingView data={state.data} stale={state.stale} animationMs={trackingPollMs(config, 'PICKED_UP')} theme={theme} />
      )}
    </>
  );
}

/** Message d'erreur de l'API en phrase (point final ajouté au besoin, avant « Nouvel essai… »). */
function sentence(message: string): string {
  const m = message.trim();
  return /[.!?…]$/.test(m) ? m : `${m}.`;
}

function CenteredCard({ children, theme, testID }: { children: ReactNode; theme: TrackingTheme; testID?: string }) {
  const d = theme === 'dark';
  return (
    <SafeAreaView style={[styles.centerRoot, d && { backgroundColor: dark.background }]}>
      <View style={styles.brand}>
        <Text style={[styles.brandLogo, d && { color: dark.green }]}>Yaar</Text>
        <Text style={styles.brandSub}>Livraison</Text>
      </View>
      <View style={[styles.card, d && styles.cardDark]} testID={testID}>
        {children}
      </View>
      <Text style={[styles.footerNote, d && { color: dark.textFaint }]}>Yaar Livraison · Ouagadougou</Text>
    </SafeAreaView>
  );
}

/** Lien expiré, trop de demandes, connexion impossible : disque, titre et explication. */
function MessageCard({ icon, title, text, theme, testID }: { icon: IconName; title: string; text: string; theme: TrackingTheme; testID: string }) {
  const p = TRACKING_PALETTES[theme];
  return (
    <CenteredCard theme={theme} testID={testID}>
      <StateDisc icon={icon} tone={icon === 'alert' ? 'danger' : 'neutral'} theme={theme} size={64} />
      <Text style={[styles.cardTitle, { color: p.text }]}>{title}</Text>
      <Text style={[styles.cardText, { color: p.muted }]}>{text}</Text>
    </CenteredCard>
  );
}

/**
 * Écran court (téléphone d'entrée de gamme, 360 × 640) : feuille un peu plus haute (0,6 de l'écran) et code plus
 * compact, pour que l'heure d'arrivée, le code ET le montant à payer se voient sans faire défiler.
 */
const SHORT_SCREEN_MAX_HEIGHT = 700;

function TrackingView({ data: t, stale, animationMs, theme }: { data: TrackingDto; stale: boolean; animationMs: number; theme: TrackingTheme }) {
  const { height } = useWindowDimensions();
  const short = height < SHORT_SCREEN_MAX_HEIGHT;
  // Entreprise en épingle « avatar » à ses initiales ; « chez vous » garde l'épingle à maison.
  const input = useMemo(() => ({ ...trackingSceneInput(t), initials: { pickup: avatarInitials(t.sender.name) } }), [t]);
  const scene = useMemo(() => buildScene(input), [input]);
  const eta = estimateArrivalMinutes(scene, input, t.etaMinutes);
  const headline = trackingHeadline(t.status, 'recipient', { sender: t.sender.name, driver: t.driver?.firstName });
  const done = isTerminal(t.status);
  const p = TRACKING_PALETTES[theme];
  const senderPhone = t.sender.phone;
  // Pas encore de livreur, ou livraison annulée : l'expéditeur est le contact.
  const callSender = !!senderPhone && (t.status === 'CANCELLED' || t.status === 'SEARCHING_DRIVER' || t.status === 'PENDING');

  return (
    <LiveTrackingLayout
      markers={scene.markers}
      lines={scene.lines}
      fitPoints={scene.fitPoints}
      stageKey={t.status}
      animationMs={animationMs}
      allowWide
      sheetTheme={theme}
      sheetMaxRatio={short ? 0.6 : undefined}
      topCenter={
        <FloatingChip testID="brand-chip">
          <Text style={styles.chipLogo}>Yaar</Text>
          <Text style={styles.chipText}>Suivi de votre colis</Text>
        </FloatingChip>
      }
      testID="public-tracking"
    >
      {stale ? <Text style={[styles.stale, { color: p.warning }]}>Connexion instable : position mise à jour dès que possible…</Text> : null}
      {t.status === 'DELIVERED' ? <StateDisc icon="check" tone="success" theme={theme} /> : null}
      {t.status === 'CANCELLED' ? <StateDisc icon="close" tone="danger" theme={theme} /> : null}
      <ArrivalHeadline etaMinutes={eta} headline={headline} theme={theme} />
      {t.status !== 'CANCELLED' ? <StepsProgress steps={trackingSteps(t.status, 'recipient')} theme={theme} /> : null}

      {t.deliveryCode && !done ? <DeliveryCodeChip code={t.deliveryCode} theme={theme} compact={short} /> : null}
      {t.amountToPay > 0 && !done ? (
        <AmountBox
          label="À payer au livreur à la réception"
          amount={t.amountToPay}
          detail="En espèces, quand vous recevez le colis."
          theme={theme}
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
          whatsappText={recipientToDriverText({ driver: t.driver.firstName, sender: t.sender.name, number: t.number })}
          theme={theme}
        />
      ) : null}

      <InfoBlock theme={theme}>
        <InfoRow
          icon="store"
          title={t.sender.name}
          subtitle="Expéditeur"
          theme={theme}
          right={
            callSender && senderPhone ? (
              <TrackingRoundButton
                label="Appeler"
                icon="phone"
                size={44}
                theme={theme}
                onPress={() => openLink(telUrl(senderPhone))}
                accessibilityLabel={`Appeler ${t.sender.name} (${senderPhone})`}
                testID="call-sender"
              />
            ) : null
          }
          testID="sender"
        />
        <InfoRow
          icon="home"
          title={t.dropoff.address}
          subtitle={t.dropoff.landmark ? `Repère : ${t.dropoff.landmark}` : 'Livraison chez vous'}
          theme={theme}
          testID="dropoff-address"
        />
        {t.packageDescription ? (
          <InfoRow icon="package" title={t.packageDescription} subtitle={t.recipientName ? `Pour ${t.recipientName}` : null} theme={theme} />
        ) : null}
      </InfoBlock>

      {t.status === 'DELIVERED' && t.deliveredAt ? (
        <Text style={[styles.meta, { color: p.muted }]}>Livré à {formatTime(t.deliveredAt)} · ce lien expire 24 h après la livraison.</Text>
      ) : null}
      <Text style={[styles.meta, { color: p.faint }]}>
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
  cardDark: { backgroundColor: dark.surface, borderColor: dark.border, borderRadius: 24 },
  cardTitle: { fontSize: 20, fontWeight: '900', textAlign: 'center', letterSpacing: -0.2 },
  cardText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  footerNote: { fontSize: 12, color: colors.textMuted },
  brand: { alignItems: 'center' },
  brandLogo: { fontSize: 40, fontWeight: '900', color: colors.green },
  brandSub: { fontSize: 14, fontWeight: '800', color: colors.orange, marginTop: -4 },
  chipLogo: { fontWeight: '900', color: colors.green, fontSize: 15 },
  chipText: { fontWeight: '700', color: colors.text, fontSize: 13 },
  stale: { fontSize: 12.5, fontWeight: '800' },
  meta: { fontSize: 12, textAlign: 'center' },
});
