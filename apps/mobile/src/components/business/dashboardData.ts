import { approximateZone, arrivalClockFr, formatDurationFr, type OrderDto } from '@yaar/shared';
import { amountsToCollect } from '../../lib/delivery';
import { NNBSP, formatTime, timeAgo } from '../../lib/format';
import { buildScene, estimateArrivalMinutes, estimatePickupMinutes, orderSceneInput } from '../../lib/liveScene';

/*
 * Données des écrans de l'entreprise (accueil du téléphone, tableau de bord de l'ordinateur) : fonctions pures, sans
 * interface, testées dans src/__tests__/businessDashboard.test.ts. Heures en UTC (= heure de Ouagadougou).
 */

/** Jour UTC « 2026-11-09 » d'un instant (ms ou ISO). */
export function utcDay(t: number | string): string {
  return new Date(t).toISOString().slice(0, 10);
}

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « lundi 9 novembre » (jour UTC de `now`). */
export function frenchDate(now: number): string {
  const d = new Date(now);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Montant sans unité, milliers séparés par une espace fine insécable : « 8 200 ». */
export function formatAmount(n: number): string {
  return Math.round(Number.isFinite(n) ? n : 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
}

/** Prénom et initiale du nom : « Issouf Sawadogo » → « Issouf S. » ; un seul mot : tel quel. */
export function shortName(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${parts[parts.length - 1]!.charAt(0).toUpperCase()}.`;
}

/** Quartier du destinataire (« Gounghin ») : quartier connu le plus proche de l'épingle, sinon début de l'adresse. */
export function dropoffArea(o: Pick<OrderDto, 'dropoff'>): string | null {
  const d = o.dropoff;
  if (!d) return null;
  if (Number.isFinite(d.lat) && Number.isFinite(d.lng)) {
    const zone = approximateZone(d);
    if (zone !== 'Hors des quartiers connus') return zone.replace(/^Secteur\s+/, '');
  }
  const first = d.address.split(',')[0]?.trim();
  return first || null;
}

/** Délai demande → livraison, en minutes arrondies (livrée seulement). */
export function deliveryMinutes(o: Pick<OrderDto, 'createdAt' | 'deliveredAt'>): number | null {
  if (!o.deliveredAt) return null;
  const ms = Date.parse(o.deliveredAt) - Date.parse(o.createdAt);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 60_000)) : null;
}

/** Livraisons livrées aujourd'hui (jour UTC de `now`), la plus récente en premier. */
export function deliveredToday(list: readonly OrderDto[], now: number): OrderDto[] {
  const today = utcDay(now);
  return list
    .filter((o) => o.status === 'DELIVERED' && !!o.deliveredAt && utcDay(o.deliveredAt) === today)
    .sort((a, b) => Date.parse(b.deliveredAt!) - Date.parse(a.deliveredAt!));
}

/** Deux coins d'un carré d'environ 2 km autour de l'entreprise : cadrage de la carte quand rien n'est en cours. */
export function neighbourhood(p: { lat: number; lng: number }): { lat: number; lng: number }[] {
  const d = 0.009;
  return [
    { lat: p.lat + d, lng: p.lng - d },
    { lat: p.lat - d, lng: p.lng + d },
  ];
}

/** Livraison qui attend un livreur. */
export function isSearching(o: Pick<OrderDto, 'status'>): boolean {
  return o.status === 'SEARCHING_DRIVER' || o.status === 'PENDING';
}

/**
 * Livraison mise en avant (tuile héros) : celle choisie (`preferredId`) si elle est encore en cours, sinon la première
 * dont le colis est en route (la liste est triée : arrivée la plus proche d'abord), sinon le premier livreur en route
 * vers le retrait, sinon la première de la liste.
 */
export function focusedDelivery(list: readonly OrderDto[], preferredId?: string | null): OrderDto | null {
  if (preferredId) {
    const chosen = list.find((o) => o.id === preferredId);
    if (chosen) return chosen;
  }
  return list.find((o) => o.status === 'PICKED_UP') ?? list.find((o) => o.status === 'ASSIGNED') ?? list[0] ?? null;
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Recherche du tableau de bord : numéro de livraison (« 1052 », « #1052 », début du numéro) ou nom du destinataire
 * (sans accents ni majuscules, « ouedraogo » trouve « Ouédraogo »). Vide : tout correspond.
 */
export function matchesSearch(o: Pick<OrderDto, 'number' | 'recipientName'>, query: string): boolean {
  const q = fold(query);
  if (!q) return true;
  const digits = q.replace(/^(#|n°|no\.?)\s*/, '');
  if (/^\d+$/.test(digits)) return String(o.number).startsWith(digits);
  return fold(o.recipientName ?? '').includes(q);
}

/**
 * Heure mise en avant d'une livraison en cours :
 * - colis en route : arrivée chez le destinataire (« Arrivée » 12:09, « dans 7 min ») ;
 * - livreur en route vers l'entreprise : son arrivée au retrait (« Au retrait » 11:58, « dans 3 min »), l'heure de
 *   livraison en second (`deliveryClock`) ;
 * - recherche d'un livreur : heure de la demande (« Demandée » 11:41, « il y a 2 min »).
 * `clock` null : pas d'estimation (position du livreur inconnue) ou arrivée imminente (`label` le dit).
 */
export interface LiveEta {
  kind: 'dropoff' | 'pickup' | 'request';
  label: string;
  clock: string | null;
  /** « dans 7 min », « il y a 2 min » ; null sans estimation. */
  inText: string | null;
  /** Minutes avant l'arrivée de l'étape (null : inconnu ; demande : null). */
  minutes: number | null;
  /** Retrait : heure de livraison prévue chez le destinataire. */
  deliveryClock: string | null;
}

export function liveEta(o: OrderDto, now: number): LiveEta {
  if (o.status === 'PICKED_UP' || o.status === 'ASSIGNED') {
    const input = orderSceneInput(o);
    const scene = buildScene(input);
    const delivery = estimateArrivalMinutes(scene, input, o.etaMinutes);
    if (o.status === 'ASSIGNED') {
      const pickup = estimatePickupMinutes(scene, input);
      const deliveryClock = delivery === null ? null : arrivalClockFr(Math.round(Math.max(pickup ?? 0, delivery)), now);
      if (pickup === null) return { kind: 'pickup', label: 'Livreur en route', clock: null, inText: null, minutes: null, deliveryClock };
      if (pickup < 1) return { kind: 'pickup', label: 'Livreur sur place', clock: null, inText: null, minutes: 0, deliveryClock };
      return { kind: 'pickup', label: 'Au retrait', clock: arrivalClockFr(Math.round(pickup), now), inText: `dans ${formatDurationFr(pickup)}`, minutes: pickup, deliveryClock };
    }
    if (delivery === null) return { kind: 'dropoff', label: 'Arrivée', clock: null, inText: null, minutes: null, deliveryClock: null };
    if (delivery < 1) return { kind: 'dropoff', label: 'Arrivée imminente', clock: null, inText: null, minutes: 0, deliveryClock: null };
    return { kind: 'dropoff', label: 'Arrivée', clock: arrivalClockFr(Math.round(delivery), now), inText: `dans ${formatDurationFr(delivery)}`, minutes: delivery, deliveryClock: null };
  }
  return { kind: 'request', label: 'Demandée', clock: formatTime(o.createdAt), inText: timeAgo(o.createdAt, now), minutes: null, deliveryClock: null };
}

/** Puce courte d'une ligne de livraison en cours (liste du tableau de bord, cartes compactes du téléphone). */
export function liveStatusText(o: OrderDto, eta: LiveEta): string {
  if (o.status === 'PICKED_UP') return 'En livraison';
  if (o.status === 'ASSIGNED') {
    if (eta.minutes === 0) return 'Livreur sur place';
    return eta.minutes !== null ? `Retrait dans ${formatDurationFr(eta.minutes)}` : 'Livreur en route';
  }
  return 'Recherche d’un livreur';
}

/** Une étape de la progression en 4 pilules, avec son heure (« 11:41 », « maintenant », « ≈ 12:09 »). */
export interface TimelineStep {
  key: 'requested' | 'pickedUp' | 'onTheWay' | 'delivered';
  label: string;
  state: 'done' | 'current' | 'todo';
  /** Heure ou repère sous le libellé ; null : rien à dire. */
  time: string | null;
  /** Heure estimée (pictogramme « ≈ » devant). */
  approx: boolean;
}

/**
 * Progression vue par l'entreprise : Demandée → Récupérée → En route → Livrée, chaque étape avec son heure réelle
 * (demande, retrait, livraison), « maintenant » pour l'étape en cours, et l'heure estimée de la suivante. Annulée :
 * liste vide (l'écran dit « Livraison annulée »).
 */
export function deliveryTimeline(o: OrderDto, now: number, eta: LiveEta = liveEta(o, now)): TimelineStep[] {
  if (o.status === 'CANCELLED') return [];
  const delivered = o.status === 'DELIVERED';
  const picked = delivered || o.status === 'PICKED_UP';
  const assigned = picked || o.status === 'ASSIGNED';
  const at = (iso: string | null | undefined) => (iso ? formatTime(iso) : null);
  const arrival = eta.kind === 'dropoff' ? eta.clock : eta.deliveryClock;
  return [
    { key: 'requested', label: 'Demandée', state: assigned ? 'done' : 'current', time: at(o.createdAt), approx: false },
    {
      key: 'pickedUp',
      label: 'Récupérée',
      state: picked ? 'done' : assigned ? 'current' : 'todo',
      time: picked ? at(o.pickedUpAt) : assigned && eta.kind === 'pickup' ? (eta.clock ?? (eta.minutes === 0 ? 'sur place' : null)) : null,
      approx: !picked && assigned && !!eta.clock,
    },
    {
      key: 'onTheWay',
      label: 'En route',
      state: delivered ? 'done' : picked ? 'current' : 'todo',
      time: delivered ? null : picked ? 'maintenant' : null,
      approx: false,
    },
    {
      key: 'delivered',
      label: 'Livrée',
      state: delivered ? 'done' : 'todo',
      time: delivered ? at(o.deliveredAt) : assigned ? arrival : null,
      approx: !delivered && assigned && !!arrival,
    },
  ];
}

/** Montant mis en avant d'une livraison (pilule soleil) et son détail. */
export interface HeroCash {
  /** « À encaisser », « Encaissé », « Rien à encaisser ». */
  label: string;
  /** Espèces auprès du destinataire (0 : pas de pilule soleil). */
  amount: number;
  /** « marchandise 8 200 + frais 1 600 » ; null sans détail. */
  detail: string | null;
  /** « payés par le destinataire », « frais payés par l’entreprise au retrait »… */
  payer: string | null;
}

export function heroCash(o: OrderDto): HeroCash {
  const a = amountsToCollect(o);
  const done = o.status === 'DELIVERED';
  if (a.atDropoff > 0) {
    const parts: string[] = [];
    // Espaces insécables : une coupure de ligne ne tombe qu'avant « + ».
    if (a.goods > 0) parts.push(`marchandise\u00A0${formatAmount(a.goods)}`);
    if (a.feePaidBy === 'RECIPIENT') parts.push(`frais\u00A0${formatAmount(a.fee)}`);
    const who = o.recipientIsBusiness ? 'l’entreprise destinataire' : 'le destinataire';
    return {
      label: done ? 'Encaissé' : 'À encaisser',
      amount: a.atDropoff,
      detail: parts.length > 1 ? parts.join(' +\u00A0') : (parts[0] ?? null),
      payer: `${done ? 'payés' : 'à payer'} par ${who}`,
    };
  }
  return {
    label: 'Rien à encaisser',
    amount: 0,
    detail: null,
    payer: a.feePaidBy === 'SENDER' ? `frais ${formatAmount(a.fee)} payés par l’entreprise au retrait` : null,
  };
}
