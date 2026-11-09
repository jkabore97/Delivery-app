import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { loadAsync } from 'expo-font';
import { Text } from '../../components/Text';
import Head from 'expo-router/head';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { arrivalClockFr, formatDurationFr, isTerminal, type TrackingDto } from '@yaar/shared';
import { Wordmark } from '../../components/driver/Wordmark';
import { avatarInitials } from '../../components/map/markerArt';
import { FloatingChip, LiveTrackingLayout, WIDE_LAYOUT_MIN_WIDTH } from '../../components/tracking/LiveTrackingLayout';
import { DeliveryCodeChip, DriverCard, InfoBlock, InfoRow, openLink, StateDisc, StepsProgress, TrackingRoundButton } from '../../components/tracking/TrackingParts';
import { TrackingIcon, type IconName } from '../../components/tracking/TrackingIcon';
import { usePublicTracking } from '../../hooks/usePublicTracking';
import { formatFcfa, formatOrderNumber, formatTime, NNBSP } from '../../lib/format';
import { buildScene, estimateArrivalMinutes, isLiveStage, trackingSceneInput } from '../../lib/liveScene';
import { preloadMapEngine } from '../../lib/map/preload';
import { publicApi } from '../../lib/publicApi';
import { trackingPollMs } from '../../lib/publicConfig';
import { telUrl } from '../../lib/tel';
import { recipientToDriverText, trackingHeadline, trackingSteps, type Headline } from '../../lib/trackingSteps';
import { hideWebSplash, isSlowConnection, markPublicFontsCached, takePrefetchedTracking } from '../../lib/webShell';
import { mapEngineReady } from '../../components/driver/mapEngine';
import { FONT_ASSETS } from '../../fonts';
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

/** Au plus tard après ce délai, les polices sont demandées même si la carte n'est pas prête. */
const FONTS_AFTER_MAP_MAX_WAIT_MS = 8000;

/**
 * Web : polices de l'application demandées une fois le moteur de la carte téléchargé (ou au bout de 8 s), pour qu'en 3G
 * elles ne retardent ni le suivi ni la carte ; le texte, affiché d'abord dans la police du système, prend la police à son
 * arrivée. Retenu ensuite sur l'appareil (`markPublicFontsCached`) : aux visites suivantes, polices en cache. Aucune
 * police sur une connexion très lente. Sans effet quand la mise en page racine les a déjà chargées (demande reprise).
 */
function usePublicFontsAfterMap(): void {
  useEffect(() => {
    if (Platform.OS !== 'web' || isSlowConnection()) return;
    let done = false;
    const load = () => {
      if (done) return;
      done = true;
      loadAsync(FONT_ASSETS).then(
        () => markPublicFontsCached(),
        () => undefined,
      );
    };
    const timer = setTimeout(load, FONTS_AFTER_MAP_MAX_WAIT_MS);
    void mapEngineReady().then(load);
    return () => clearTimeout(timer);
  }, []);
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
  const state = usePublicTracking(token, { intervalMs: (data) => trackingPollMs(config, data?.status) || 60_000, fetcher: fetchTracking });
  useEffect(() => hideWebSplash(), []);
  usePublicFontsAfterMap();

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
            text="Beaucoup de personnes suivent un colis depuis le même réseau. Gardez cette page ouverte : le suivi reprend tout seul dans moins d’une minute."
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
function MessageCard({ icon, title, text, retrying, testID }: { icon: IconName; title: string; text: string; retrying?: boolean; testID: string }) {
  return (
    <CenteredCard testID={testID}>
      <StateDisc icon={icon} tone={icon === 'alert' ? 'danger' : 'neutral'} size={72} />
      <Text style={styles.cardTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.cardText}>{text}</Text>
      {retrying ? <ActivityIndicator size="small" color={palette.cobalt} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" /> : null}
    </CenteredCard>
  );
}

/**
 * Écran court (téléphone d'entrée de gamme, 360 × 640) : feuille un peu plus haute (0,6 de l'écran), heure et code plus
 * compacts, montant sur une ligne, pour que l'heure d'arrivée, le code ET le montant à payer se voient sans défiler.
 */
const SHORT_SCREEN_MAX_HEIGHT = 700;
/** Largeur moyenne des chiffres tabulaires 800 et du « : » de l'heure (part de la taille). */
const CLOCK_CHAR_WIDTH = 0.62;

/**
 * Heure d'arrivée en chiffres héros (800 tabulaires, jusqu'à 64 px) avec « dans 12 min » en pastille sur la même ligne,
 * l'état de la livraison en cobalt dessous ; la taille de l'heure s'adapte à la largeur de la feuille. Lu en une phrase :
 * « Arrivée vers 14:32 · dans 12 min ». Sans estimation : l'état en titre.
 */
function HeroEta({ etaMinutes, headline, short, guessWidth, now = Date.now() }: { etaMinutes: number | null; headline: Headline; short: boolean; guessWidth: number; now?: number }) {
  const [boxWidth, setBoxWidth] = useState<number | null>(null);
  const width = boxWidth ?? guessWidth;
  const imminent = etaMinutes !== null && (!Number.isFinite(etaMinutes) || etaMinutes < 1);
  const clock = etaMinutes !== null && !imminent ? arrivalClockFr(Math.round(etaMinutes), now) : null;
  const pill = clock && etaMinutes !== null ? `dans ${formatDurationFr(etaMinutes)}` : null;
  const label = clock ? `Arrivée vers ${clock} · ${pill}` : imminent ? 'Arrivée imminente' : null;
  // Pastille : ≈ 9 px par caractère (16/800) + 28 px de marges ; 12 px entre l'heure et la pastille.
  const room = width - (pill ? pill.length * 9 + 28 + 12 : 0);
  const size = clock ? Math.max(36, Math.min(short ? 48 : 64, Math.floor(room / (CLOCK_CHAR_WIDTH * clock.length)))) : 0;
  return (
    <View
      style={styles.headline}
      testID="tracking-headline"
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w > 0 && w !== boxWidth) setBoxWidth(w);
      }}
    >
      {label ? (
        <View accessible accessibilityRole="header" accessibilityLabel={label}>
          {clock ? <Text style={styles.etaLabel}>Arrivée vers</Text> : null}
          <View style={styles.etaRow}>
            <Text style={[styles.eta, clock ? { fontSize: size, lineHeight: Math.round(size * 1.04), letterSpacing: -Math.round(size * 0.04 * 10) / 10 } : styles.etaImminent]}>
              {clock ?? 'Arrivée imminente'}
            </Text>
            {pill ? (
              <View style={styles.etaPill}>
                <Text style={styles.etaPillText}>{pill}</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
      {label ? (
        <Text style={styles.state}>{headline.title}</Text>
      ) : (
        <Text style={styles.title} accessibilityRole="header">
          {headline.title}
        </Text>
      )}
      {/* Petit téléphone : avec une heure d'arrivée, la phrase du livreur cède sa place (son nom est sur sa carte). */}
      {headline.subtitle && !(short && label) ? <Text style={styles.subtitle}>{headline.subtitle}</Text> : null}
    </View>
  );
}

/**
 * Montant à payer au livreur (espèces) : tuile SOLEIL, texte encre (12,2:1), montant 800 tabulaire. L'élément du montant
 * porte le testID `amount-to-pay-value` (vérifications exactes de bout en bout).
 */
function PayCard({ amount, short }: { amount: number; short: boolean }) {
  const full = formatFcfa(amount);
  const cut = full.lastIndexOf(NNBSP);
  return (
    <View style={[styles.pay, short && styles.payShort, shadows.sun]} testID="amount-to-pay">
      {/* Petit téléphone : sans pastille, pour que le libellé tienne sur une ligne à côté du montant. */}
      {short ? null : (
        <View style={styles.payIcon}>
          <TrackingIcon name="cash" size={22} color={palette.ink} strokeWidth={2.2} />
        </View>
      )}
      <View style={styles.payText}>
        <Text style={styles.payLabel}>À payer à la réception</Text>
        <Text style={styles.payDetail}>En espèces, au livreur.</Text>
      </View>
      <Text style={[styles.payValue, short && styles.payValueShort]} testID="amount-to-pay-value" numberOfLines={1}>
        {full.slice(0, cut)}
        <Text style={styles.payUnit}>{full.slice(cut)}</Text>
      </Text>
    </View>
  );
}

function TrackingView({ data: t, stale, animationMs }: { data: TrackingDto; stale: boolean; animationMs: number }) {
  const { height, width: windowWidth } = useWindowDimensions();
  const short = height < SHORT_SCREEN_MAX_HEIGHT;
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
  const guessWidth = wide ? 388 : Math.min(windowWidth, 440) - 32;

  return (
    <LiveTrackingLayout
      markers={scene.markers}
      lines={scene.lines}
      fitPoints={scene.fitPoints}
      stageKey={t.status}
      animationMs={animationMs}
      allowWide
      sheetMaxRatio={short ? 0.62 : undefined}
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
      {wide ? (
        <View style={styles.panelBrand}>
          <Wordmark size={26} />
          <Text style={styles.panelBrandText}>{`Colis ${formatOrderNumber(t.number)} · ${t.sender.name}`}</Text>
        </View>
      ) : null}
      {stale ? (
        <View style={styles.stale} accessibilityRole="alert">
          <TrackingIcon name="refresh" size={16} color={palette.sunText} strokeWidth={2.4} />
          <Text style={styles.staleText}>Connexion instable : position mise à jour dès que possible…</Text>
        </View>
      ) : null}
      {t.status === 'DELIVERED' ? <StateDisc icon="check" tone="success" size={short ? 52 : 64} /> : null}
      {t.status === 'CANCELLED' ? <StateDisc icon="close" tone="danger" size={short ? 52 : 64} /> : null}
      <HeroEta etaMinutes={eta} headline={headline} short={short} guessWidth={guessWidth} />
      {t.status !== 'CANCELLED' ? <StepsProgress steps={trackingSteps(t.status, 'recipient')} /> : null}

      {t.deliveryCode && !done ? <DeliveryCodeChip code={t.deliveryCode} compact={short} /> : null}
      {t.amountToPay > 0 && !done ? <PayCard amount={t.amountToPay} short={short} /> : null}

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
          subtitle={t.dropoff.landmark ? `Repère : ${t.dropoff.landmark}` : 'Livraison chez vous'}
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
  stale: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radii.banner, backgroundColor: palette.sunTint },
  staleText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '700', color: palette.sunText },
  headline: { gap: 4 },
  etaLabel: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: palette.inkMuted },
  etaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 12, rowGap: 4 },
  eta: { fontWeight: '800', color: palette.ink, fontVariant: ['tabular-nums'] },
  etaImminent: { fontSize: 32, lineHeight: 38, letterSpacing: -0.8 },
  etaPill: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center', backgroundColor: palette.cobaltTint },
  etaPillText: { fontSize: 16, lineHeight: 20, fontWeight: '800', color: palette.cobaltText, fontVariant: ['tabular-nums'] },
  state: { fontSize: 16, lineHeight: 21, fontWeight: '800', color: palette.cobalt },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.6, color: palette.ink },
  subtitle: { fontSize: 14, lineHeight: 19, fontWeight: '500', color: palette.inkMuted },
  pay: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingVertical: 12, paddingHorizontal: spacing.lg, borderRadius: 24, backgroundColor: palette.sun },
  payShort: { minHeight: 60, paddingVertical: 8, paddingHorizontal: 14, gap: 10, borderRadius: 20 },
  payIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(12, 18, 34, 0.08)' },
  payText: { flex: 1, gap: 1 },
  payLabel: { fontSize: 14, lineHeight: 19, fontWeight: '800', color: palette.ink, letterSpacing: -0.1 },
  payDetail: { fontSize: 12.5, lineHeight: 17, fontWeight: '600', color: palette.onSun2 },
  payValue: { flexShrink: 0, fontSize: 24, lineHeight: 29, fontWeight: '800', letterSpacing: -0.6, color: palette.ink, fontVariant: ['tabular-nums'] },
  payValueShort: { fontSize: 22, lineHeight: 27 },
  payUnit: { fontSize: 14, letterSpacing: 0 },
  meta: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: palette.inkMuted, textAlign: 'center' },
});
