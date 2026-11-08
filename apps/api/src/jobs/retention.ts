import type { PrismaClient } from '@prisma/client';
import { LOCATION_RETENTION_MONTHS } from '@yaar/shared';
import type { Clock } from '../lib/clock';
import { subtractMonths } from '../lib/time';
import { ROUTE_RESET } from '../services/routes';

export interface RetentionResult {
  locationPingsDeleted: number;
  otpCodesDeleted: number;
  /** Commandes terminées dont les positions / adresses du client ont été effacées. */
  orderLocationsPurged: number;
  /** Incidents (SOS…) dont la position a été effacée. */
  incidentLocationsPurged: number;
  orderMessagesDeleted: number;
  cutoff: Date;
}

/** Texte qui remplace une adresse client purgée. */
export const PURGED_ADDRESS = 'Adresse supprimée (conservation 12 mois)';

/**
 * Purge des données à durée de conservation limitée (Annexe 3 du contrat), 12 mois :
 * - positions GPS des livreurs ;
 * - positions et adresses du client sur les commandes terminées (livrées ou annulées) : coordonnées
 *   remises à 0, adresse / repère / destinataire (nom, téléphone) / notes effacés, ainsi que l'itinéraire en
 *   cache s'il en restait un. Le retrait d'une commande repas (adresse de la boutique, donnée professionnelle)
 *   est conservé ; celui d'un colis (dont les livraisons d'entreprise) est purgé ;
 * - positions des incidents (SOS) ;
 * - messages client ↔ livreur ;
 * - codes OTP expirés depuis plus de 24 h.
 * Les montants, statuts et dates sont conservés (comptabilité).
 */
export async function runRetention(prisma: PrismaClient, clock: Clock): Promise<RetentionResult> {
  const now = clock.now();
  const cutoff = subtractMonths(now, LOCATION_RETENTION_MONTHS);
  const pings = await prisma.locationPing.deleteMany({ where: { createdAt: { lt: cutoff } } });
  const otps = await prisma.otpCode.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 24 * 3600_000) } } });

  const oldOrders = {
    createdAt: { lt: cutoff },
    status: { in: ['DELIVERED' as const, 'CANCELLED' as const] },
    locationPurgedAt: null,
  };
  const clientData = {
    dropoffLat: 0,
    dropoffLng: 0,
    dropoffAddress: PURGED_ADDRESS,
    dropoffLandmark: '',
    recipientName: null,
    recipientPhone: null,
    notes: null,
    ...ROUTE_RESET,
    locationPurgedAt: now,
  };
  const [parcels, food] = await prisma.$transaction([
    prisma.order.updateMany({
      where: { ...oldOrders, type: 'PARCEL' },
      data: { ...clientData, pickupLat: 0, pickupLng: 0, pickupAddress: PURGED_ADDRESS, pickupLandmark: '' },
    }),
    prisma.order.updateMany({ where: { ...oldOrders, type: 'FOOD' }, data: clientData }),
  ]);
  const incidents = await prisma.incident.updateMany({
    where: { createdAt: { lt: cutoff }, OR: [{ lat: { not: null } }, { lng: { not: null } }] },
    data: { lat: null, lng: null },
  });
  const messages = await prisma.orderMessage.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return {
    locationPingsDeleted: pings.count,
    otpCodesDeleted: otps.count,
    orderLocationsPurged: parcels.count + food.count,
    incidentLocationsPurged: incidents.count,
    orderMessagesDeleted: messages.count,
    cutoff,
  };
}
