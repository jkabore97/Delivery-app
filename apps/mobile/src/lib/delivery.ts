import {
  AVERAGE_SPEED_KMH,
  distanceM,
  formatDistanceFr,
  formatDurationFr,
  minutesFromSeconds,
  OrderStatus,
  roadDistanceKm,
  routeProgress,
  type AddressDto,
  type CreateDeliveryInput,
  type FeePayer,
  type LatLng,
  type OfferDto,
  type OrderDto,
  type QuoteResponse,
  type StoreDto,
  type VehicleType,
} from '@yaar/shared';
import { createDeliverySchema, normalizePhone } from '@yaar/shared/schemas';
import { isPinAtDefault, toAddressInput } from './address';
import { formatFcfa } from './format';
import { arrivalMinutesOf } from './liveScene';
import { SEARCHING_LABEL } from './trackingSteps';

/* ------------------------------------------------------------------ */
/* Statuts                                                             */
/* ------------------------------------------------------------------ */

/** Livraisons en cours de l'entreprise (onglet « Livraisons »). */
export const BUSINESS_ACTIVE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.SEARCHING_DRIVER,
  OrderStatus.ASSIGNED,
  OrderStatus.PICKED_UP,
];

/** Historique de l'entreprise. */
export const BUSINESS_HISTORY_STATUSES: OrderStatus[] = [OrderStatus.DELIVERED, OrderStatus.CANCELLED];

/** L'entreprise peut annuler tant que le colis n'est pas récupéré. */
export const BUSINESS_CANCELLABLE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.SEARCHING_DRIVER,
  OrderStatus.ASSIGNED,
];

export function canBusinessCancel(status: OrderStatus): boolean {
  return BUSINESS_CANCELLABLE_STATUSES.includes(status);
}

const ACTIVE_RANK: Partial<Record<OrderStatus, number>> = { PICKED_UP: 0, ASSIGNED: 1, PENDING: 2, SEARCHING_DRIVER: 2 };

/**
 * Livraisons en cours (accueil de l'entreprise) : d'abord celles dont le colis est en route, par heure d'arrivée
 * chez le destinataire (la plus proche en haut), puis celles dont le livreur va au retrait (même ordre), puis celles
 * qui attendent un livreur, regroupées à la fin (la plus récente en premier). Heure d'arrivée : la même estimation
 * que la ligne de la carte (`arrivalMinutesOf`) ; inconnue : après les autres de son groupe.
 */
export function sortActiveDeliveries(list: OrderDto[]): OrderDto[] {
  const eta = new Map(list.map((o) => [o.id, (ACTIVE_RANK[o.status] ?? 9) < 2 ? arrivalMinutesOf(o) : null]));
  return [...list].sort((a, b) => {
    const ra = ACTIVE_RANK[a.status] ?? 9;
    const rb = ACTIVE_RANK[b.status] ?? 9;
    if (ra !== rb) return ra - rb;
    const ea = eta.get(a.id) ?? Infinity;
    const eb = eta.get(b.id) ?? Infinity;
    if (ea !== eb) return ea - eb;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}

/** Pastille de la carte d'ensemble : « 1 recherche d’un livreur », « 3 recherches d’un livreur » (même nom que la puce). */
export function searchingCountText(n: number): string {
  const label = `${SEARCHING_LABEL.charAt(0).toLowerCase()}${SEARCHING_LABEL.slice(1)}`;
  return `${n} ${n > 1 ? label.replace(/^recherche/, 'recherches') : label}`;
}

/**
 * Libellés de statut côté entreprise, en minuscules (Cobalt écrit les états comme des phrases : « En livraison »).
 * `tone` : couleur Cobalt de la puce d'état (spec : recherche gris à point cobalt, livreur vers le retrait soleil, en
 * livraison cobaltTint, livrée mint, annulée corail).
 */
export function businessStatusLabel(status: OrderStatus): { label: string; tone: 'grey' | 'amber' | 'blue' | 'green' | 'red' } {
  switch (status) {
    case 'PENDING':
    case 'ACCEPTED':
    case 'READY':
    case 'SEARCHING_DRIVER':
      return { label: SEARCHING_LABEL, tone: 'grey' };
    case 'ASSIGNED':
      return { label: 'Livreur en route', tone: 'amber' };
    case 'PICKED_UP':
      return { label: 'En livraison', tone: 'blue' };
    case 'DELIVERED':
      return { label: 'Livrée', tone: 'green' };
    case 'CANCELLED':
      return { label: 'Annulée', tone: 'red' };
  }
}

/* ------------------------------------------------------------------ */
/* Montants                                                            */
/* ------------------------------------------------------------------ */

export const FEE_PAYER_LABELS: Record<FeePayer, { title: string; detail: string }> = {
  SENDER: { title: 'L’entreprise', detail: 'au retrait du colis' },
  RECIPIENT: { title: 'Le destinataire', detail: 'à la livraison' },
};

/** Étapes avant le retrait du colis : les frais payés par l'entreprise ne le sont pas encore. */
const BEFORE_PICKUP: readonly OrderStatus[] = ['PENDING', 'ACCEPTED', 'READY', 'SEARCHING_DRIVER', 'ASSIGNED'];

/**
 * Qui paie les frais de livraison, au bon temps selon l'étape (suivi d'une livraison par l'entreprise) : « À payer
 * par l’entreprise au retrait du colis » avant le retrait, « Payés par l’entreprise au retrait du colis » ensuite ;
 * « À payer par le destinataire à la livraison » jusqu'à la livraison, « Payés … » une fois livrée. Annulée :
 * « Aucuns frais à payer » (rien n'est facturé ; des frais déjà payés au retrait sont rendus avec le colis ; le titre
 * de l'écran dit déjà « Livraison annulée »). null : payeur inconnu (ancienne commande d'un client).
 */
export function feePaymentText(status: OrderStatus, feePaidBy: FeePayer | null | undefined): string | null {
  if (status === 'CANCELLED') return 'Aucuns frais à payer';
  if (feePaidBy !== 'SENDER' && feePaidBy !== 'RECIPIENT') return null;
  const paid = feePaidBy === 'SENDER' ? !BEFORE_PICKUP.includes(status) : status === 'DELIVERED';
  const who = FEE_PAYER_LABELS[feePaidBy];
  return `${paid ? 'Payés' : 'À payer'} par ${who.title.toLowerCase()} ${who.detail}`;
}

/**
 * Frais d'une livraison terminée (ligne discrète de l'historique, après la date) : « livraison 1 500 FCFA payée par le
 * destinataire » ; annulée : « Annulée · aucuns frais » (aucun payeur : rien n'a été payé).
 */
export function historyFeeText(o: Pick<OrderDto, 'status' | 'deliveryFee' | 'feePaidBy'>): string {
  if (o.status === 'CANCELLED') return 'Annulée · aucuns frais';
  const payer = o.feePaidBy ? FEE_PAYER_LABELS[o.feePaidBy].title.toLowerCase() : null;
  return `livraison ${formatFcfa(o.deliveryFee)}${payer ? ` payée par ${payer}` : ''}`;
}

/**
 * Valeur de la marchandise vue par l'entreprise : « Pour votre entreprise » tant que le livreur ne l'a pas encaissée,
 * « À reverser à votre entreprise » une fois livrée (le reversement par Yaar n'est pas suivi dans l'application :
 * jamais « reversé »).
 */
export function goodsAmountText(status: OrderStatus): { label: string; detail: string } {
  return status === 'DELIVERED'
    ? { label: 'À reverser à votre entreprise', detail: 'Valeur de la marchandise, encaissée par le livreur à la livraison : Yaar vous la reverse.' }
    : { label: 'Pour votre entreprise', detail: 'Valeur de la marchandise : le livreur l’encaisse à la livraison, puis Yaar vous la reverse.' };
}

export interface CollectAmounts {
  /** Espèces à encaisser auprès de l'entreprise au retrait (frais payés par l'expéditeur). */
  atPickup: number;
  /** Espèces à encaisser auprès du destinataire (marchandise + frais s'il les paie). */
  atDropoff: number;
  /** Valeur de la marchandise à encaisser (reversée à l'entreprise). */
  goods: number;
  fee: number;
  feePaidBy: FeePayer | null;
  /** Livraison demandée par une entreprise (modèle B2B). */
  business: boolean;
}

/** Montants détaillés par l'API (offre, et course si l'API les ajoute) : utilisés tels quels quand ils sont présents. */
export interface CashSplit {
  cashAtPickup?: number | null;
  cashAtDelivery?: number | null;
}

const amount = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

/**
 * Ce que le livreur encaisse et où. Priorité aux montants de l'API (`cashAtPickup` / `cashAtDelivery`) ; à défaut,
 * calcul local. Livraison d'entreprise : marchandise (`cashToCollect`) + frais si le destinataire les paie, à la
 * livraison ; frais au retrait si l'entreprise les paie. Ancienne commande client : le total, à la livraison.
 */
export function amountsToCollect(
  o: Pick<OrderDto, 'feePaidBy' | 'cashToCollect' | 'deliveryFee' | 'total' | 'itemsTotal' | 'paymentMethod'> & CashSplit,
): CollectAmounts {
  const apiPickup = amount(o.cashAtPickup);
  const apiDelivery = amount(o.cashAtDelivery);
  if (o.feePaidBy !== 'SENDER' && o.feePaidBy !== 'RECIPIENT') {
    const cash = o.paymentMethod === 'CASH' ? o.total : 0;
    return {
      atPickup: apiPickup ?? 0,
      atDropoff: apiDelivery ?? cash,
      goods: o.itemsTotal,
      fee: o.deliveryFee,
      feePaidBy: null,
      business: false,
    };
  }
  const goods = Math.max(0, o.cashToCollect ?? 0);
  const fee = o.deliveryFee;
  return {
    atPickup: apiPickup ?? (o.feePaidBy === 'SENDER' ? fee : 0),
    atDropoff: apiDelivery ?? goods + (o.feePaidBy === 'RECIPIENT' ? fee : 0),
    goods,
    fee,
    feePaidBy: o.feePaidBy,
    business: true,
  };
}

export interface OfferCash {
  /** Espèces à encaisser auprès de l'entreprise au retrait (null = inconnu : ancienne API). */
  atPickup: number | null;
  /** Espèces à encaisser auprès du destinataire (null = inconnu). */
  atDelivery: number | null;
  /** Total des espèces de la course. */
  total: number;
}

/**
 * Espèces d'une offre : détail retrait / livraison de l'API (`cashAtPickup`, `cashAtDelivery`) quand il est
 * fourni, sinon seulement le total (`cashToCollect`).
 */
export function offerCash(offer: Pick<OfferDto, 'cashToCollect'> & CashSplit): OfferCash {
  const atPickup = amount(offer.cashAtPickup);
  const atDelivery = amount(offer.cashAtDelivery);
  const total = Math.max(0, Math.round(offer.cashToCollect ?? 0));
  if (atPickup === null || atDelivery === null) return { atPickup: null, atDelivery: null, total };
  return { atPickup, atDelivery, total: atPickup + atDelivery };
}

/** Détail du montant à encaisser à la livraison : « Marchandise 15 000 FCFA + frais de livraison 1 500 FCFA, en espèces. » */
export function collectDetail(a: CollectAmounts): string | null {
  if (!a.business) return 'Total de la commande, en espèces.';
  const parts: string[] = [];
  if (a.goods > 0) parts.push(`marchandise ${formatFcfa(a.goods)}`);
  if (a.feePaidBy === 'RECIPIENT') parts.push(`frais de livraison ${formatFcfa(a.fee)}`);
  if (parts.length === 0) return null;
  const text = parts.join(' + ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}, en espèces.`;
}

/** Espèces de l'étape en cours d'une course du livreur. */
export interface StageCollect {
  /** Étape : retrait (auprès de l'entreprise) ou livraison (auprès du destinataire). */
  at: 'pickup' | 'dropoff';
  /** Libellé court (une ligne, à côté du montant). */
  label: string;
  amount: number;
  /** Détail du montant (« Marchandise 15 000 FCFA + frais de livraison 1 500 FCFA, en espèces. »). */
  detail: string | null;
}

/**
 * Espèces à encaisser à l'étape EN COURS (règle d'affichage de l'écran de course : ce montant est fixé au-dessus des
 * boutons d'action, jamais dans la partie qui défile) : au retrait, les frais payés par l'entreprise ; une fois le
 * colis récupéré, ce que paie le destinataire. null : rien à encaisser à cette étape.
 */
export function stageCollect(status: OrderStatus, a: CollectAmounts): StageCollect | null {
  if (status === OrderStatus.ASSIGNED) {
    return a.atPickup > 0
      ? { at: 'pickup', label: 'À encaisser au retrait', amount: a.atPickup, detail: 'Frais de livraison payés au retrait, en espèces.' }
      : null;
  }
  if (status === OrderStatus.PICKED_UP) {
    return a.atDropoff > 0 ? { at: 'dropoff', label: 'À encaisser', amount: a.atDropoff, detail: collectDetail(a) } : null;
  }
  return null;
}

/** Montant que paiera le destinataire pour une demande en préparation. */
export function recipientPays(fee: number | null, feePaidBy: FeePayer, cashToCollect: number): number {
  return cashToCollect + (feePaidBy === 'RECIPIENT' ? (fee ?? 0) : 0);
}

/* ------------------------------------------------------------------ */
/* Nouvelle livraison (formulaire en 3 étapes)                         */
/* ------------------------------------------------------------------ */

export interface DeliveryForm {
  dropoff: AddressDto | null;
  recipientName: string;
  recipientPhone: string;
  recipientIsBusiness: boolean;
  packageDescription: string;
  vehicleType: VehicleType | null;
  feePaidBy: FeePayer;
  /** Saisie libre (« 15 000 ») du montant à encaisser. */
  cashToCollect: string;
  notes: string;
}

export const EMPTY_DELIVERY_FORM: DeliveryForm = {
  dropoff: null,
  recipientName: '',
  recipientPhone: '',
  recipientIsBusiness: false,
  packageDescription: '',
  vehicleType: null,
  feePaidBy: 'SENDER',
  cashToCollect: '',
  notes: '',
};

/** Distance minimale entre l'entreprise et le destinataire (épingle laissée sur l'entreprise). */
export const MIN_DELIVERY_DISTANCE_M = 80;
export const MAX_CASH_TO_COLLECT = 2_000_000;

export type FormErrors = Partial<Record<'dropoff' | 'address' | 'recipientName' | 'recipientPhone' | 'packageDescription' | 'vehicleType' | 'cashToCollect', string>>;

/** « 15 000 », « 15000 F » → 15000 ; vide → 0 ; invalide → null. */
export function parseAmount(input: string): number | null {
  const s = input.replace(/[\s  .]/g, '').replace(/F(CFA)?$/i, '');
  if (s === '') return 0;
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n <= MAX_CASH_TO_COLLECT ? n : null;
}

/** Étape 1 : destination (épingle, adresse) et destinataire. */
export function validateDestination(form: DeliveryForm, pickup: LatLng | null): FormErrors {
  const e: FormErrors = {};
  const d = form.dropoff;
  if (!d || isPinAtDefault(d)) e.dropoff = 'Déplacez la carte pour placer l’épingle sur le lieu de livraison.';
  else if (pickup && distanceM(pickup, d) < MIN_DELIVERY_DISTANCE_M)
    e.dropoff = 'L’épingle est sur votre entreprise : placez-la sur le lieu de livraison.';
  if (!d || !d.address.trim()) e.address = 'Indiquez l’adresse (quartier, rue).';
  if (!form.recipientName.trim()) e.recipientName = 'Nom du destinataire requis.';
  if (!normalizePhone(form.recipientPhone)) e.recipientPhone = 'Numéro invalide : 8 chiffres (ex. 70 12 34 56).';
  return e;
}

/** Étape 2 : colis, véhicule, paiement. */
export function validatePackage(form: DeliveryForm, quote: QuoteResponse | null): FormErrors {
  const e: FormErrors = {};
  if (!form.packageDescription.trim()) e.packageDescription = 'Décrivez le colis (ex. « 2 cartons », « documents »).';
  const option = quote?.options.find((o) => o.vehicleType === form.vehicleType);
  if (!form.vehicleType || !option?.available) e.vehicleType = 'Choisissez un véhicule disponible.';
  if (parseAmount(form.cashToCollect) === null)
    e.cashToCollect = `Montant invalide (nombre entier, ${formatFcfa(MAX_CASH_TO_COLLECT)} au plus).`;
  return e;
}

export function hasErrors(e: FormErrors): boolean {
  return Object.keys(e).length > 0;
}

const FIELD_LABELS: Record<string, string> = {
  'pickup.address': 'Adresse de retrait',
  'pickup.lat': 'Adresse de retrait',
  'pickup.lng': 'Adresse de retrait',
  'dropoff.address': 'Adresse',
  'dropoff.landmark': 'Point de repère',
  'dropoff.lat': 'Épingle',
  'dropoff.lng': 'Épingle',
  recipientName: 'Nom du destinataire',
  recipientPhone: 'Téléphone du destinataire',
  packageDescription: 'Colis',
  vehicleType: 'Véhicule',
  cashToCollect: 'Montant à encaisser',
  notes: 'Instructions',
};

/**
 * Point de retrait envoyé à l'API (devis et demande) : l'établissement choisi par l'entreprise. Sans cela l'API
 * prendrait son établissement validé le plus ancien, et le prix comme le livreur ne correspondraient pas au retrait
 * affiché quand l'entreprise en a plusieurs.
 */
export function pickupFromStore(store: Pick<StoreDto, 'lat' | 'lng' | 'address' | 'landmark'> | null | undefined): AddressDto | null {
  if (!store || !Number.isFinite(store.lat) || !Number.isFinite(store.lng) || !store.address?.trim()) return null;
  return toAddressInput({ lat: store.lat, lng: store.lng, address: store.address, landmark: store.landmark ?? '' });
}

/**
 * Corps de POST /business/deliveries, validé avec le schéma partagé (mêmes règles que l'API).
 * Renvoie le message d'erreur français de la première règle non respectée.
 */
export function buildDeliveryInput(
  form: DeliveryForm,
  pickup?: AddressDto | null,
): { ok: true; input: CreateDeliveryInput } | { ok: false; error: string } {
  if (!form.dropoff || !form.vehicleType) return { ok: false, error: 'Destination et véhicule requis.' };
  const cash = parseAmount(form.cashToCollect);
  if (cash === null) return { ok: false, error: 'Montant à encaisser invalide.' };
  const input: CreateDeliveryInput = {
    ...(pickup ? { pickup } : {}),
    dropoff: toAddressInput(form.dropoff),
    recipientName: form.recipientName.trim(),
    recipientPhone: form.recipientPhone.trim(),
    recipientIsBusiness: form.recipientIsBusiness,
    packageDescription: form.packageDescription.trim(),
    vehicleType: form.vehicleType,
    feePaidBy: form.feePaidBy,
    cashToCollect: cash,
    ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
  };
  const parsed = createDeliverySchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue ? (FIELD_LABELS[issue.path.join('.')] ?? 'Demande') : 'Demande';
    return { ok: false, error: issue ? `${field} : ${issue.message}` : 'Demande invalide.' };
  }
  return { ok: true, input: { ...input, recipientPhone: parsed.data.recipientPhone } };
}

/** Véhicule par défaut : celui déjà choisi s'il reste disponible, sinon la moto, sinon le premier disponible. */
export function pickVehicle(quote: QuoteResponse, current: VehicleType | null): VehicleType | null {
  const available = quote.options.filter((o) => o.available).map((o) => o.vehicleType);
  if (current && available.includes(current)) return current;
  if (available.includes('MOTO')) return 'MOTO';
  return available[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Livreur : prochaine étape                                           */
/* ------------------------------------------------------------------ */

export interface NextStep {
  /** « Récupérer chez Pharmacie X » / « Livrer à Awa K. ». */
  title: string;
  distanceM: number | null;
  minutes: number | null;
  /** « Récupérer chez Pharmacie X · 1,2 km · 4 min ». */
  line: string;
}

/**
 * Carte « prochaine étape » du livreur : cible de l'étape (entreprise puis destinataire), distance et durée
 * restantes, d'après l'itinéraire de l'API rogné à la position du livreur, ou à défaut la distance estimée.
 */
export function nextStep(o: OrderDto, me: LatLng | null): NextStep | null {
  const toPickup = o.status === 'ASSIGNED';
  if (!toPickup && o.status !== 'PICKED_UP') return null;
  const target = toPickup ? o.pickup : o.dropoff;
  const name = toPickup
    ? (o.store?.name ?? 'l’expéditeur')
    : (o.recipientName ?? o.client?.name ?? 'le destinataire');
  const title = toPickup ? `Récupérer chez ${name}` : `Livrer à ${name}`;
  const routeOk = o.route && o.route.target === (toPickup ? 'PICKUP' : 'DROPOFF') && o.route.points.length >= 2 ? o.route : null;
  let meters: number | null = null;
  let minutes: number | null = null;
  if (routeOk) {
    const p = routeProgress(routeOk, me);
    meters = p.remainingM;
    minutes = minutesFromSeconds(p.remainingS);
  } else if (me && target) {
    const km = roadDistanceKm(me, target);
    meters = km * 1000;
    minutes = Math.max(1, Math.ceil((km / AVERAGE_SPEED_KMH[o.driver?.vehicleType ?? o.vehicleType]) * 60));
  }
  const parts = [title];
  if (meters !== null) parts.push(formatDistanceFr(meters));
  if (minutes !== null) parts.push(formatDurationFr(minutes));
  return { title, distanceM: meters, minutes, line: parts.join(' · ') };
}
