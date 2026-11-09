import { StyleSheet, Text } from 'react-native';
import { LABELS, type OrderDto, type OrderStatus } from '@yaar/shared';
import { PackageCard } from '../design/PackageCard';
import type { ChipTone } from '../design/Pill';
import { avatarInitials } from '../map/markerArt';
import { amountsToCollect, businessStatusLabel, FEE_PAYER_LABELS } from '../../lib/delivery';
import { formatDateTime, formatFcfa, formatOrderNumber, timeAgo } from '../../lib/format';
import { arrivalSummary } from '../../lib/liveScene';
import { recipientWhatsappText } from '../../lib/share';
import { dark } from '../../theme';

/** Puce d'état d'une livraison de l'entreprise (couleurs des puces du système de design ; livrée en vert). */
export function deliveryChip(status: OrderStatus): { label: string; tone: ChipTone } {
  const b = businessStatusLabel(status);
  const tone: ChipTone = b.tone === 'orange' ? 'amber' : b.tone === 'grey' ? (status === 'DELIVERED' ? 'green' : 'grey') : b.tone;
  return { label: b.label, tone };
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

/**
 * Livraison en cours (accueil de l'entreprise) : destinataire à ses initiales, adresse, état, heure d'arrivée,
 * livreur ; boutons ronds WhatsApp (message prérempli avec le lien de suivi) et Appeler pour le destinataire ;
 * toucher la carte ouvre le suivi de la livraison.
 */
export function ActiveDeliveryCard({
  order: o,
  businessName,
  now,
  onPress,
}: {
  order: OrderDto;
  businessName: string | null;
  now: number;
  onPress: () => void;
}) {
  const driver = o.driver;
  return (
    <PackageCard
      kicker={formatOrderNumber(o.number)}
      status={deliveryChip(o.status)}
      name={o.recipientName ?? 'Destinataire'}
      initials={avatarInitials(o.recipientName)}
      address={o.dropoff?.address ?? null}
      description={deliveryEtaText(o, now)}
      descriptionIcon="clock"
      meta={
        driver
          ? `Livreur : ${driver.name ?? 'Livreur'} · ${LABELS.vehicleType[driver.vehicleType]}${driver.plate ? ` ${driver.plate}` : ''}`
          : null
      }
      phone={o.recipientPhone ?? null}
      whatsappText={recipientWhatsappText({
        url: o.trackingUrl,
        recipientName: o.recipientName,
        recipientIsBusiness: o.recipientIsBusiness,
        businessName,
        orderNumber: o.number,
      })}
      onPress={onPress}
      testID={`delivery-${o.id}`}
    />
  );
}

/**
 * Livraison terminée (historique) : état, destinataire, colis, montant encaissé auprès du destinataire (le même que
 * le détail : marchandise + frais s'il les a payés), date et frais, motif d'une annulation.
 */
export function HistoryDeliveryCard({ order: o, onPress }: { order: OrderDto; onPress: () => void }) {
  const when = o.deliveredAt ?? o.cancelledAt ?? o.createdAt;
  const collected = o.status === 'DELIVERED' ? amountsToCollect(o).atDropoff : 0;
  const payer = o.feePaidBy ? FEE_PAYER_LABELS[o.feePaidBy].title.toLowerCase() : null;
  return (
    <PackageCard
      kicker={formatOrderNumber(o.number)}
      status={deliveryChip(o.status)}
      name={o.recipientName ?? 'Destinataire'}
      initials={avatarInitials(o.recipientName)}
      description={o.parcelDescription}
      amount={collected > 0 ? { label: 'Encaissé auprès du destinataire', value: collected, testID: `history-collected-${o.id}` } : null}
      meta={`${formatDateTime(when)} · livraison ${formatFcfa(o.deliveryFee)}${payer ? ` payée par ${payer}` : ''}`}
      footer={
        o.status === 'CANCELLED' && o.cancelReason ? (
          <Text style={styles.reason} numberOfLines={2}>
            Motif : {o.cancelReason}
          </Text>
        ) : null
      }
      onPress={onPress}
      testID={`history-${o.id}`}
    />
  );
}

const styles = StyleSheet.create({
  reason: { color: dark.red, fontSize: 13, fontWeight: '700' },
});
