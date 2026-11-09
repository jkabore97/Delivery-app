import { StyleSheet, View } from 'react-native';
import { LABELS, type OrderDto } from '@yaar/shared';
import { Text } from '../Text';
import { CallRoundButton } from '../design/ContactButtons';
import { Icon } from '../design/Icon';
import { AmountBox, InfoRow } from '../tracking/TrackingParts';
import { amountsToCollect, collectDetail, feePaymentText, goodsAmountText } from '../../lib/delivery';
import { formatDateTime, formatFcfa, formatTime } from '../../lib/format';
import { formatPhone } from '../../lib/phone';
import { recipientCallName } from '../../lib/share';
import { palette, spacing, tabular } from '../../theme';

/*
 * Blocs du suivi d'une livraison par l'entreprise, communs au téléphone (feuille sur la carte) et à l'ordinateur
 * (colonne à droite de la carte) : destinataire, montants, livraison terminée, horaires. testID gardés (tests et
 * parcours e2e) : recipient-card, recipient-amount, business-amount, pickup-amount, delivery-fee.
 */

/** Destinataire : « Colis pour », nom, téléphone et bouton Appeler, adresse et repère, colis, instructions. */
export function RecipientBlock({ order: o, terminal, onCard = false }: { order: OrderDto; terminal: boolean; onCard?: boolean }) {
  const recipient = recipientCallName(o.recipientName, o.recipientIsBusiness) || 'le destinataire';
  return (
    <View style={[styles.block, onCard && styles.blockOnCard]} testID="recipient-card">
      <View style={styles.recipientTop}>
        <View style={styles.flex}>
          <Text style={styles.kicker}>Colis pour</Text>
          <Text style={styles.recipientName}>
            {o.recipientName ?? 'Destinataire'}
            {o.recipientIsBusiness ? <Text style={styles.recipientTag}> · entreprise</Text> : null}
          </Text>
          {o.recipientPhone ? <Text style={styles.phone}>{formatPhone(o.recipientPhone)}</Text> : null}
        </View>
        {o.recipientPhone && !terminal ? (
          <CallRoundButton phone={o.recipientPhone} label={`Appeler ${recipient}`} size="small" showLabel={false} testID="call-recipient" />
        ) : null}
      </View>
      {o.dropoff ? <InfoRow icon="pin" title={o.dropoff.address} subtitle={o.dropoff.landmark ? `Repère : ${o.dropoff.landmark}` : null} /> : null}
      {o.parcelDescription ? <InfoRow icon="package" title={o.parcelDescription} /> : null}
      {o.notes ? <Text style={styles.notes}>« {o.notes} »</Text> : null}
    </View>
  );
}

/**
 * Montants vrais à chaque étape : ce que paie le destinataire (soleil : espèces), la marchandise qui revient à
 * l'entreprise (mint), les frais à payer au retrait (soleil), la ligne des frais (barrée si annulée).
 */
export function AmountsBlock({ order: o }: { order: OrderDto }) {
  const amounts = amountsToCollect(o);
  const cancelled = o.status === 'CANCELLED';
  const goods = goodsAmountText(o.status);
  const feeText = feePaymentText(o.status, amounts.feePaidBy);
  return (
    <View style={styles.amounts} testID="amounts">
      {amounts.atDropoff > 0 && !cancelled ? (
        <AmountBox
          label={o.status === 'DELIVERED' ? 'Encaissé auprès du destinataire' : 'Le destinataire paie à la livraison'}
          amount={amounts.atDropoff}
          detail={collectDetail(amounts)}
          testID="recipient-amount"
        />
      ) : null}
      {amounts.goods > 0 && !cancelled ? <AmountBox label={goods.label} amount={amounts.goods} detail={goods.detail} tone="green" testID="business-amount" /> : null}
      {amounts.atPickup > 0 && (o.status === 'SEARCHING_DRIVER' || o.status === 'ASSIGNED') ? (
        <AmountBox label="À payer au livreur au retrait" amount={amounts.atPickup} detail="Frais de livraison, en espèces." testID="pickup-amount" />
      ) : null}
      <View style={styles.feeRow} testID="delivery-fee">
        <View style={styles.flex}>
          <Text style={styles.feeLabel}>Frais de livraison · {LABELS.vehicleType[o.vehicleType].toLowerCase()}</Text>
          {feeText ? <Text style={styles.feePayer}>{feeText}</Text> : null}
        </View>
        {/* Annulée : montant barré, rien n'est facturé. */}
        <Text style={[styles.feeValue, cancelled && styles.feeValueCancelled]}>{formatFcfa(o.deliveryFee)}</Text>
      </View>
    </View>
  );
}

/** Livrée : bandeau de réussite (mint) avec la date. */
export function DeliveredNote({ order: o }: { order: OrderDto }) {
  if (o.status !== 'DELIVERED' || !o.deliveredAt) return null;
  return (
    <View style={styles.delivered}>
      <Icon name="check" size={18} color={palette.mintText} strokeWidth={2.8} />
      <Text style={styles.deliveredText}>Livrée le {formatDateTime(o.deliveredAt)}.</Text>
    </View>
  );
}

/** Horaires de la livraison : « Demandée à 11:41 · livreur à 11:44 · récupérée à 11:58 ». */
export function TimesLine({ order: o }: { order: OrderDto }) {
  return (
    <Text style={styles.meta}>
      Demandée à {formatTime(o.createdAt)}
      {o.assignedAt ? ` · livreur à ${formatTime(o.assignedAt)}` : ''}
      {o.pickedUpAt ? ` · récupérée à ${formatTime(o.pickedUpAt)}` : ''}
    </Text>
  );
}

/** Motif d'une annulation (corail). */
export function CancelReason({ order: o }: { order: OrderDto }) {
  if (o.status !== 'CANCELLED' || !o.cancelReason) return null;
  return (
    <View style={styles.cancelled}>
      <Icon name="close" size={16} color={palette.coralText} strokeWidth={2.6} />
      <Text style={styles.cancelledText}>Motif : {o.cancelReason}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  block: { gap: spacing.md, padding: spacing.lg, borderRadius: 20, backgroundColor: palette.raised },
  blockOnCard: { backgroundColor: palette.raised },
  recipientTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  kicker: { fontSize: 13, lineHeight: 17, fontWeight: '600', color: palette.inkMuted },
  recipientName: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: palette.ink, letterSpacing: -0.2 },
  recipientTag: { fontSize: 14, fontWeight: '600', color: palette.inkMuted },
  phone: { color: palette.inkMuted, fontSize: 14, lineHeight: 19, fontWeight: '600', ...tabular },
  notes: { color: palette.inkMuted, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  amounts: { gap: spacing.sm },
  feeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 4 },
  feeLabel: { color: palette.ink, fontSize: 14, lineHeight: 19, fontWeight: '700' },
  feeValue: { color: palette.ink, fontSize: 16, lineHeight: 21, fontWeight: '800', ...tabular },
  feeValueCancelled: { color: palette.inkMuted, textDecorationLine: 'line-through' },
  feePayer: { color: palette.inkMuted, fontSize: 12.5, lineHeight: 17, fontWeight: '600' },
  delivered: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: palette.mintTint, borderRadius: 16, paddingVertical: 12, paddingHorizontal: spacing.lg },
  deliveredText: { color: palette.mintText, fontWeight: '700', fontSize: 14, lineHeight: 19 },
  cancelled: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: palette.coralTint, borderRadius: 16, paddingVertical: 12, paddingHorizontal: spacing.lg },
  cancelledText: { flex: 1, color: palette.coralText, fontWeight: '700', fontSize: 14, lineHeight: 19 },
  meta: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: palette.inkMuted, textAlign: 'center', ...tabular },
});
