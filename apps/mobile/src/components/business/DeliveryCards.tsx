import { StyleSheet } from 'react-native';
import { Text } from '../Text';
import type { OrderDto, OrderStatus } from '@yaar/shared';
import { PackageCard } from '../design/PackageCard';
import type { ChipTone } from '../design/Pill';
import { avatarInitials } from '../map/markerArt';
import { amountsToCollect, businessStatusLabel, historyFeeText } from '../../lib/delivery';
import { formatDateTime, formatFcfa, formatOrderNumber, timeAgo } from '../../lib/format';
import { arrivalSummary } from '../../lib/liveScene';
import { palette } from '../../theme';

/**
 * Puce d'état d'une livraison de l'entreprise, aux couleurs Cobalt : recherche d'un livreur (gris, point cobalt),
 * livreur en route vers le retrait (soleil), en livraison (cobaltTint), livrée (mint), annulée (corail).
 */
export function deliveryChip(status: OrderStatus): { label: string; tone: ChipTone; dot?: boolean } {
  const b = businessStatusLabel(status);
  switch (status) {
    case 'ASSIGNED':
      return { label: b.label, tone: 'amber' };
    case 'PICKED_UP':
      return { label: b.label, tone: 'blue' };
    case 'DELIVERED':
      return { label: b.label, tone: 'green' };
    case 'CANCELLED':
      return { label: b.label, tone: 'red' };
    default:
      return { label: b.label, tone: 'grey', dot: true };
  }
}

/**
 * Ligne d'arrivée d'une carte : « Arrivée vers 14:41 · dans 12 min » (colis récupéré), « Au retrait dans 4 min ·
 * livraison vers 14:45 » (livreur en route vers l'entreprise), « Demandée il y a 2 min » (recherche d'un livreur,
 * déjà dite par la puce d'état).
 */
export function deliveryEtaText(o: OrderDto, now: number): string | null {
  const arrival = arrivalSummary(o, now);
  if (arrival) return arrival;
  if (o.status === 'PENDING' || o.status === 'SEARCHING_DRIVER') return `Demandée ${timeAgo(o.createdAt, now)}`;
  return null;
}

/** Phrase lue par les lecteurs d'écran : « Awa Kaboré, en livraison, arrivée vers 14:29, dans 9 min ». */
export function deliverySummaryLabel(name: string, status: OrderStatus, line: string | null): string {
  const parts = [name, businessStatusLabel(status).label.toLowerCase()];
  if (line) parts.push(`${line.charAt(0).toLowerCase()}${line.slice(1)}`.replace(/ · /g, ', '));
  return parts.join(', ');
}

/**
 * Livraison terminée (historique) : état, destinataire, colis, montant encaissé auprès du destinataire (le même que
 * le détail : marchandise + frais s'il les a payés), date et frais (annulée : aucuns frais), motif d'une annulation.
 */
export function HistoryDeliveryCard({ order: o, onPress }: { order: OrderDto; onPress: () => void }) {
  const when = o.deliveredAt ?? o.cancelledAt ?? o.createdAt;
  const collected = o.status === 'DELIVERED' ? amountsToCollect(o).atDropoff : 0;
  const name = o.recipientName ?? 'Destinataire';
  const meta = `${formatDateTime(when)} · ${historyFeeText(o)}`;
  return (
    <PackageCard
      kicker={formatOrderNumber(o.number)}
      status={deliveryChip(o.status)}
      name={name}
      initials={avatarInitials(o.recipientName)}
      description={o.parcelDescription}
      amount={collected > 0 ? { label: 'Encaissé auprès du destinataire', value: collected, testID: `history-collected-${o.id}` } : null}
      meta={meta}
      footer={
        o.status === 'CANCELLED' && o.cancelReason ? (
          <Text style={styles.reason} numberOfLines={2}>
            Motif : {o.cancelReason}
          </Text>
        ) : null
      }
      onPress={onPress}
      accessibilityLabel={deliverySummaryLabel(name, o.status, `${formatDateTime(when)}${collected > 0 ? ` · encaissé ${formatFcfa(collected)}` : ''}`)}
      testID={`history-${o.id}`}
    />
  );
}

const styles = StyleSheet.create({
  reason: { color: palette.coralText, fontSize: 13, lineHeight: 18, fontWeight: '600' },
});
