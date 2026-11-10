import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Href } from 'expo-router';
import { LABELS, type BusinessSummaryDto, type OrderDto, type StoreDto } from '@yaar/shared';
import { Text } from '../../Text';
import { CourierIllustration } from '../../design/CourierIllustration';
import { Icon, type IconName } from '../../design/Icon';
import { formatFcfa, formatTime } from '../../../lib/format';
import { driverWhatsappText, recipientCallName } from '../../../lib/share';
import { telUrl, whatsappUrl } from '../../../lib/tel';
import { isBusinessApproved } from '../../../state/business';
import { alpha, FOCUS_RING_INNER, FOCUS_RING_INNER_ON_COBALT, FOCUS_SHAPE, ON_COBALT_SURFACE, palette, radii, shadows, tabular } from '../../../theme';
import {
  deliveryMinutes,
  deliveryTimeline,
  dropoffArea,
  formatAmount,
  heroCash,
  liveEta,
  liveStatusText,
  shortName,
  type LiveEta,
} from '../dashboardData';
import { avatarToneOf, InitialsAvatar, MiniChip, miniToneOf, NavLink, POINTER, PrimaryPill, SegmentedProgress, SunPill, type WebPressState } from '../parts';

function open(url: string) {
  try {
    void Promise.resolve(Linking.openURL(url)).catch(() => undefined);
  } catch {
    /* lien refusé par la plateforme */
  }
}

/** Taille des grands chiffres d'une tuile selon leur longueur (« 87 500 » à 40 px, « 1 250 000 » plus petit). */
function figureSize(text: string, max = 40): number {
  return text.length <= 6 ? max : text.length <= 8 ? Math.round(max * 0.85) : Math.round(max * 0.72);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Tuiles de chiffres                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Tuile de chiffre (spec : pastille de 32 px teintée en haut à gauche, nombre 40/800, libellé 13/600). */
export function KpiTile({
  icon,
  tint,
  value,
  unit,
  label,
  accessibilityLabel,
  style,
  testID,
}: {
  icon: IconName;
  tint: 'mint' | 'cobalt';
  value: string;
  unit?: string | null;
  label: string;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const t = tint === 'mint' ? { bg: palette.mintTint, fg: palette.mintText } : { bg: palette.cobaltTint, fg: palette.cobalt };
  const size = figureSize(value);
  return (
    <View style={[styles.tile, shadows.tile, styles.kpi, style]} accessible accessibilityLabel={accessibilityLabel} testID={testID}>
      <View style={[styles.kpiIcon, { backgroundColor: t.bg }]}>
        <Icon name={icon} size={16} color={t.fg} strokeWidth={2.6} />
      </View>
      <Text style={[styles.kpiValue, { fontSize: size, lineHeight: size - 2 }]} numberOfLines={1}>
        {value}
        {unit ? <Text style={styles.kpiUnit}>{` ${unit}`}</Text> : null}
      </Text>
      <Text style={styles.kpiLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Tuile soleil « Encaissé pour vous aujourd’hui » (valeur de la marchandise encaissée par les livreurs pour l'entreprise
 * sur les livraisons livrées aujourd'hui) et ses frais. Chiffre du JOUR : le reversement par Yaar n'est pas suivi, la
 * tuile ne dit donc pas « à reverser » (elle repart de 0 chaque jour). `unavailable` : résumé en échec, « — ».
 */
export function CashTile({ summary, unavailable = false, style }: { summary: BusinessSummaryDto | null; unavailable?: boolean; style?: StyleProp<ViewStyle> }) {
  const goods = summary ? formatAmount(summary.today.goodsCollected) : unavailable ? '—' : '…';
  const fees = summary && summary.today.deliveryFees > 0 ? `${formatAmount(summary.today.deliveryFees)} FCFA de frais` : null;
  const size = figureSize(goods);
  return (
    <View
      style={[styles.tile, styles.kpi, styles.cash, shadows.sun, style]}
      accessible
      accessibilityLabel={
        summary
          ? `Encaissé pour vous aujourd’hui : ${goods} FCFA${fees ? `, ${fees}` : ''}`
          : `Encaissé pour vous aujourd’hui : ${unavailable ? 'indisponible' : 'chargement'}`
      }
      testID="kpi-cash"
    >
      <View style={styles.cashTop}>
        <View style={[styles.kpiIcon, styles.cashIcon]}>
          <Icon name="wallet" size={16} color={palette.ink} strokeWidth={2.4} />
        </View>
        {fees ? (
          <View style={styles.fee}>
            <Text style={styles.feeText} numberOfLines={1}>
              {fees}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.kpiValue, { fontSize: size, lineHeight: size - 2 }]} numberOfLines={1}>
        {goods}
        {summary ? <Text style={styles.kpiUnit}> FCFA</Text> : null}
      </Text>
      <Text style={[styles.kpiLabel, styles.cashLabel]} numberOfLines={1}>
        Encaissé pour vous aujourd’hui
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Tuile héros                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

function heroChip(o: OrderDto, eta: LiveEta): string {
  if (o.status === 'PICKED_UP') return 'En livraison';
  if (o.status === 'ASSIGNED') return eta.minutes === 0 ? 'Livreur sur place' : 'Livreur en route';
  return 'Recherche';
}

/** Bouton rond blanc de la tuile héros (disque 40 px, pictogramme cobalt, libellé 11/600 dessous). */
function HeroRound({ icon, label, a11y, onPress, showLabel }: { icon: IconName; label: string; a11y: string; onPress: () => void; showLabel: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} style={[styles.round, POINTER]} {...FOCUS_RING_INNER_ON_COBALT}>
      {(s: WebPressState) => (
        <>
          <View {...FOCUS_SHAPE} style={[styles.roundDisc, (s.hovered || s.pressed) && styles.roundDiscHover]}>
            <Icon name={icon} size={18} color={palette.cobalt} strokeWidth={2.3} />
          </View>
          {showLabel ? <Text style={styles.roundLabel}>{label}</Text> : null}
        </>
      )}
    </Pressable>
  );
}

/**
 * Tuile héros cobalt (la seule de l'écran) : la livraison suivie (par défaut la première en route). À gauche l'état,
 * le numéro et « Voir le suivi », l'heure d'arrivée géante et « dans 7 min », deux garanties (le destinataire suit en
 * direct, code vérifié à la remise), la progression avec ses heures. À droite, sur un fond plus sombre : destinataire,
 * adresse et repère, livreur (note, véhicule, plaque, Appeler / WhatsApp), montant à encaisser en pilule soleil.
 */
export function HeroTile({
  order: o,
  now,
  businessName,
  onOpen,
  short = false,
  style,
}: {
  order: OrderDto;
  now: number;
  businessName: string | null;
  onOpen: () => void;
  /** Tuile basse (fenêtre de moins de 860 px) : écarts réduits, boutons du livreur sans libellé visible. */
  short?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [width, setWidth] = useState(656);
  const eta = liveEta(o, now);
  const cash = heroCash(o);
  const steps = deliveryTimeline(o, now, eta);
  const wide = width >= 640;
  const cardWidth = wide ? 292 : 268;
  const leftWidth = width - 48 - 24 - cardWidth;
  const inText = eta.inText ?? '';
  const clockSize = Math.max(44, Math.min(72, Math.floor((leftWidth - 14 - inText.length * 10.5) / 2.8)));
  const who = recipientCallName(o.recipientName, o.recipientIsBusiness) || 'Le destinataire';
  const driver = o.driver;
  const driverName = driver ? shortName(driver.name) : null;
  const driverPhone = driver?.phone ?? null;
  const landmark = o.dropoff?.landmark?.trim();
  // Recherche d'un livreur : l'état en grand, l'heure de la demande en petit (une heure géante se lirait comme une arrivée).
  const request = eta.kind === 'request';
  return (
    <View
      style={[styles.hero, shadows.hero, style]}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w > 0 && w !== width) setWidth(w);
      }}
      accessibilityLabel={`Livraison #${o.number} suivie`}
      testID="hero-tile"
      {...ON_COBALT_SURFACE}
    >
      <View style={styles.heroLeft}>
        <View style={styles.heroTop}>
          <View style={styles.heroChip}>
            <View style={styles.heroDot} />
            <Text style={styles.heroChipText} numberOfLines={1}>
              {heroChip(o, eta)}
            </Text>
          </View>
          <Text style={styles.heroId}>#{o.number}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ouvrir le suivi de la livraison #${o.number}`}
            onPress={onOpen}
            style={[styles.heroOpen, POINTER]}
            testID="hero-open"
            {...FOCUS_RING_INNER_ON_COBALT}
          >
            {(s: WebPressState) => (
              <View {...FOCUS_SHAPE} style={[styles.heroOpenInner, (s.hovered || s.pressed) && styles.heroOpenHover]}>
                <Text style={styles.heroOpenText}>Suivi</Text>
                <Icon name="chevronRight" size={14} color={palette.onCobalt} strokeWidth={2.6} />
              </View>
            )}
          </Pressable>
        </View>
        <Text style={styles.etaLabel} numberOfLines={1}>
          {request ? `Demandée à ${eta.clock}${eta.inText ? ` · ${eta.inText}` : ''}` : eta.clock ? eta.label : eta.kind === 'pickup' ? 'Retrait' : 'Arrivée'}
        </Text>
        <View
          style={styles.etaRow}
          accessible
          accessibilityLabel={request ? `Recherche d’un livreur, demandée à ${eta.clock}` : eta.clock ? `${eta.label} ${eta.clock}${eta.inText ? `, ${eta.inText}` : ''}` : eta.label}
        >
          {request ? (
            <Text style={[styles.etaWord, styles.etaWordSearch]} numberOfLines={2} testID="hero-tile-state">
              Recherche d’un livreur…
            </Text>
          ) : eta.clock ? (
            <>
              <Text style={[styles.eta, { fontSize: clockSize, lineHeight: Math.round(clockSize * 0.9), letterSpacing: -Math.round(clockSize * 0.04 * 10) / 10 }]}>{eta.clock}</Text>
              {eta.inText ? <Text style={styles.etaIn}>{eta.inText}</Text> : null}
            </>
          ) : (
            <Text style={styles.etaWord}>{eta.label}</Text>
          )}
        </View>
        <View style={styles.notes}>
          {eta.kind === 'pickup' && eta.deliveryClock ? (
            <View style={styles.note}>
              <Icon name="clock" size={16} color={palette.onCobalt2} strokeWidth={2.2} />
              <Text style={styles.noteText} numberOfLines={1}>
                Livraison prévue vers <Text style={tabular}>{eta.deliveryClock}</Text>
              </Text>
            </View>
          ) : null}
          <View style={styles.note}>
            <Icon name="eye" size={16} color={palette.onCobalt2} strokeWidth={2.2} />
            <Text style={styles.noteText} numberOfLines={1}>
              {who} peut suivre la course en direct
            </Text>
          </View>
          <View style={styles.note}>
            <Icon name="shield" size={16} color={palette.onCobalt2} strokeWidth={2.2} />
            <Text style={styles.noteText} numberOfLines={1}>
              Code de livraison vérifié à la remise
            </Text>
          </View>
        </View>
        <SegmentedProgress steps={steps} onCobalt labels style={styles.heroSteps} />
      </View>
      <View style={[styles.heroCard, { width: cardWidth }, short && styles.heroCardShort]}>
        <View>
          <Text style={styles.cardName} numberOfLines={1}>
            {o.recipientName ?? 'Destinataire'}
          </Text>
          {o.dropoff?.address ? (
            <Text style={styles.cardMeta} numberOfLines={1}>
              {o.dropoff.address}
            </Text>
          ) : null}
          {landmark ? (
            <Text style={styles.cardMeta} numberOfLines={1}>
              Repère « {landmark} »
            </Text>
          ) : null}
        </View>
        <View style={styles.hr} />
        {driver ? (
          <View style={styles.driver}>
            <InitialsAvatar name={driver.name} size={40} tone="sun" />
            <View style={styles.driverText}>
              <Text style={styles.cardName} numberOfLines={1}>
                {driverName}
              </Text>
              <View style={styles.driverMetaRow}>
                {driver.ratingAvg !== null ? (
                  <>
                    <Icon name="star" size={12} color={palette.sun} />
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {`${driver.ratingAvg.toFixed(1).replace('.', ',')} · ${LABELS.vehicleType[driver.vehicleType]}`}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.cardMeta}>{LABELS.vehicleType[driver.vehicleType]}</Text>
                )}
              </View>
              {driver.plate ? <Text style={[styles.cardMeta, tabular]}>{driver.plate}</Text> : null}
            </View>
            {driverPhone ? (
              <View style={styles.rounds}>
                <HeroRound icon="phone" label="Appeler" a11y={`Appeler ${driverName} (${driverPhone})`} onPress={() => open(telUrl(driverPhone))} showLabel={wide && !short} />
                <HeroRound
                  icon="chat"
                  label="WhatsApp"
                  a11y={`Écrire à ${driverName} sur WhatsApp (${driverPhone})`}
                  onPress={() => open(whatsappUrl(driverPhone, driverWhatsappText({ driver: driver.name, businessName, orderNumber: o.number })))}
                  showLabel={wide && !short}
                />
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.driver}>
            <View style={styles.searchDisc}>
              <Icon name="search" size={18} color={palette.onCobalt} strokeWidth={2.4} />
            </View>
            <View style={styles.driverText}>
              <Text style={styles.cardName}>Recherche d’un livreur</Text>
              <Text style={styles.cardMeta}>Un livreur proche va accepter la course.</Text>
            </View>
          </View>
        )}
        <View style={styles.hr} />
        <View>
          <View style={styles.cashRow}>
            <Text style={styles.cashLabel2} numberOfLines={1}>
              {cash.label}
            </Text>
            {cash.amount > 0 ? <SunPill text={formatFcfa(cash.amount)} testID="hero-tile-cash" /> : null}
          </View>
          {cash.detail ? (
            <Text style={styles.cardMeta} numberOfLines={1}>
              {cash.detail}
            </Text>
          ) : null}
          {cash.payer ? (
            <Text style={styles.cardMeta} numberOfLines={1}>
              {cash.payer}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/**
 * À la place de la tuile héros quand rien n'est en cours : illustration et explication (« Nouvelle livraison » est déjà
 * en haut à droite de la page : pas de deuxième bouton ici).
 */
export function EmptyHeroTile({ store, style }: { store: StoreDto | null; style?: StyleProp<ViewStyle> }) {
  const canRequest = !!store && isBusinessApproved(store);
  return (
    <View style={[styles.tile, shadows.tile, styles.empty, style]} testID="no-active-delivery">
      <CourierIllustration width={220} />
      <View style={styles.emptyText}>
        <Text style={styles.emptyTitle}>Aucune livraison en cours</Text>
        <Text style={styles.emptyBody}>
          {canRequest
            ? 'Demandez un livreur : il récupère le colis chez vous, votre client le suit en direct et reçoit le code à lui donner.'
            : 'Vos livraisons s’afficheront ici, avec leur livreur en direct sur la carte.'}
        </Text>
      </View>
    </View>
  );
}

/** À la place de la tuile héros pendant le premier chargement des livraisons (jamais « Aucune livraison » à tort). */
export function LoadingHeroTile({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.tile, shadows.tile, styles.state, style]} testID="hero-loading">
      <ActivityIndicator color={palette.cobalt} />
      <Text style={styles.stateText}>Chargement des livraisons en cours…</Text>
    </View>
  );
}

/** À la place de la tuile héros quand la liste n'a pas pu être lue (rien d'affiché avant) : explication et « Réessayer ». */
export function ErrorHeroTile({ onRetry, retrying, style }: { onRetry: () => void; retrying: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.tile, shadows.tile, styles.state, style]} testID="hero-error">
      <Text style={styles.emptyTitle}>Livraisons indisponibles</Text>
      <Text style={[styles.emptyBody, styles.stateCenter]}>La liste de vos livraisons en cours n’a pas pu être chargée. Vérifiez la connexion, puis réessayez.</Text>
      <PrimaryPill label={retrying ? 'Nouvel essai…' : 'Réessayer'} icon="refresh" desktop onPress={onRetry} testID="hero-retry" />
    </View>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Listes                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Zone qui défile d'une tuile de liste, haute d'un nombre entier de lignes (`pitch` = hauteur d'une ligne + écart) : la
 * dernière ligne visible n'est jamais coupée en deux au bas de la tuile. S'il y a plus de lignes que de place, une
 * dernière ligne le dit (« + 2 autres livraisons en cours ») ; elle fait défiler la liste (et sur le web la barre de
 * défilement reste visible) : aucune livraison n'est cachée sans le dire.
 */
function RowsViewport({
  pitch,
  gap,
  count,
  moreLabel,
  children,
  contentStyle,
}: {
  pitch: number;
  gap: number;
  /** Nombre de lignes (enfants). */
  count: number;
  /** « + N autres … » : texte de la ligne qui annonce les lignes cachées ; sans lui, pas d'annonce. */
  moreLabel?: (hidden: number) => string;
  children: ReactNode;
  contentStyle: StyleProp<ViewStyle>;
}) {
  const [room, setRoom] = useState<number | null>(null);
  const [scrollY, setScrollY] = useState(0);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const fit = room === null ? null : Math.max(1, Math.floor((room - ROWS_INSET * 2 + gap) / pitch));
  const overflow = fit !== null && count > fit && !!moreLabel;
  // Place de la ligne « + N autres » prise sur les lignes visibles.
  const rows = fit === null ? null : overflow ? Math.max(1, Math.floor((room! - ROWS_INSET * 2 - MORE_ROW + gap) / pitch)) : fit;
  const height = rows === null ? undefined : ROWS_INSET * 2 + rows * pitch - gap;
  const seen = rows === null ? count : Math.min(count, Math.floor((scrollY + rows * pitch + pitch / 2) / pitch));
  const hidden = Math.max(0, count - seen);
  return (
    <View
      style={styles.rowsRoom}
      onLayout={(e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        if (h > 0 && h !== room) setRoom(h);
      }}
    >
      <ScrollView
        ref={scroller}
        style={height === undefined ? styles.flexFill : { height, flexGrow: 0 }}
        contentContainerStyle={contentStyle}
        showsVerticalScrollIndicator={overflow && Platform.OS === 'web'}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={64}
      >
        {children}
      </ScrollView>
      {overflow ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hidden > 0 ? `${moreLabel!(hidden)}. Faire défiler la liste` : 'Revenir en haut de la liste'}
          onPress={() => scroller.current?.scrollTo({ y: hidden > 0 ? scrollY + (rows ?? 1) * pitch : 0, animated: true })}
          style={(s: WebPressState) => [styles.more, POINTER, (s.hovered || s.pressed) && styles.moreHover]}
          testID="rows-more"
        >
          <Text style={styles.moreText} numberOfLines={1}>
            {hidden > 0 ? moreLabel!(hidden) : 'Revenir en haut'}
          </Text>
          <Icon name={hidden > 0 ? 'chevronDown' : 'chevronUp'} size={14} color={palette.cobaltText} strokeWidth={2.6} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Marge autour des lignes d'une liste (l'anneau de focus du clavier n'est pas rogné par la zone qui défile). */
const ROWS_INSET = 3;
/** Hauteur de la ligne « + N autres … » sous une liste qui déborde. */
const MORE_ROW = 36;

function TileHead({ title, count, action }: { title: string; count?: number | string | null; action?: { label: string; href: Href; testID?: string } }) {
  return (
    <View style={styles.head}>
      <Text style={styles.headTitle} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      {count ? (
        <View style={styles.count}>
          <Text style={styles.countText} testID="live-count">
            {count}
          </Text>
        </View>
      ) : null}
      {action ? (
        <NavLink href={action.href}>
          <Pressable accessibilityRole="link" accessibilityLabel={action.label} style={[styles.headBtnWrap, POINTER]} testID={action.testID} {...FOCUS_RING_INNER}>
            {(s: WebPressState) => (
              <View {...FOCUS_SHAPE} style={[styles.headBtn, (s.hovered || s.pressed) && styles.headBtnHover]}>
                <Icon name="chevronRight" size={16} color={palette.ink} strokeWidth={2.5} />
              </View>
            )}
          </Pressable>
        </NavLink>
      ) : null}
    </View>
  );
}

/**
 * Tuile « En cours » : toutes les livraisons en cours. Un clic sur une ligne la choisit (la tuile héros et la carte la
 * suivent) ; un clic sur la ligne déjà choisie, ou sur sa flèche, ouvre le suivi complet. Recherche en
 * cours : le compteur dit « 2 / 12 ». `state` : premier chargement ou liste illisible (jamais « aucune » à tort).
 */
export function LiveListTile({
  list,
  total,
  selectedId,
  onSelect,
  onOpen,
  now,
  query,
  state = 'ready',
  style,
}: {
  list: OrderDto[];
  total: number;
  selectedId: string | null;
  onSelect: (o: OrderDto) => void;
  onOpen: (o: OrderDto) => void;
  now: number;
  query: string;
  state?: 'ready' | 'loading' | 'error';
  style?: StyleProp<ViewStyle>;
}) {
  const searching = query.trim().length > 0;
  const count = state !== 'ready' ? null : searching ? `${list.length} / ${total}` : total;
  return (
    <View style={[styles.tile, shadows.tile, styles.listTile, style]} testID="live-list">
      <TileHead title="En cours" count={count} />
      {state === 'loading' ? (
        <Text style={styles.listEmpty}>Chargement…</Text>
      ) : state === 'error' ? (
        <Text style={styles.listEmpty}>Livraisons indisponibles pour le moment.</Text>
      ) : list.length === 0 ? (
        <Text style={styles.listEmpty}>
          {searching ? `Aucune livraison en cours ne correspond à « ${query.trim()} ».` : 'Les livraisons demandées s’afficheront ici, avec leur livreur.'}
        </Text>
      ) : (
        <RowsViewport
          pitch={68}
          gap={4}
          count={list.length}
          moreLabel={(n) => `+ ${n} ${n > 1 ? 'autres livraisons' : 'autre livraison'} en cours`}
          contentStyle={styles.rowsContent}
        >
          {list.map((o) => {
            const selected = o.id === selectedId;
            const eta = liveEta(o, now);
            const cash = heroCash(o);
            const time = eta.kind === 'request' ? null : eta.kind === 'pickup' ? eta.deliveryClock : eta.clock;
            const name = o.recipientName ?? 'Destinataire';
            return (
              <View key={o.id} style={[styles.row, selected && styles.rowOn]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${name}, ${liveStatusText(o, eta).toLowerCase()}${time ? `, livraison vers ${time}` : ''}${cash.amount > 0 ? `, ${formatFcfa(cash.amount)} à encaisser` : ''}. ${selected ? 'Ouvrir le suivi' : 'Afficher sur la carte'}`}
                  onPress={() => (selected ? onOpen(o) : onSelect(o))}
                  style={(s: WebPressState) => [styles.rowMain, POINTER, !selected && (s.hovered || s.pressed) && styles.rowHover]}
                  testID={`live-row-${o.id}`}
                >
                  <InitialsAvatar name={name} size={40} tone={avatarToneOf(o, selected)} />
                  <View style={styles.rowMid}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {name}
                    </Text>
                    <View style={styles.rowSub}>
                      <MiniChip label={liveStatusText(o, eta)} tone={miniToneOf(o)} dot={o.status === 'SEARCHING_DRIVER' || o.status === 'PENDING'} />
                      {o.driver ? (
                        <Text style={styles.rowDriver} numberOfLines={1}>
                          {shortName(o.driver.name)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.rowEnd}>
                    {time ? (
                      <View style={styles.timeRow}>
                        {eta.kind === 'pickup' ? <Icon name="approx" size={12} color={palette.inkMuted} strokeWidth={2.4} /> : null}
                        <Text style={styles.rowTime}>{time}</Text>
                      </View>
                    ) : (
                      <Text style={styles.rowWait} numberOfLines={1}>
                        {eta.inText ?? '—'}
                      </Text>
                    )}
                    <Text style={styles.rowAmount} numberOfLines={1}>
                      {cash.amount > 0 ? formatFcfa(cash.amount) : 'Rien à encaisser'}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Ouvrir le suivi de ${name}`}
                  onPress={() => onOpen(o)}
                  style={(s: WebPressState) => [styles.rowOpen, POINTER, FOCUS_RING_INNER, (s.hovered || s.pressed) && styles.rowOpenHover]}
                  testID={`live-open-${o.id}`}
                >
                  <Icon name="chevronRight" size={18} color={selected ? palette.cobalt : palette.inkMuted} strokeWidth={2.4} />
                </Pressable>
              </View>
            );
          })}
        </RowsViewport>
      )}
    </View>
  );
}

/** Tuile « Dernières livraisons » : livrées aujourd'hui, la plus récente en premier ; une ligne ouvre son suivi. */
export function RecentTile({
  list,
  loading,
  error,
  query,
  onOpen,
  style,
}: {
  list: OrderDto[] | null;
  loading: boolean;
  error: string | null;
  query: string;
  onOpen: (o: OrderDto) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.tile, shadows.tile, styles.doneTile, style]} testID="recent-list">
      <TileHead title="Dernières livraisons" action={{ label: 'Voir tout l’historique', href: '/business/history', testID: 'recent-see-all' }} />
      {list === null ? (
        <Text style={styles.listEmpty}>{error ?? (loading ? 'Chargement…' : '')}</Text>
      ) : list.length === 0 ? (
        <Text style={styles.listEmpty}>{query.trim() ? `Aucune livraison du jour ne correspond à « ${query.trim()} ».` : 'Pas encore de livraison livrée aujourd’hui.'}</Text>
      ) : (
        <RowsViewport pitch={64} gap={0} count={list.length} moreLabel={(n) => `+ ${n} ${n > 1 ? 'autres livraisons livrées' : 'autre livraison livrée'}`} contentStyle={styles.doneContent}>
          {list.map((o, i) => {
            const minutes = deliveryMinutes(o);
            const area = dropoffArea(o);
            const cash = heroCash(o);
            const name = o.recipientName ?? 'Destinataire';
            return (
              <Pressable
                key={o.id}
                accessibilityRole="button"
                accessibilityLabel={`${name}, livrée à ${o.deliveredAt ? formatTime(o.deliveredAt) : ''}${cash.amount > 0 ? `, encaissé ${formatFcfa(cash.amount)}` : ''}. Ouvrir le détail`}
                onPress={() => onOpen(o)}
                style={(s: WebPressState) => [styles.done, POINTER, (s.hovered || s.pressed) && styles.doneHover]}
                testID={`recent-${o.id}`}
              >
                {i > 0 ? <View style={styles.doneSep} /> : null}
                <View style={styles.ok}>
                  <Icon name="check" size={14} color={palette.mintText} strokeWidth={2.8} />
                </View>
                <View style={styles.doneText}>
                  <View style={styles.doneLine}>
                    <Text style={styles.doneName} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={styles.doneTime}>{o.deliveredAt ? formatTime(o.deliveredAt) : ''}</Text>
                  </View>
                  <View style={styles.doneLine}>
                    <Text style={styles.doneMeta} numberOfLines={1}>
                      {[area, minutes !== null ? `${minutes} min` : null].filter(Boolean).join(' · ')}
                    </Text>
                    <Text style={styles.doneAmount} numberOfLines={1}>
                      {cash.amount > 0 ? formatFcfa(cash.amount) : '—'}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </RowsViewport>
      )}
    </View>
  );
}

/** Fond plus sombre posé sur la tuile cobalt (bloc du destinataire, survol de « Suivi ») : blanc dessus 8,1:1, onCobalt2 6,8:1. */
const ON_HERO_CARD = alpha(palette.ink, 0.22);

const styles = StyleSheet.create({
  tile: { backgroundColor: palette.card, borderRadius: 24, overflow: 'hidden' },
  kpi: { paddingTop: 16, paddingBottom: 14, paddingHorizontal: 18 },
  kpiIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  kpiValue: { marginTop: 'auto', marginLeft: -2, fontWeight: '800', letterSpacing: -1.4, color: palette.ink, ...tabular },
  kpiUnit: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  kpiLabel: { marginTop: 6, fontSize: 13, lineHeight: 18, fontWeight: '600', color: palette.inkMuted },
  cash: { backgroundColor: palette.sun },
  cashTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cashIcon: { backgroundColor: alpha(palette.ink, 0.08) },
  cashLabel: { color: palette.onSun2 },
  fee: { height: 26, borderRadius: 13, paddingHorizontal: 10, backgroundColor: alpha(palette.ink, 0.08), justifyContent: 'center', flexShrink: 1 },
  feeText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: palette.ink, ...tabular },
  hero: { flexDirection: 'row', gap: 24, padding: 24, borderRadius: radii.hero, backgroundColor: palette.cobalt, overflow: 'hidden' },
  heroLeft: { flex: 1, minWidth: 0 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroChip: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 28, paddingLeft: 10, paddingRight: 12, borderRadius: 14, backgroundColor: alpha(palette.white, 0.16), flexShrink: 1 },
  heroDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.white, boxShadow: `0 0 0 3px ${alpha(palette.white, 0.25)}` },
  heroChipText: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: palette.onCobalt, flexShrink: 1 },
  heroId: { fontSize: 13, lineHeight: 17, fontWeight: '600', color: palette.onCobalt2, ...tabular },
  heroOpen: { marginLeft: 'auto' },
  // 44 px de haut (cible tactile d'une tablette en paysage).
  heroOpenInner: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 44, paddingLeft: 16, paddingRight: 12, borderRadius: 22, backgroundColor: alpha(palette.white, 0.16) },
  // Survol : fond plus sombre (blanc 7,4:1), jamais plus clair (un voile blanc plus fort tomberait sous 4,5:1).
  heroOpenHover: { backgroundColor: ON_HERO_CARD },
  heroOpenText: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: palette.onCobalt },
  etaLabel: { marginTop: 18, fontSize: 14, lineHeight: 18, fontWeight: '600', color: palette.onCobalt2 },
  etaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: 2 },
  eta: { marginLeft: -3, fontWeight: '800', color: palette.onCobalt, ...tabular },
  etaIn: { fontSize: 18, lineHeight: 22, fontWeight: '800', letterSpacing: -0.2, color: palette.onCobalt, ...tabular },
  etaWord: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.9, color: palette.onCobalt },
  etaWordSearch: { fontSize: 30, lineHeight: 34, marginTop: 4 },
  notes: { marginTop: 16, gap: 8 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noteText: { flexShrink: 1, fontSize: 12, lineHeight: 16, fontWeight: '600', color: palette.onCobalt },
  heroSteps: { marginTop: 'auto', paddingTop: 14 },
  heroCardShort: { gap: 8, paddingVertical: 14 },
  heroCard: { borderRadius: 20, backgroundColor: ON_HERO_CARD, padding: 16, justifyContent: 'space-between', gap: 12, boxShadow: `inset 0 0 0 1px ${alpha(palette.white, 0.06)}` },
  cardName: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: palette.onCobalt },
  cardMeta: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: palette.onCobalt2 },
  hr: { height: 1, backgroundColor: alpha(palette.white, 0.14) },
  driver: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  driverText: { flex: 1, minWidth: 0 },
  driverMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rounds: { flexDirection: 'row', gap: 6 },
  round: { alignItems: 'center', gap: 4, minWidth: 48, minHeight: 48, justifyContent: 'center' },
  roundDisc: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 10px -2px ${alpha(palette.ink, 0.3)}` },
  roundDiscHover: { backgroundColor: palette.cobaltTint },
  roundLabel: { fontSize: 11, lineHeight: 14, fontWeight: '600', color: palette.onCobalt2 },
  searchDisc: { width: 40, height: 40, borderRadius: 20, backgroundColor: alpha(palette.white, 0.16), alignItems: 'center', justifyContent: 'center' },
  cashRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 32 },
  cashLabel2: { flexShrink: 1, fontSize: 13, lineHeight: 18, fontWeight: '700', color: palette.onCobalt },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 28, paddingHorizontal: 32, paddingVertical: 24 },
  emptyText: { flex: 1, gap: 8, alignItems: 'flex-start' },
  emptyTitle: { fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: -0.4, color: palette.ink },
  emptyBody: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: palette.inkMuted, maxWidth: 420 },
  state: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  stateText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: palette.inkMuted },
  stateCenter: { textAlign: 'center' },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: MORE_ROW, marginTop: 2, borderRadius: 18, backgroundColor: palette.cobaltTint },
  moreHover: { backgroundColor: palette.raisedHigh },
  moreText: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: palette.cobaltText, ...tabular },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28, paddingHorizontal: 7 },
  headTitle: { fontSize: 17, lineHeight: 22, fontWeight: '800', letterSpacing: -0.25, color: palette.ink, flexShrink: 1 },
  count: { minWidth: 24, height: 22, paddingHorizontal: 7, borderRadius: 11, backgroundColor: palette.cobaltTint, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 12, lineHeight: 16, fontWeight: '800', color: palette.cobaltText, ...tabular },
  headBtnWrap: { marginLeft: 'auto', padding: 10, margin: -10 },
  headBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: palette.canvas, alignItems: 'center', justifyContent: 'center' },
  headBtnHover: { backgroundColor: palette.raisedHigh },
  listTile: { paddingTop: 18, paddingHorizontal: 13, paddingBottom: 12 },
  doneTile: { paddingTop: 18, paddingLeft: 13, paddingRight: 17, paddingBottom: 8 },
  listEmpty: { marginTop: 14, paddingHorizontal: 7, fontSize: 13, lineHeight: 19, fontWeight: '500', color: palette.inkMuted },
  rowsRoom: { flex: 1, marginTop: 10, minHeight: 0 },
  flexFill: { flex: 1 },
  // 3 px autour des lignes : l'anneau de focus du clavier n'est pas rogné par la zone qui défile.
  rowsContent: { gap: 4, padding: 3 },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, minHeight: 64 },
  rowOn: { backgroundColor: palette.cobaltTint },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 12, borderRadius: 18 },
  rowHover: { backgroundColor: palette.raised },
  rowOpen: { width: 36, height: 48, marginRight: 4, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowOpenHover: { backgroundColor: palette.raised },
  rowMid: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 14, lineHeight: 19, fontWeight: '700', color: palette.ink },
  rowSub: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  rowDriver: { flexShrink: 1, fontSize: 12, lineHeight: 16, fontWeight: '600', color: palette.inkMuted },
  rowEnd: { alignItems: 'flex-end', flexShrink: 0 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  rowTime: { fontSize: 15, lineHeight: 19, fontWeight: '800', letterSpacing: -0.15, color: palette.ink, ...tabular },
  rowWait: { fontSize: 13, lineHeight: 19, fontWeight: '700', color: palette.inkMuted },
  rowAmount: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '600', color: palette.inkMuted, ...tabular },
  doneContent: { padding: 3 },
  done: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, borderRadius: 14 },
  doneHover: { backgroundColor: palette.raised },
  doneSep: { position: 'absolute', left: 38, right: 0, top: 0, height: 1, backgroundColor: palette.line },
  ok: { width: 26, height: 26, borderRadius: 13, backgroundColor: palette.mintTint, alignItems: 'center', justifyContent: 'center', marginLeft: 0 },
  doneText: { flex: 1, minWidth: 0 },
  doneLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  doneName: { flexShrink: 1, fontSize: 13, lineHeight: 18, fontWeight: '700', color: palette.ink },
  doneTime: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: palette.ink, ...tabular },
  doneMeta: { flexShrink: 1, marginTop: 3, fontSize: 12, lineHeight: 16, fontWeight: '500', color: palette.inkMuted },
  doneAmount: { marginTop: 3, fontSize: 12, lineHeight: 16, fontWeight: '700', color: palette.ink, ...tabular },
});
