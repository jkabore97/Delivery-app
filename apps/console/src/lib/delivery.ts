import {
  LABELS,
  formatArrivalFr,
  formatDistanceFr,
  formatDurationFr,
  routeProgress,
  type FeePayer,
  type OrderDto,
  type OrderStatus,
  type Role,
} from '@yaar/shared';
import { legRoute, stageOf } from './map/scene';

/**
 * Livraisons d'entreprise (modèle B2B, docs/API.md « Livraisons d'entreprise ») vues par la console : une
 * entreprise (compte SELLER, boutique validée = profil d'entreprise) fait livrer un colis à un destinataire sans
 * compte. Les anciennes commandes du parcours client (repas FOOD, colis client) restent lisibles.
 */

/** Livraison demandée par une entreprise : `feePaidBy` n'est renseigné que pour elles (comme côté API). */
export function isBusinessDelivery(o: Pick<OrderDto, 'feePaidBy'>): boolean {
  return o.feePaidBy === 'SENDER' || o.feePaidBy === 'RECIPIENT';
}

export type OrderKind = 'business' | 'legacyFood' | 'legacyParcel';

export function orderKind(o: Pick<OrderDto, 'feePaidBy' | 'type'>): OrderKind {
  if (isBusinessDelivery(o)) return 'business';
  return o.type === 'FOOD' ? 'legacyFood' : 'legacyParcel';
}

export const ORDER_KIND_LABEL: Record<OrderKind, string> = {
  business: 'Livraison d’entreprise',
  legacyFood: 'Commande repas (ancien parcours)',
  legacyParcel: 'Colis client (ancien parcours)',
};

/** Qui paie les frais de livraison, et quand. */
export const FEE_PAYER_LABEL: Record<FeePayer, string> = {
  SENDER: 'Entreprise au retrait',
  RECIPIENT: 'Destinataire à la livraison',
};

export interface CashSplit {
  /** Espèces remises au livreur par l'entreprise au retrait (frais payés par l'expéditeur). */
  atPickup: number;
  /** Espèces à encaisser auprès du destinataire (marchandise + frais s'il les paie). */
  atDropoff: number;
  /** Valeur de la marchandise à encaisser, due à l'entreprise. */
  goods: number;
  fee: number;
  feePaidBy: FeePayer | null;
  business: boolean;
}

/**
 * Ce que le livreur encaisse, et où (mêmes règles que l'API et l'application mobile). Ancienne commande : le total
 * à la livraison si elle est payée en espèces.
 */
export function cashSplit(
  o: Pick<OrderDto, 'feePaidBy' | 'cashToCollect' | 'deliveryFee' | 'total' | 'itemsTotal' | 'paymentMethod'>,
): CashSplit {
  if (o.feePaidBy !== 'SENDER' && o.feePaidBy !== 'RECIPIENT') {
    const cash = o.paymentMethod === 'CASH' ? o.total : 0;
    return { atPickup: 0, atDropoff: cash, goods: o.itemsTotal, fee: o.deliveryFee, feePaidBy: null, business: false };
  }
  const goods = Math.max(0, o.cashToCollect ?? 0);
  const fee = o.deliveryFee;
  return {
    atPickup: o.feePaidBy === 'SENDER' ? fee : 0,
    atDropoff: goods + (o.feePaidBy === 'RECIPIENT' ? fee : 0),
    goods,
    fee,
    feePaidBy: o.feePaidBy,
    business: true,
  };
}

/** Espace insécable entre un nombre et son unité (« 2,9 km », « 7 min ») : jamais coupés en fin de ligne. */
export function nbsp(text: string): string {
  return text.replace(/(\d) (?=[a-zA-Zµ])/g, '$1\u00a0');
}

/** Libellé de statut : celui de `LABELS`, sauf l'étape PENDING d'une livraison d'entreprise (il n'y a pas de vendeur). */
export function statusLabel(status: OrderStatus, business: boolean): string {
  if (business && status === 'PENDING') return 'Demande reçue';
  return LABELS.orderStatus[status];
}

/** Rôle affiché : « Entreprise » pour un compte SELLER (modèle B2B). */
export function roleLabel(role: Role): string {
  return role === 'SELLER' ? 'Entreprise' : LABELS.role[role];
}

/** Estimation d'arrivée chez le destinataire : « 12 min » + heure (« 14:32 »), null hors course. */
export function etaCell(etaMinutes: number | null | undefined, nowMs: number): { duration: string; clock: string } | null {
  if (etaMinutes === null || etaMinutes === undefined || !Number.isFinite(etaMinutes)) return null;
  const arrival = formatArrivalFr(etaMinutes, nowMs);
  const clock = /vers (\d{2}:\d{2})/.exec(arrival)?.[1] ?? '';
  return { duration: etaMinutes < 1 ? 'imminente' : formatDurationFr(etaMinutes), clock };
}

/**
 * Résumé de l'étape en cours pour la fiche (au-dessus de la carte) : « Livreur en route vers le retrait »,
 * distance restante de l'itinéraire, nature du tracé et heure d'arrivée chez le destinataire.
 */
export function legSummary(o: OrderDto, nowMs: number): { stage: string; details: string[] } {
  const stage = stageOf(o.status);
  const business = isBusinessDelivery(o);
  const pickupName = o.store?.name ?? 'point de retrait';
  const stageText: Record<typeof stage, string> = {
    pending: business ? 'Demande reçue' : LABELS.orderStatus[o.status],
    searching: 'Recherche d’un livreur',
    toPickup: `Livreur en route vers le retrait (${pickupName})`,
    toDropoff: 'Colis récupéré\u00a0: en route vers le destinataire',
    delivered: 'Livrée',
    cancelled: 'Annulée',
  };
  const details: string[] = [];
  const route = legRoute(o.status, o.route);
  const loc = o.driver?.lastLocation ?? null;
  if (route) {
    const left = routeProgress(route, loc).remainingM;
    details.push(
      route.source === 'osrm'
        ? `Itinéraire routier\u00a0: ${nbsp(formatDistanceFr(left))} restants`
        : `Ligne droite (itinéraire routier indisponible)\u00a0: ${nbsp(formatDistanceFr(left))} environ`,
    );
  } else if (stage === 'toPickup' || stage === 'toDropoff') {
    details.push(loc ? 'Itinéraire en cours de calcul\u00a0: ligne droite vers la cible' : 'Position du livreur pas encore reçue');
  }
  if ((stage === 'toPickup' || stage === 'toDropoff') && o.etaMinutes !== null && o.etaMinutes !== undefined) {
    details.push(`Destinataire\u00a0: ${nbsp(formatArrivalFr(o.etaMinutes, nowMs))}`);
  }
  return { stage: stageText[stage], details };
}
