import { Linking, Pressable, StyleSheet, View } from 'react-native';
import type { BusinessSummaryDto, OrderDto } from '@yaar/shared';
import { Text } from '../../Text';
import { Icon } from '../../design/Icon';
import { formatFcfa } from '../../../lib/format';
import { recipientWhatsappText } from '../../../lib/share';
import { telUrl, whatsappUrl } from '../../../lib/tel';
import { touchTarget } from '../../../lib/touchTarget';
import { palette, shadows, tabular } from '../../../theme';
import { deliveryTimeline, dropoffArea, formatAmount, heroCash, liveEta, liveStatusText, shortName, type LiveEta } from '../dashboardData';
import { deliveryEtaText, deliverySummaryLabel } from '../DeliveryCards';
import { avatarToneOf, InitialsAvatar, MiniChip, miniToneOf, POINTER, SegmentedProgress, SunPill, type WebPressState } from '../parts';

/* ------------------------------------------------------------------------------------------------------------------ */
/* Pastille de la carte                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Pastille blanche posée sur la carte : « ● 3 en cours | 1 en recherche », toujours sur une ligne. */
export function MapSummaryPill({ total, searching, style }: { total: number; searching: number; style?: object }) {
  return (
    <View style={[styles.pill, shadows.float, style]} accessibilityRole="summary" testID="map-summary">
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
 * Chiffres du jour (spec : « 3 en cours », « 14 livrées », et la pastille soleil « 87 500 FCFA à reverser ») : remplis
 * canvas dans la feuille blanche, chiffres 800 tabulaires. Résumé pas encore lu : « … » à la place des nombres.
 */
export function KpiChips({ active, summary, dense = false }: { active: number; summary: BusinessSummaryDto | null; dense?: boolean }) {
  const goods = summary ? formatAmount(summary.today.goodsCollected) : null;
  const big = (goods?.length ?? 0) > 7;
  return (
    <View style={styles.kpis} testID="kpi-chips">
      <View style={[styles.kpi, dense && styles.kpiDense]} accessible accessibilityLabel={`${active} livraison${active > 1 ? 's' : ''} en cours`}>
        <Text style={styles.kpiValue}>{active}</Text>
        <Text style={styles.kpiLabel}>en cours</Text>
      </View>
      <View style={[styles.kpi, dense && styles.kpiDense]} accessible accessibilityLabel={summary ? `${summary.today.delivered} livrée${summary.today.delivered > 1 ? 's' : ''} aujourd’hui` : 'Livrées aujourd’hui : chargement'}>
        <Text style={styles.kpiValue}>{summary ? summary.today.delivered : '…'}</Text>
        <Text style={styles.kpiLabel} numberOfLines={1}>
          {summary && summary.today.delivered === 1 ? 'livrée' : 'livrées'}
        </Text>
      </View>
      <View
        style={[styles.kpi, styles.kpiSun, dense && styles.kpiDense]}
        accessible
        accessibilityLabel={goods ? `${goods} FCFA à reverser, encaissés pour vous aujourd’hui` : 'À reverser : chargement'}
        testID="kpi-goods"
      >
        <Text style={[styles.kpiValue, big && styles.kpiValueSmall]} numberOfLines={1}>
          {goods ?? '…'}
          {goods ? <Text style={styles.kpiUnit}> FCFA</Text> : null}
        </Text>
        <Text style={[styles.kpiLabel, styles.kpiLabelSun]}>à reverser</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Tuile héros (téléphone)                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Libellé au-dessus de l'heure : « Arrivée » (colis en route), « Livreur au retrait » (il vient le chercher), « Demandée · recherche d’un livreur ». */
function heroStatus(o: OrderDto, eta: LiveEta): string {
  if (o.status === 'PICKED_UP') return eta.clock ? 'Arrivée' : 'En livraison';
  if (o.status === 'ASSIGNED') return eta.clock ? 'Livreur au retrait' : 'Livreur en route';
  return 'Demandée · recherche d’un livreur';
}

/**
 * La livraison dont le colis arrive le premier : tuile cobalt pleine (la seule de l'écran). Heure d'arrivée géante
 * (800 tabulaire), « Arrivée » et « dans 7 min », pilule soleil du montant à encaisser, destinataire et quartier,
 * livreur, progression en pilules. Toute la tuile ouvre le suivi (aucun autre bouton dedans).
 */
export function HeroDeliveryCard({ order: o, now, onPress, compact = false }: { order: OrderDto; now: number; onPress: () => void; compact?: boolean }) {
  const eta = liveEta(o, now);
  const cash = heroCash(o);
  const area = dropoffArea(o);
  const driver = o.driver ? shortName(o.driver.name) : null;
  const name = o.recipientName ?? 'Destinataire';
  // Sans heure (arrivée imminente, livreur sur place, position inconnue) : l'état lui-même en grand.
  const big = eta.clock ?? eta.label;
  const clockSize = compact ? 56 : 64;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={deliverySummaryLabel(name, o.status, deliveryEtaText(o, now))}
      accessibilityHint="Ouvre le suivi de la livraison"
      onPress={onPress}
      testID={`delivery-${o.id}`}
      style={POINTER}
    >
      {(s: WebPressState) => (
        <View style={[styles.hero, shadows.hero, (s.pressed || s.hovered) && styles.heroPressed]} testID="hero-delivery">
          <View style={styles.heroTop}>
            <Text style={styles.heroEtaLabel} numberOfLines={1}>
              {heroStatus(o, eta)}
            </Text>
            {cash.amount > 0 ? <SunPill text={formatFcfa(cash.amount)} size="sm" testID="hero-cash" /> : null}
          </View>
          <View style={styles.heroEta}>
            <Text
              style={[styles.heroClock, { fontSize: eta.clock ? clockSize : 30, lineHeight: eta.clock ? clockSize : 38, letterSpacing: eta.clock ? -Math.round(clockSize * 0.04 * 10) / 10 : -0.8 }]}
              numberOfLines={1}
            >
              {big}
            </Text>
            {eta.clock && eta.inText ? (
              <Text style={styles.heroIn} numberOfLines={1}>
                {eta.inText}
              </Text>
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
    ? `${kind === 'call' ? `Appeler ${name}` : `Écrire à ${name} sur WhatsApp`} : numéro indisponible`
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
    >
      {(s: WebPressState) => (
        <View style={[styles.disc, shadows.float, !phone && styles.discOff, (s.pressed || s.hovered) && styles.discPressed]}>
          <Icon name={kind === 'call' ? 'phone' : 'chat'} size={17} color={palette.cobalt} strokeWidth={2.3} />
        </View>
      )}
    </Pressable>
  );
}

/**
 * Livraison en cours (autre que celle de la tuile héros) : carte remplie (canvas dans la feuille blanche), pastille aux
 * initiales, nom, puce d'état, heure et montant ; boutons WhatsApp et Appeler du destinataire À CÔTÉ de la partie qui
 * ouvre le suivi (jamais un bouton dans un bouton). `layout` : `duo` (deux côte à côte) ou `row` (liste).
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
  const time = eta.kind === 'request' ? (eta.inText ?? '') : (eta.kind === 'pickup' ? eta.deliveryClock : eta.clock) ?? '—';
  const approx = eta.kind !== 'request';
  const whatsappText = recipientWhatsappText({
    url: o.trackingUrl,
    recipientName: o.recipientName,
    recipientIsBusiness: o.recipientIsBusiness,
    businessName,
    orderNumber: o.number,
  });
  const contacts = (
    <View style={layout === 'duo' ? styles.duoContacts : styles.rowContacts}>
      <ContactDisc kind="whatsapp" phone={o.recipientPhone ?? null} name={name} text={whatsappText} />
      <ContactDisc kind="call" phone={o.recipientPhone ?? null} name={name} />
    </View>
  );
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
              <View style={[styles.statusDot, o.status === 'ASSIGNED' ? styles.statusDotSun : o.status === 'PICKED_UP' ? styles.statusDotCobalt : styles.statusDotGrey]} />
              <Text style={[styles.statusText, o.status === 'SEARCHING_DRIVER' || o.status === 'PENDING' ? styles.statusTextSearch : null]} numberOfLines={1}>
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
          <MiniChip label={status} tone={miniToneOf(o)} dot={o.status === 'SEARCHING_DRIVER' || o.status === 'PENDING'} />
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
  return (
    <View style={[layout === 'duo' ? styles.duo : styles.row]} testID={`delivery-${o.id}-card`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={deliverySummaryLabel(name, o.status, deliveryEtaText(o, now))}
        onPress={onPress}
        style={[layout === 'duo' ? null : styles.flex, POINTER]}
        testID={`delivery-${o.id}`}
      >
        {opener}
      </Pressable>
      {contacts}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 40, paddingLeft: 14, paddingRight: 16, borderRadius: 20, backgroundColor: palette.card, maxWidth: '100%' },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.cobalt, boxShadow: '0 0 0 4px rgba(36, 72, 255, 0.16)' },
  pillText: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: palette.ink, flexShrink: 0, ...tabular },
  pillSep: { width: 1, height: 16, backgroundColor: palette.line },
  pillSub: { fontWeight: '600', color: palette.inkMuted, flexShrink: 1 },
  kpis: { flexDirection: 'row', gap: 8 },
  kpi: { height: 56, borderRadius: 18, backgroundColor: palette.canvas, paddingHorizontal: 12, justifyContent: 'center', minWidth: 84 },
  kpiDense: { height: 50, borderRadius: 16 },
  kpiSun: { flex: 1, backgroundColor: palette.sun },
  kpiValue: { fontSize: 19, lineHeight: 23, fontWeight: '800', letterSpacing: -0.6, color: palette.ink, ...tabular },
  kpiValueSmall: { fontSize: 16, lineHeight: 21 },
  kpiUnit: { fontSize: 12, fontWeight: '800', letterSpacing: 0 },
  kpiLabel: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: palette.inkMuted },
  kpiLabelSun: { color: palette.onSun2 },
  hero: { borderRadius: 24, backgroundColor: palette.cobalt, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16, gap: 6, overflow: 'hidden' },
  heroPressed: { opacity: 0.94 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 26 },
  heroEta: { flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: -2 },
  heroClock: { fontWeight: '800', color: palette.onCobalt, marginLeft: -2, ...tabular },
  heroEtaLabel: { flexShrink: 1, fontSize: 13, lineHeight: 17, fontWeight: '600', color: palette.onCobalt2 },
  heroIn: { fontSize: 17, lineHeight: 22, fontWeight: '800', color: palette.onCobalt, letterSpacing: -0.2, ...tabular },
  heroWho: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 },
  heroName: { flex: 1, fontSize: 13.5, lineHeight: 18, fontWeight: '700', color: palette.onCobalt },
  heroArea: { fontSize: 12.5, fontWeight: '500', color: palette.onCobalt2 },
  heroDriver: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0, maxWidth: '40%' },
  heroDriverText: { fontSize: 12.5, lineHeight: 17, fontWeight: '600', color: palette.onCobalt2 },
  heroSteps: { marginTop: 6 },
  duo: { flex: 1, minWidth: 0, borderRadius: 22, backgroundColor: palette.canvas, padding: 12, gap: 10 },
  duoOpen: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 20, backgroundColor: palette.canvas, paddingVertical: 10, paddingLeft: 12, paddingRight: 10 },
  rowOpen: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  openPressed: { opacity: 0.8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardHeadText: { flex: 1, minWidth: 0, gap: 1 },
  cardName: { fontSize: 13.5, lineHeight: 18, fontWeight: '700', color: palette.ink },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusDotSun: { backgroundColor: '#E9A91B' },
  statusDotCobalt: { backgroundColor: palette.cobalt },
  statusDotGrey: { backgroundColor: palette.cobalt },
  statusText: { flexShrink: 1, fontSize: 11.5, lineHeight: 15, fontWeight: '600', color: palette.inkMuted },
  statusTextSearch: { color: palette.cobaltText, fontWeight: '700' },
  duoBottom: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  time: { fontSize: 18, lineHeight: 22, fontWeight: '800', letterSpacing: -0.5, color: palette.ink, ...tabular },
  timeWait: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0, color: palette.inkMuted },
  amount: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: palette.ink, ...tabular },
  amountMuted: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: palette.inkMuted, ...tabular },
  duoContacts: { flexDirection: 'row', gap: 8 },
  rowContacts: { flexDirection: 'row', gap: 6 },
  rowMiddle: { flex: 1, minWidth: 0, gap: 4, alignItems: 'flex-start' },
  rowEnd: { alignItems: 'flex-end', gap: 2 },
  disc: { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center' },
  discOff: { opacity: 0.45 },
  discPressed: { opacity: 0.85 },
});
