import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '../../components/Text';
import Head from 'expo-router/head';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isTerminal, type TrackingDto } from '@yaar/shared';
import { Wordmark } from '../../components/driver/Wordmark';
import { avatarInitials } from '../../components/map/markerArt';
import { FloatingChip, LiveTrackingLayout, WIDE_LAYOUT_MIN_WIDTH } from '../../components/tracking/LiveTrackingLayout';
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
  TrackingRoundButton,
} from '../../components/tracking/TrackingParts';
import { TrackingIcon, type IconName } from '../../components/tracking/TrackingIcon';
import { usePublicTracking } from '../../hooks/usePublicTracking';
import { formatOrderNumber, formatTime } from '../../lib/format';
import { buildScene, estimateArrivalMinutes, isLiveStage, trackingSceneInput } from '../../lib/liveScene';
import { preloadMapEngine } from '../../lib/map/preload';
import { publicApi } from '../../lib/publicApi';
import { trackingPollMs } from '../../lib/publicConfig';
import { telUrl } from '../../lib/tel';
import { recipientToDriverText, trackingHeadline, trackingSteps } from '../../lib/trackingSteps';
import { hideWebSplash, takePrefetchedTracking } from '../../lib/webShell';
import { useAppConfig } from '../../state/config';
import { palette, radii, shadows, spacing } from '../../theme';

const TRACKING_PAGE_TITLE = 'Suivi de livraison · Yaar Livraison';

// La carte est le cœur de la page : son moteur (MapLibre, web) est téléchargé dès le chargement de l'écran.
preloadMapEngine();

/**
 * GET /track/<jeton> : la première requête reprend celle lancée au démarrage de l'application (lib/webShell.ts, avant
 * l'attente des polices et le premier rendu), les suivantes partent normalement.
 */
function fetchTracking(token: string): Promise<TrackingDto> {
  return takePrefetchedTracking(token) ?? publicApi.trackDelivery(token);
}

/**
 * Page publique du destinataire (lien reçu par SMS / WhatsApp), SANS compte ni connexion, au dessin Cobalt : carte
 * Cobalt en direct (itinéraire, entreprise en épingle à ses initiales, « chez vous » en épingle à maison, livreur),
 * feuille blanche avec l'heure d'arrivée en chiffres héros et « dans 12 min », les 4 étapes en pilules, le code à donner
 * au livreur (LA tuile cobalt de la page), le montant à payer (tuile soleil), le livreur (Appeler / WhatsApp),
 * l'expéditeur et l'adresse. Panneau à droite de la carte sur un ordinateur (≥ 900 px). Rafraîchie toutes les
 * `trackingPollIntervalMs` de GET /config (8 s par défaut) pendant la course, deux fois moins souvent pendant la recherche
 * d'un livreur, en pause quand l'onglet est masqué. Page légère (3G) : ni react-native-svg ni zod.
 */
export default function PublicTrackingScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { config } = useAppConfig();
  const [retryKey, setRetryKey] = useState(0);
  const retry = () => setRetryKey((k) => k + 1);
  const state = usePublicTracking(token, { intervalMs: (data) => trackingPollMs(config, data?.status) || 60_000, fetcher: fetchTracking, retryKey });
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
        // Chargement : dans la continuité de l'écran de démarrage du HTML (mot-symbole, indicateur cobalt).
        <CenteredCard testID="tracking-loading">
          <ActivityIndicator size="large" color={palette.cobalt} />
          <Text style={styles.cardText}>Chargement du suivi de votre colis…</Text>
        </CenteredCard>
      ) : state.status === 'notFound' ? (
        <MessageCard
          testID="tracking-expired"
          icon="link"
          title="Ce lien de suivi n’est plus valide"
          text="Il a expiré (24 h après la livraison) ou il est incomplet. Vérifiez le lien reçu par SMS ou WhatsApp, ou demandez-en un nouveau à l’expéditeur."
        />
      ) : state.status === 'error' ? (
        state.rateLimited ? (
          <MessageCard
            testID="tracking-rate-limited"
            icon="clock"
            title="Trop de demandes depuis votre connexion"
            text="Beaucoup de personnes suivent un colis depuis le même réseau. Gardez cette page ouverte : le suivi reprend tout seul dans moins d’une minute."
            retrying
          />
        ) : (
          <MessageCard
            testID="tracking-error"
            icon="alert"
            title={state.network ? 'Connexion impossible' : 'Suivi momentanément indisponible'}
            // Réseau coupé : le titre le dit déjà, le texte donne la marche à suivre (pas « Connexion impossible » deux fois).
            text={`${state.network ? 'Vérifiez votre connexion Internet.' : sentence(state.message)} Nouvel essai automatique dans quelques secondes.`}
            retrying
            onRetry={retry}
          />
        )
      ) : (
        <TrackingView data={state.data} stale={state.stale} animationMs={trackingPollMs(config, 'PICKED_UP')} />
      )}
    </>
  );
}

/** Message d'erreur de l'API en phrase (point final ajouté au besoin, avant « Nouvel essai… »). */
function sentence(message: string): string {
  const m = message.trim();
  return /[.!?…]$/.test(m) ? m : `${m}.`;
}

/** États sans carte (chargement, lien expiré, erreur) : fond canvas, mot-symbole, carte blanche centrée. */
function CenteredCard({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <SafeAreaView style={styles.centerRoot}>
      <View style={styles.brand}>
        <Wordmark size={40} />
        <Text style={styles.brandSub}>Suivi de livraison</Text>
      </View>
      <View style={[styles.card, shadows.tile]} testID={testID}>
        {children}
      </View>
      <Text style={styles.footerNote}>Yaar Livraison · Ouagadougou</Text>
    </SafeAreaView>
  );
}

/** Lien expiré, trop de demandes, connexion impossible : disque, titre, explication (et essai automatique). */
function MessageCard({
  icon,
  title,
  text,
  retrying,
  onRetry,
  testID,
}: {
  icon: IconName;
  title: string;
  text: string;
  retrying?: boolean;
  /** « Réessayer » : nouvel essai tout de suite, sans attendre l'essai automatique (de plus en plus espacé, 30 s au plus). */
  onRetry?: () => void;
  testID: string;
}) {
  return (
    <CenteredCard testID={testID}>
      <StateDisc icon={icon} tone={icon === 'alert' ? 'danger' : 'neutral'} size={72} />
      <Text style={styles.cardTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.cardText}>{text}</Text>
      {retrying && !onRetry ? (
        <ActivityIndicator size="small" color={palette.cobalt} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
      ) : null}
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]} testID="tracking-retry">
          <TrackingIcon name="refresh" size={18} color={palette.cobaltText} strokeWidth={2.4} />
          <Text style={styles.retryText}>Réessayer</Text>
        </Pressable>
      ) : null}
    </CenteredCard>
  );
}

/**
 * Écran court (téléphone d'entrée de gamme, 360 × 640) : feuille un peu plus haute (0,62 de l'écran), code compact,
 * montant sur une ligne (AmountBox), pour que l'heure d'arrivée, le code ET le montant à payer se voient sans défiler.
 */
const SHORT_SCREEN = 700;
/**
 * Tablette, petit ordinateur (440 à 899 px) : la feuille couvre la largeur de la fenêtre, mais son contenu garde une
 * colonne de téléphone (480 px au plus), centrée ; lignes courtes, montant et code à leur taille.
 */
const SHEET_COLUMN_MAX = 480;

function TrackingView({ data: t, stale, animationMs }: { data: TrackingDto; stale: boolean; animationMs: number }) {
  const { height, width: windowWidth } = useWindowDimensions();
  const short = height < SHORT_SCREEN;
  const wide = windowWidth >= WIDE_LAYOUT_MIN_WIDTH;
  // Entreprise en épingle « avatar » à ses initiales ; « chez vous » garde l'épingle à maison.
  const input = useMemo(() => ({ ...trackingSceneInput(t), initials: { pickup: avatarInitials(t.sender.name) } }), [t]);
  const scene = useMemo(() => buildScene(input), [input]);
  const eta = estimateArrivalMinutes(scene, input, t.etaMinutes);
  const headline = trackingHeadline(t.status, 'recipient', { sender: t.sender.name, driver: t.driver?.firstName });
  const done = isTerminal(t.status);
  const senderPhone = t.sender.phone;
  // Pas encore de livreur, ou livraison annulée : l'expéditeur est le contact.
  const callSender = !!senderPhone && (t.status === 'CANCELLED' || t.status === 'SEARCHING_DRIVER' || t.status === 'PENDING');
  // Largeur du contenu de la feuille avant sa mesure : téléphone (fenêtre − marges), panneau de 420 px sur un ordinateur.
  const guessWidth = wide ? 388 : Math.min(windowWidth - 32, SHEET_COLUMN_MAX);

  return (
    <LiveTrackingLayout
      markers={scene.markers}
      lines={scene.lines}
      fitPoints={scene.fitPoints}
      stageKey={t.status}
      animationMs={animationMs}
      allowWide
      sheetMaxRatio={short ? 0.62 : undefined}
      // Le contenu qui défile s'efface sous un fondu blanc au bas de la feuille (pas de ligne coupée à mi-hauteur).
      fadeBottom
      topCenter={
        wide ? null : (
          <FloatingChip testID="brand-chip">
            <Wordmark size={17} label={null} />
            <Text style={styles.chipText}>Suivi de votre colis</Text>
          </FloatingChip>
        )
      }
      testID="public-tracking"
    >
      <View style={[styles.column, !wide && windowWidth > SHEET_COLUMN_MAX + 32 && styles.columnCapped]} testID="sheet-column">
        {wide ? (
          <View style={styles.panelBrand}>
            <Wordmark size={26} />
            <Text style={styles.panelBrandText}>{`Colis ${formatOrderNumber(t.number)} · ${t.sender.name}`}</Text>
          </View>
        ) : null}
        {stale ? (
          <View style={styles.stale} accessibilityRole="alert">
            <TrackingIcon name="refresh" size={16} color={palette.sunText} strokeWidth={2.4} />
            <Text style={styles.staleText}>Connexion instable : position mise à jour dès que possible…</Text>
          </View>
        ) : null}
        {t.status === 'DELIVERED' ? <StateDisc icon="check" tone="success" size={short ? 52 : 64} /> : null}
        {t.status === 'CANCELLED' ? <StateDisc icon="close" tone="danger" size={short ? 52 : 64} /> : null}
        <ArrivalHeadline size="hero" etaMinutes={eta} headline={headline} widthGuess={guessWidth} />
        {t.status !== 'CANCELLED' ? <StepsProgress steps={trackingSteps(t.status, 'recipient')} /> : null}

        {t.deliveryCode && !done ? <DeliveryCodeChip code={t.deliveryCode} compact={short} /> : null}
        {t.amountToPay > 0 && !done ? (
          <AmountBox
            label="À payer à la réception"
            detail="En espèces, au livreur."
            amount={t.amountToPay}
            icon="cash"
            compact={short}
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
          />
        ) : null}

        <InfoBlock>
          <InfoRow
            icon="store"
            title={t.sender.name}
            subtitle="Expéditeur"
            right={
              callSender && senderPhone ? (
                <TrackingRoundButton
                  label="Appeler"
                  icon="phone"
                  size={48}
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
            subtitle={t.dropoff.landmark ? `Repère : ${t.dropoff.landmark}` : 'Livraison chez vous'}
            testID="dropoff-address"
          />
          {t.packageDescription ? <InfoRow icon="package" title={t.packageDescription} subtitle={t.recipientName ? `Pour ${t.recipientName}` : null} /> : null}
        </InfoBlock>

        {t.status === 'DELIVERED' && t.deliveredAt ? (
          <Text style={styles.meta}>Livré à {formatTime(t.deliveredAt)} · ce lien expire 24 h après la livraison.</Text>
        ) : null}
        <Text style={styles.meta}>
          Colis {formatOrderNumber(t.number)} · Yaar Livraison, Ouagadougou{done ? '' : ' · mis à jour en direct'}
        </Text>
      </View>
    </LiveTrackingLayout>
  );
}

const styles = StyleSheet.create({
  centerRoot: { flex: 1, backgroundColor: palette.canvas, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  brand: { alignItems: 'center', gap: 2 },
  brandSub: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: palette.inkMuted },
  card: {
    backgroundColor: palette.card,
    borderRadius: radii.card,
    paddingVertical: 28,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    width: '100%',
    maxWidth: 420,
  },
  cardTitle: { fontSize: 22, lineHeight: 28, fontWeight: '800', textAlign: 'center', letterSpacing: -0.4, color: palette.ink },
  cardText: { fontSize: 15, lineHeight: 21, fontWeight: '500', textAlign: 'center', color: palette.inkMuted },
  footerNote: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: palette.inkMuted },
  chipText: { fontWeight: '700', color: palette.ink, fontSize: 14, lineHeight: 18 },
  panelBrand: { gap: 4, paddingBottom: spacing.sm },
  panelBrandText: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: palette.inkMuted, fontVariant: ['tabular-nums'] },
  stale: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.banner,
    backgroundColor: palette.sunTint,
  },
  staleText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '700', color: palette.sunText },
  // Contenu de la feuille (même écart que la feuille) ; colonne de 480 px au plus, centrée, de 512 à 899 px de large.
  column: { gap: spacing.md },
  columnCapped: { width: '100%', maxWidth: SHEET_COLUMN_MAX, alignSelf: 'center' },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: palette.cobalt,
    backgroundColor: palette.card,
  },
  retryPressed: { backgroundColor: palette.cobaltTint },
  retryText: { fontSize: 16, lineHeight: 20, fontWeight: '800', color: palette.cobaltText },
  meta: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: palette.inkMuted, textAlign: 'center' },
});
