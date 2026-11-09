import { useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LABELS, type BusinessSummaryDto, type OrderDto, type StoreDto } from '@yaar/shared';
import { Text } from '../../Text';
import { CourierIllustration } from '../../design/CourierIllustration';
import { Icon, type IconName } from '../../design/Icon';
import { formatFcfa, formatTime } from '../../../lib/format';
import { driverWhatsappText, recipientCallName } from '../../../lib/share';
import { telUrl, whatsappUrl } from '../../../lib/tel';
import { isBusinessApproved } from '../../../state/business';
import { palette, radii, shadows, tabular } from '../../../theme';
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
import { avatarToneOf, InitialsAvatar, MiniChip, miniToneOf, NewDeliveryButton, POINTER, SegmentedProgress, SunPill, type WebPressState } from '../parts';

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

/** Tuile soleil « À reverser · encaissé pour vous » (espèces encaissées pour l'entreprise aujourd'hui) et ses frais. */
export function CashTile({ summary, style }: { summary: BusinessSummaryDto | null; style?: StyleProp<ViewStyle> }) {
  const goods = summary ? formatAmount(summary.today.goodsCollected) : '…';
  const fees = summary && summary.today.deliveryFees > 0 ? `${formatAmount(summary.today.deliveryFees)} FCFA de frais` : null;
  const size = figureSize(goods);
  return (
    <View
      style={[styles.tile, styles.kpi, styles.cash, shadows.sun, style]}
      accessible
      accessibilityLabel={summary ? `À reverser : ${goods} FCFA, encaissés pour vous aujourd’hui${fees ? `, ${fees}` : ''}` : 'À reverser : chargement'}
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
        À reverser · encaissé pour vous
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
  return 'Recherche d’un livreur';
}

/** Bouton rond blanc de la tuile héros (disque 40 px, pictogramme cobalt, libellé 11/600 dessous). */
function HeroRound({ icon, label, a11y, onPress, showLabel }: { icon: IconName; label: string; a11y: string; onPress: () => void; showLabel: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} style={[styles.round, POINTER]}>
      {(s: WebPressState) => (
        <>
          <View style={[styles.roundDisc, (s.hovered || s.pressed) && styles.roundDiscHover]}>
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
  return (
    <View
      style={[styles.hero, shadows.hero, style]}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w > 0 && w !== width) setWidth(w);
      }}
      accessibilityLabel={`Livraison #${o.number} suivie`}
      testID="hero-tile"
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
          >
            {(s: WebPressState) => (
              <View style={[styles.heroOpenInner, (s.hovered || s.pressed) && styles.heroOpenHover]}>
                <Text style={styles.heroOpenText}>Suivi</Text>
                <Icon name="chevronRight" size={14} color={palette.onCobalt} strokeWidth={2.6} />
              </View>
            )}
          </Pressable>
        </View>
        <Text style={styles.etaLabel}>{eta.clock ? eta.label : eta.kind === 'pickup' ? 'Retrait' : 'Arrivée'}</Text>
        <View style={styles.etaRow} accessible accessibilityLabel={eta.clock ? `${eta.label} ${eta.clock}${eta.inText ? `, ${eta.inText}` : ''}` : eta.label}>
          {eta.clock ? (
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
              Repère « {landmark} »
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

/** À la place de la tuile héros quand rien n'est en cours : illustration, explication, « Nouvelle livraison ». */
export function EmptyHeroTile({ stores, store, style }: { stores: readonly StoreDto[] | undefined; store: StoreDto | null; style?: StyleProp<ViewStyle> }) {
  const canRequest = !!store && isBusinessApproved(store);
  return (
    <View style={[styles.tile, shadows.tile, styles.empty, style]} testID="no-active-delivery">
      <CourierIllustration width={220} />
      <View style={styles.emptyText}>
        <Text style={styles.emptyTitle}>Aucune livraison en cours</Text>
        <Text style={styles.emptyBody}>
          {canRequest
            ? 'Demandez un livreur : il récupère le colis chez vous, votre client le suit en direct et reçoit le code à lui donner.'
            : 'Vos livraisons s’afficheront ici, avec leur livreur en direct sur la carte.'}
        </Text>
        {canRequest || !store ? <NewDeliveryButton stores={stores} store={store} variant="desktop" style={styles.emptyCta} /> : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Listes                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Zone qui défile d'une tuile de liste, haute d'un nombre entier de lignes (`pitch` = hauteur d'une ligne + écart) : la
 * dernière ligne visible n'est jamais coupée en deux au bas de la tuile ; la suite se lit en faisant défiler.
 */
function RowsViewport({ pitch, gap, children, contentStyle }: { pitch: number; gap: number; children: ReactNode; contentStyle: StyleProp<ViewStyle> }) {
  const [room, setRoom] = useState<number | null>(null);
  const rows = room === null ? null : Math.max(1, Math.floor((room - ROWS_INSET * 2 + gap) / pitch));
  const height = rows === null ? undefined : ROWS_INSET * 2 + rows * pitch - gap;
  return (
    <View
      style={styles.rowsRoom}
      onLayout={(e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        if (h > 0 && h !== room) setRoom(h);
      }}
    >
      <ScrollView style={height === undefined ? styles.flexFill : { height, flexGrow: 0 }} contentContainerStyle={contentStyle} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </View>
  );
}

/** Marge autour des lignes d'une liste (l'anneau de focus du clavier n'est pas rogné par la zone qui défile). */
const ROWS_INSET = 3;

function TileHead({ title, count, action }: { title: string; count?: number | null; action?: { label: string; onPress: () => void; testID?: string } }) {
  return (
    <View style={styles.head}>
      <Text style={styles.headTitle} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      {count ? (
        <View style={styles.count}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      ) : null}
      {action ? (
        <Pressable accessibilityRole="link" accessibilityLabel={action.label} onPress={action.onPress} style={[styles.headBtnWrap, POINTER]} testID={action.testID}>
          {(s: WebPressState) => (
            <View style={[styles.headBtn, (s.hovered || s.pressed) && styles.headBtnHover]}>
              <Icon name="chevronRight" size={16} color={palette.ink} strokeWidth={2.5} />
            </View>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Tuile « En cours » : toutes les livraisons en cours. Une ligne se choisit (la tuile héros et la carte la suivent) ;
 * le suivi complet s'ouvre depuis la tuile héros (« Suivi »), qui montre toujours la livraison choisie.
 */
export function LiveListTile({
  list,
  total,
  selectedId,
  onSelect,
  now,
  query,
  style,
}: {
  list: OrderDto[];
  total: number;
  selectedId: string | null;
  onSelect: (o: OrderDto) => void;
  now: number;
  query: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.tile, shadows.tile, styles.listTile, style]} testID="live-list">
      <TileHead title="En cours" count={total} />
      {list.length === 0 ? (
        <Text style={styles.listEmpty}>
          {query.trim() ? `Aucune livraison en cours ne correspond à « ${query.trim()} ».` : 'Aucune livraison en cours pour le moment.'}
        </Text>
      ) : (
        <RowsViewport pitch={68} gap={4} contentStyle={styles.rowsContent}>
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
                  accessibilityLabel={`${name}, ${liveStatusText(o, eta).toLowerCase()}${time ? `, livraison vers ${time}` : ''}. Afficher sur la carte`}
                  onPress={() => onSelect(o)}
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
  onSeeAll,
  style,
}: {
  list: OrderDto[] | null;
  loading: boolean;
  error: string | null;
  query: string;
  onOpen: (o: OrderDto) => void;
  onSeeAll: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.tile, shadows.tile, styles.doneTile, style]} testID="recent-list">
      <TileHead title="Dernières livraisons" action={{ label: 'Voir tout l’historique', onPress: onSeeAll, testID: 'recent-see-all' }} />
      {list === null ? (
        <Text style={styles.listEmpty}>{error ?? (loading ? 'Chargement…' : '')}</Text>
      ) : list.length === 0 ? (
        <Text style={styles.listEmpty}>{query.trim() ? `Aucune livraison du jour ne correspond à « ${query.trim()} ».` : 'Pas encore de livraison livrée aujourd’hui.'}</Text>
      ) : (
        <RowsViewport pitch={64} gap={0} contentStyle={styles.doneContent}>
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

const ON_HERO_CARD = 'rgba(10, 20, 90, 0.18)';

const styles = StyleSheet.create({
  tile: { backgroundColor: palette.card, borderRadius: 24, overflow: 'hidden' },
  kpi: { paddingTop: 16, paddingBottom: 14, paddingHorizontal: 18 },
  kpiIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  kpiValue: { marginTop: 'auto', marginLeft: -2, fontWeight: '800', letterSpacing: -1.4, color: palette.ink, ...tabular },
  kpiUnit: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  kpiLabel: { marginTop: 6, fontSize: 13, lineHeight: 18, fontWeight: '600', color: palette.inkMuted },
  cash: { backgroundColor: palette.sun },
  cashTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cashIcon: { backgroundColor: 'rgba(12, 18, 34, 0.08)' },
  cashLabel: { color: palette.onSun2 },
  fee: { height: 26, borderRadius: 13, paddingHorizontal: 10, backgroundColor: 'rgba(12, 18, 34, 0.08)', justifyContent: 'center', flexShrink: 1 },
  feeText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: palette.ink, ...tabular },
  hero: { flexDirection: 'row', gap: 24, padding: 24, borderRadius: radii.hero, backgroundColor: palette.cobalt, overflow: 'hidden' },
  heroLeft: { flex: 1, minWidth: 0 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroChip: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 28, paddingLeft: 10, paddingRight: 12, borderRadius: 14, backgroundColor: 'rgba(255, 255, 255, 0.16)', flexShrink: 1 },
  heroDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.white, boxShadow: '0 0 0 3px rgba(255, 255, 255, 0.25)' },
  heroChipText: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: palette.onCobalt, flexShrink: 1 },
  heroId: { fontSize: 13, lineHeight: 17, fontWeight: '600', color: palette.onCobalt2, ...tabular },
  heroOpen: { marginLeft: 'auto' },
  heroOpenInner: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 32, paddingLeft: 12, paddingRight: 8, borderRadius: 16, backgroundColor: 'rgba(255, 255, 255, 0.16)' },
  // Survol : fond plus sombre (blanc 7,4:1), jamais plus clair (un voile blanc plus fort tomberait sous 4,5:1).
  heroOpenHover: { backgroundColor: ON_HERO_CARD },
  heroOpenText: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: palette.onCobalt },
  etaLabel: { marginTop: 18, fontSize: 14, lineHeight: 18, fontWeight: '600', color: palette.onCobalt2 },
  etaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: 2 },
  eta: { marginLeft: -3, fontWeight: '800', color: palette.onCobalt, ...tabular },
  etaIn: { fontSize: 18, lineHeight: 22, fontWeight: '800', letterSpacing: -0.2, color: palette.onCobalt, ...tabular },
  etaWord: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.9, color: palette.onCobalt },
  notes: { marginTop: 16, gap: 8 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noteText: { flexShrink: 1, fontSize: 12, lineHeight: 16, fontWeight: '600', color: palette.onCobalt },
  heroSteps: { marginTop: 'auto', paddingTop: 14 },
  heroCardShort: { gap: 8, paddingVertical: 14 },
  heroCard: { borderRadius: 20, backgroundColor: ON_HERO_CARD, padding: 16, justifyContent: 'space-between', gap: 12, boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.06)' },
  cardName: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: palette.onCobalt },
  cardMeta: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: palette.onCobalt2 },
  hr: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.14)' },
  driver: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  driverText: { flex: 1, minWidth: 0 },
  driverMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rounds: { flexDirection: 'row', gap: 6 },
  round: { alignItems: 'center', gap: 4, minWidth: 48, minHeight: 48, justifyContent: 'center' },
  roundDisc: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px -2px rgba(6, 16, 80, 0.35)' },
  roundDiscHover: { backgroundColor: palette.cobaltTint },
  roundLabel: { fontSize: 11, lineHeight: 14, fontWeight: '600', color: palette.onCobalt2 },
  searchDisc: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255, 255, 255, 0.16)', alignItems: 'center', justifyContent: 'center' },
  cashRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 32 },
  cashLabel2: { flexShrink: 1, fontSize: 13, lineHeight: 18, fontWeight: '700', color: palette.onCobalt },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 28, paddingHorizontal: 32, paddingVertical: 24 },
  emptyText: { flex: 1, gap: 8, alignItems: 'flex-start' },
  emptyTitle: { fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: -0.4, color: palette.ink },
  emptyBody: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: palette.inkMuted, maxWidth: 420 },
  emptyCta: { marginTop: 8 },
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
