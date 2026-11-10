import { Linking, Pressable, StyleSheet, View } from 'react-native';
import type { BusinessSummaryDto, OrderDto } from '@yaar/shared';
import { Text } from '../../Text';
import { Icon } from '../../design/Icon';
import { formatFcfa, formatTime } from '../../../lib/format';
import { recipientWhatsappText } from '../../../lib/share';
import { telUrl, whatsappUrl } from '../../../lib/tel';
import { touchTarget } from '../../../lib/touchTarget';
import { alpha, FOCUS_RING_INNER, FOCUS_SHAPE, ON_COBALT_SURFACE, palette, shadows, tabular } from '../../../theme';
import { deliveryTimeline, dropoffArea, formatAmount, heroCash, liveEta, liveStatusText, shortName, type LiveEta } from '../dashboardData';
import { deliveryEtaText, deliverySummaryLabel } from '../DeliveryCards';
import { avatarToneOf, InitialsAvatar, MiniChip, miniToneOf, POINTER, SegmentedProgress, SunPill, type WebPressState } from '../parts';

/* ------------------------------------------------------------------------------------------------------------------ */
/* Pastille de la carte                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Pastille blanche posée sur la carte : « ● 3 en cours | 1 en recherche », toujours sur une ligne. */
export function MapSummaryPill({ total, searching, style }: { total: number; searching: number; style?: object }) {
  return (
    <View
      style={[styles.pill, shadows.float, style]}
      accessible
      accessibilityLabel={`${total} livraison${total > 1 ? 's' : ''} en cours${searching > 0 ? `, dont ${searching} en recherche d’un livreur` : ''}`}
      testID="map-summary"
    >
      <View style={styles.liveDot} />
      <Text style={styles.pillText} numberOfLines={1} testID="summary-on-the-way">{`${total} en cours`}</Text>
      {searching > 0 ? (
        <>
          <View style={styles.pillSep} />
          <Text style={[styles.pillText, styles.pillSub]} numberOfLines={1} testID="summary-searching">{`${searching} en recherche`}</Text>
        </>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Pastilles de chiffres                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Chiffres du jour (planche : « 3 en cours », « 14 livrées », pastille soleil « 87 500 FCFA encaissés aujourd’hui ») :
 * remplis canvas dans la feuille blanche, chiffres 800 tabulaires. La pastille soleil dit le chiffre du JOUR (le
 * reversement par Yaar n'est pas suivi : « à reverser » serait faux le lendemain matin). `active` null : liste et
 * résumé pas encore lus (« … ») ; résumé en échec (`unavailable`) : « — », dit indisponible.
 */
export function KpiChips({
  active,
  summary,
  unavailable = false,
  dense = false,
}: {
  active: number | null;
  summary: BusinessSummaryDto | null;
  unavailable?: boolean;
  dense?: boolean;
}) {
  const goods = summary ? formatAmount(summary.today.goodsCollected) : null;
  const big = (goods?.length ?? 0) > 7;
  const wait = unavailable ? '—' : '…';
  const waitLabel = unavailable ? 'indisponible' : 'chargement';
  const delivered = summary?.today.delivered ?? null;
  return (
    <View style={styles.kpis} testID="kpi-chips">
      <View style={[styles.kpi, dense && styles.kpiDense]} accessible accessibilityLabel={active === null ? 'Livraisons en cours\u202f: chargement' : `${active} livraison${active > 1 ? 's' : ''} en cours`}>
        <Text style={styles.kpiValue}>{active ?? '…'}</Text>
        <Text style={styles.kpiLabel}>en cours</Text>
      </View>
      <View
        style={[styles.kpi, dense && styles.kpiDense]}
        accessible
        accessibilityLabel={delivered !== null ? `${delivered} livrée${delivered > 1 ? 's' : ''} aujourd’hui` : `Livrées aujourd’hui\u202f: ${waitLabel}`}
        testID="kpi-delivered-chip"
      >
        <Text style={styles.kpiValue}>{delivered ?? wait}</Text>
        <Text style={styles.kpiLabel} numberOfLines={1}>
          {delivered === 1 ? 'livrée' : 'livrées'}
        </Text>
      </View>
      <View
        style={[styles.kpi, styles.kpiSun, dense && styles.kpiDense]}
        accessible
        accessibilityLabel={goods ? `${goods} FCFA encaissés pour vous aujourd’hui` : `Encaissé pour vous aujourd’hui\u202f: ${waitLabel}`}
        testID="kpi-goods"
      >
        <Text style={[styles.kpiValue, big && styles.kpiValueSmall]} numberOfLines={1}>
          {goods ?? wait}
          {goods ? <Text style={styles.kpiUnit}> FCFA</Text> : null}
        </Text>
        <Text style={[styles.kpiLabel, styles.kpiLabelSun]} numberOfLines={1}>
          encaissés aujourd’hui
        </Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Tuile héros (téléphone)                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Ligne principale de la tuile héros : avec une heure, l'heure (« 12:09 ») et à côté son libellé (« Arrivée ») et
 * « dans 7 min » ; sans heure, un sur-titre et l'état en mots (« Recherche d’un livreur… », « Livreur sur place »). Une
 * livraison qui attend un livreur n'affiche JAMAIS l'heure de sa demande en grand (elle se lirait comme une arrivée).
 */
export function heroHeadline(o: OrderDto, eta: LiveEta): { clock: string; label: string; inText: string | null } | { kicker: string; word: string } {
  if (o.status === 'PICKED_UP') {
    if (eta.clock) return { clock: eta.clock, label: 'Arrivée', inText: eta.inText };
    return eta.minutes === 0 ? { kicker: 'Colis en route', word: 'Arrivée imminente' } : { kicker: 'Colis récupéré', word: 'En livraison' };
  }
  if (o.status === 'ASSIGNED') {
    if (eta.clock) return { clock: eta.clock, label: 'Au retrait', inText: eta.inText };
    return { kicker: 'Retrait du colis', word: eta.minutes === 0 ? 'Livreur sur place' : 'Livreur en route' };
  }
  return { kicker: `Demandée à ${formatTime(o.createdAt)}${eta.inText ? ` · ${eta.inText}` : ''}`, word: 'Recherche d’un livreur…' };
}

/** Phrase des lecteurs d'écran d'une livraison en cours, montant à encaisser compris. */
function cardLabel(o: OrderDto, name: string, now: number): string {
  const cash = heroCash(o);
  const base = deliverySummaryLabel(name, o.status, deliveryEtaText(o, now));
  return cash.amount > 0 ? `${base}, ${formatFcfa(cash.amount)} à encaisser` : base;
}

/**
 * La livraison dont le colis arrive le premier : tuile cobalt pleine (la seule de l'écran), 120 px comme la planche.
 * Ligne 1 : heure d'arrivée 44/800 tabulaire, « Arrivée » et « dans 7 min » à côté, « À encaisser » et la pilule
 * soleil à droite ; ligne 2 : destinataire, quartier, livreur ; ligne 3 : progression en pilules. Toute la tuile ouvre
 * le suivi (aucun autre bouton dedans). Les grands chiffres (64–72) restent au détail et à la tuile de l'ordinateur.
 */
export function HeroDeliveryCard({ order: o, now, onPress, compact = false }: { order: OrderDto; now: number; onPress: () => void; compact?: boolean }) {
  const eta = liveEta(o, now);
  const cash = heroCash(o);
  const area = dropoffArea(o);
  const driver = o.driver ? shortName(o.driver.name) : null;
  const name = o.recipientName ?? 'Destinataire';
  const head = heroHeadline(o, eta);
  const clockSize = compact ? 40 : 44;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cardLabel(o, name, now)}
      accessibilityHint="Ouvre le suivi de la livraison"
      onPress={onPress}
      testID={`delivery-${o.id}`}
      style={POINTER}
      {...ON_COBALT_SURFACE}
    >
      {(s: WebPressState) => (
        <View style={[styles.hero, shadows.hero, (s.pressed || s.hovered) && styles.heroPressed]} testID="hero-delivery">
          <View style={styles.heroTop}>
            {'clock' in head ? (
              <View style={styles.heroEta}>
                <Text style={[styles.heroClock, { fontSize: clockSize, lineHeight: 44, letterSpacing: compact ? -1.6 : -1.8 }]} numberOfLines={1}>
                  {head.clock}
                </Text>
                <View style={styles.heroEtaText}>
                  <Text style={styles.heroEtaLabel} numberOfLines={1}>
                    {head.label}
                  </Text>
                  {head.inText ? (
                    <Text style={styles.heroIn} numberOfLines={1}>
                      {head.inText}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : (
              <View style={styles.heroEtaText}>
                <Text style={styles.heroEtaLabel} numberOfLines={1}>
                  {head.kicker}
                </Text>
                <Text style={styles.heroWord} numberOfLines={1} testID="hero-state">
                  {head.word}
                </Text>
              </View>
            )}
            {cash.amount > 0 ? (
              <View style={styles.heroCash}>
                <Text style={styles.heroCashLabel} numberOfLines={1}>
                  {cash.label}
                </Text>
                <SunPill text={formatFcfa(cash.amount)} size="sm" testID="hero-cash" />
              </View>
            ) : null}
          </View>
          <View style={styles.heroWho}>
            <InitialsAvatar name={name} size={24} tone="white" />
            <Text style={styles.heroName} numberOfLines={1}>
              {name}
              {area ? <Text style={styles.heroArea}>{`  ${area}`}</Text> : null}
            </Text>
            {driver ? (
              <View style={styles.heroDriver}>
                <Icon name={o.driver?.vehicleType === 'BIKE' ? 'bike' : o.driver?.vehicleType === 'CAR' ? 'car' : 'moto'} size={16} color={palette.onCobalt2} strokeWidth={2.2} />
                <Text style={styles.heroDriverText} numberOfLines={1}>
                  {driver}
                </Text>
              </View>
            ) : null}
          </View>
          <SegmentedProgress steps={deliveryTimeline(o, now, eta)} onCobalt height={6} style={styles.heroSteps} />
        </View>
      )}
    </Pressable>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Cartes compactes                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

function open(url: string) {
  try {
    void Promise.resolve(Linking.openURL(url)).catch(() => undefined);
  } catch {
    /* lien refusé par la plateforme */
  }
}

/** Petit disque blanc de contact (36 px, zone tactile de 48 px) : WhatsApp ou Appeler le destinataire. */
function ContactDisc({ kind, phone, name, text }: { kind: 'whatsapp' | 'call'; phone: string | null; name: string; text?: string | null }) {
  const touch = touchTarget(36, 48);
  const label = !phone
    ? `${kind === 'call' ? `Appeler ${name}` : `Écrire à ${name} sur WhatsApp`} : numéro indisponible`
    : kind === 'call'
      ? `Appeler ${name} (${phone})`
      : `Écrire à ${name} sur WhatsApp (${phone})`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!phone}
      onPress={() => phone && open(kind === 'call' ? telUrl(phone) : whatsappUrl(phone, text))}
      hitSlop={touch.hitSlop}
      style={[touch.style, POINTER]}
      {...FOCUS_RING_INNER}
    >
      {(s: WebPressState) => (
        <View {...FOCUS_SHAPE} style={[styles.disc, shadows.float, !phone && styles.discOff, (s.pressed || s.hovered) && styles.discPressed]}>
          <Icon name={kind === 'call' ? 'phone' : 'chat'} size={17} color={palette.cobalt} strokeWidth={2.3} />
        </View>
      )}
    </Pressable>
  );
}

/**
 * Livraison en cours (autre que celle de la tuile héros), carte remplie (canvas dans la feuille blanche) :
 * - `duo` (exactement deux, côte à côte, 88 px comme la planche) : pastille aux initiales, nom, état, heure et montant ;
 *   toute la carte ouvre le suivi (les contacts sont au détail) ;
 * - `row` (liste) : la même chose sur une ligne, avec WhatsApp et Appeler du destinataire À CÔTÉ de la partie qui ouvre
 *   le suivi (jamais un bouton dans un bouton).
 */
export function CompactDeliveryCard({
  order: o,
  now,
  businessName,
  onPress,
  layout,
}: {
  order: OrderDto;
  now: number;
  businessName: string | null;
  onPress: () => void;
  layout: 'duo' | 'row';
}) {
  const eta = liveEta(o, now);
  const cash = heroCash(o);
  const name = o.recipientName ?? 'Destinataire';
  const status = liveStatusText(o, eta);
  const searching = o.status === 'SEARCHING_DRIVER' || o.status === 'PENDING';
  const time = eta.kind === 'request' ? (eta.inText ?? '') : (eta.kind === 'pickup' ? eta.deliveryClock : eta.clock) ?? '—';
  const approx = eta.kind !== 'request';
  const whatsappText = recipientWhatsappText({
    url: o.trackingUrl,
    recipientName: o.recipientName,
    recipientIsBusiness: o.recipientIsBusiness,
    businessName,
    orderNumber: o.number,
  });
  const timeNode = (
    <View style={styles.timeRow}>
      {approx && time !== '—' ? <Icon name="approx" size={13} color={palette.inkMuted} strokeWidth={2.4} /> : null}
      <Text style={[styles.time, eta.kind === 'request' && styles.timeWait]} numberOfLines={1}>
        {time}
      </Text>
    </View>
  );
  const amount = cash.amount > 0 ? formatFcfa(cash.amount) : null;
  const opener = (s: WebPressState) =>
    layout === 'duo' ? (
      <View style={[styles.duoOpen, (s.pressed || s.hovered) && styles.openPressed]}>
        <View style={styles.cardHead}>
          <InitialsAvatar name={name} size={32} tone={avatarToneOf(o)} />
          <View style={styles.cardHeadText}>
            <Text style={styles.cardName} numberOfLines={1}>
              {name}
            </Text>
            <View style={styles.statusLine}>
              <View style={[styles.statusDot, o.status === 'ASSIGNED' ? styles.statusDotSun : styles.statusDotCobalt]} />
              <Text style={[styles.statusText, searching ? styles.statusTextSearch : null]} numberOfLines={1}>
                {status}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.duoBottom}>
          {timeNode}
          {amount ? (
            <Text style={styles.amount} numberOfLines={1}>
              {amount}
            </Text>
          ) : null}
        </View>
      </View>
    ) : (
      <View style={[styles.rowOpen, (s.pressed || s.hovered) && styles.openPressed]}>
        <InitialsAvatar name={name} size={36} tone={avatarToneOf(o)} />
        <View style={styles.rowMiddle}>
          <Text style={styles.cardName} numberOfLines={1}>
            {name}
          </Text>
          <MiniChip label={status} tone={miniToneOf(o)} dot={searching} surface="canvas" />
        </View>
        <View style={styles.rowEnd}>
          {timeNode}
          {amount ? (
            <Text style={styles.amountMuted} numberOfLines={1}>
              {amount}
            </Text>
          ) : null}
        </View>
      </View>
    );
  const opening = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cardLabel(o, name, now)}
      onPress={onPress}
      style={[layout === 'duo' ? null : styles.flex, POINTER]}
      testID={`delivery-${o.id}`}
    >
      {opener}
    </Pressable>
  );
  if (layout === 'duo') {
    return (
      <View style={styles.duo} testID={`delivery-${o.id}-card`}>
        {opening}
      </View>
    );
  }
  return (
    <View style={styles.row} testID={`delivery-${o.id}-card`}>
      {opening}
      <View style={styles.rowContacts}>
        <ContactDisc kind="whatsapp" phone={o.recipientPhone ?? null} name={name} text={whatsappText} />
        <ContactDisc kind="call" phone={o.recipientPhone ?? null} name={name} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 40, paddingLeft: 14, paddingRight: 16, borderRadius: 20, backgroundColor: palette.card, maxWidth: '100%' },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.cobalt, boxShadow: `0 0 0 4px ${alpha(palette.cobalt, 0.16)}` },
  pillText: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: palette.ink, flexShrink: 0, ...tabular },
  pillSep: { width: 1, height: 16, backgroundColor: palette.line },
  pillSub: { fontWeight: '600', color: palette.inkMuted, flexShrink: 1 },
  kpis: { flexDirection: 'row', gap: 8 },
  kpi: { height: 56, borderRadius: 18, backgroundColor: palette.canvas, paddingHorizontal: 12, justifyContent: 'center', minWidth: 76 },
  kpiDense: { height: 50, borderRadius: 16 },
  kpiSun: { flex: 1, backgroundColor: palette.sun },
  kpiValue: { fontSize: 19, lineHeight: 23, fontWeight: '800', letterSpacing: -0.6, color: palette.ink, ...tabular },
  kpiValueSmall: { fontSize: 16, lineHeight: 21 },
  kpiUnit: { fontSize: 12, fontWeight: '800', letterSpacing: 0 },
  kpiLabel: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: palette.inkMuted },
  kpiLabelSun: { color: palette.onSun2 },
  // Planche : 120 px (14 + 44 + 10 + 24 + 10 + 6 + 14 ≈ 122).
  hero: { borderRadius: 24, backgroundColor: palette.cobalt, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 14, overflow: 'hidden' },
  heroPressed: { opacity: 0.94 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44 },
  heroEta: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1, minWidth: 0 },
  heroClock: { fontWeight: '800', color: palette.onCobalt, marginLeft: -1, flexShrink: 0, ...tabular },
  heroEtaText: { flexShrink: 1, minWidth: 0 },
  heroEtaLabel: { fontSize: 12, lineHeight: 15, fontWeight: '600', color: palette.onCobalt2 },
  heroIn: { fontSize: 15, lineHeight: 19, fontWeight: '800', color: palette.onCobalt, letterSpacing: -0.2, ...tabular },
  heroWord: { fontSize: 22, lineHeight: 27, fontWeight: '800', color: palette.onCobalt, letterSpacing: -0.5 },
  heroCash: { marginLeft: 'auto', alignItems: 'flex-end', gap: 3, flexShrink: 0 },
  heroCashLabel: { fontSize: 11, lineHeight: 14, fontWeight: '600', color: palette.onCobalt2 },
  heroWho: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 24, marginTop: 10 },
  heroName: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '700', color: palette.onCobalt },
  heroArea: { fontSize: 12, fontWeight: '500', color: palette.onCobalt2 },
  heroDriver: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0, maxWidth: '40%' },
  heroDriverText: { fontSize: 12.5, lineHeight: 17, fontWeight: '600', color: palette.onCobalt2 },
  heroSteps: { marginTop: 10 },
  // Planche : 88 px (12 + 32 + 10 + 22 + 12).
  duo: { flex: 1, minWidth: 0, borderRadius: 22, backgroundColor: palette.canvas, padding: 12 },
  duoOpen: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 20, backgroundColor: palette.canvas, paddingVertical: 10, paddingLeft: 12, paddingRight: 10 },
  rowOpen: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  openPressed: { opacity: 0.8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardHeadText: { flex: 1, minWidth: 0, gap: 1 },
  cardName: { fontSize: 13.5, lineHeight: 18, fontWeight: '700', color: palette.ink },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusDotSun: { backgroundColor: palette.sun },
  statusDotCobalt: { backgroundColor: palette.cobalt },
  statusText: { flexShrink: 1, fontSize: 11.5, lineHeight: 15, fontWeight: '600', color: palette.inkMuted },
  statusTextSearch: { color: palette.cobaltText, fontWeight: '700' },
  duoBottom: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, height: 22 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
  time: { fontSize: 18, lineHeight: 22, fontWeight: '800', letterSpacing: -0.5, color: palette.ink, ...tabular },
  timeWait: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0, color: palette.inkMuted },
  amount: { flexShrink: 1, fontSize: 12, lineHeight: 16, fontWeight: '700', color: palette.ink, ...tabular },
  amountMuted: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: palette.inkMuted, ...tabular },
  rowContacts: { flexDirection: 'row', gap: 6 },
  // La puce d'état ne déborde jamais sur l'heure et le montant (elle se raccourcit, eux gardent leur place).
  rowMiddle: { flex: 1, minWidth: 0, gap: 4, alignItems: 'flex-start' },
  rowEnd: { alignItems: 'flex-end', gap: 2, flexShrink: 0 },
  disc: { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center' },
  discOff: { opacity: 0.45 },
  discPressed: { opacity: 0.85 },
});
