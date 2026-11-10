import type { OrderStatus } from '@yaar/shared';
import { stageOf, type DeliveryStage } from './liveScene';

export type StepState = 'done' | 'current' | 'todo';

export interface TrackingStep {
  key: 'confirmed' | 'toPickup' | 'toDropoff' | 'delivered';
  label: string;
  state: StepState;
}

/**
 * Nom unique de l'état « recherche d'un livreur » : titre du suivi (« Recherche d’un livreur… »), puce des cartes de
 * l'entreprise (« RECHERCHE D’UN LIVREUR »), pastille de sa carte d'ensemble (« 1 recherche d’un livreur »).
 */
export const SEARCHING_LABEL = 'Recherche d’un livreur';

/** Point de vue : destinataire (page publique) ou entreprise expéditrice. */
export type Perspective = 'recipient' | 'business';

/**
 * Libellés courts, sur une ligne même sur un petit téléphone (le détail est dans le titre de la feuille). Entreprise :
 * ceux de la spec Cobalt, « Demandée · Récupérée · En route · Livrée » ; destinataire : sa commande est « Confirmée »,
 * puis le livreur passe au « Retrait ».
 */
const LABELS: Record<Perspective, [string, string, string, string]> = {
  recipient: ['Confirmée', 'Retrait', 'En route', 'Livrée'],
  business: ['Demandée', 'Récupérée', 'En route', 'Livrée'],
};

const KEYS: TrackingStep['key'][] = ['confirmed', 'toPickup', 'toDropoff', 'delivered'];

/**
 * Index de l'étape en cours (0 à 3), 4 = tout est fait, -1 = annulée. Recherche d'un livreur : seule la première
 * étape est en cours (aucun livreur n'est encore en route vers le retrait).
 */
function currentIndex(stage: DeliveryStage): number {
  switch (stage) {
    case 'pending':
    case 'searching':
      return 0;
    case 'toPickup':
      return 1;
    case 'toDropoff':
      return 2;
    case 'delivered':
      return 4;
    case 'cancelled':
      return -1;
  }
}

/** Les 4 étapes : Confirmée (recherche d'un livreur) → Retrait → En route → Livrée. */
export function trackingSteps(status: OrderStatus, perspective: Perspective = 'recipient'): TrackingStep[] {
  const idx = currentIndex(stageOf(status));
  return KEYS.map((key, i) => ({
    key,
    label: LABELS[perspective][i]!,
    state: idx === -1 ? (i === 0 ? 'done' : 'todo') : i < idx ? 'done' : i === idx ? 'current' : 'todo',
  }));
}

export interface Headline {
  title: string;
  subtitle: string | null;
}

/** Titre principal de la feuille de suivi. */
export function trackingHeadline(
  status: OrderStatus,
  perspective: Perspective,
  names: { sender?: string | null; recipient?: string | null; driver?: string | null } = {},
): Headline {
  const sender = names.sender?.trim() || 'l’expéditeur';
  const recipient = names.recipient?.trim() || 'le destinataire';
  const driver = names.driver?.trim() || 'Le livreur';
  switch (stageOf(status)) {
    case 'pending':
    case 'searching':
      return {
        title: `${SEARCHING_LABEL}…`,
        subtitle: perspective === 'recipient' ? `${sender} a confirmé votre commande.` : 'Un livreur proche va accepter la course.',
      };
    case 'toPickup':
      return perspective === 'recipient'
        ? { title: 'Le livreur récupère votre colis', subtitle: `${driver} est en route vers ${sender}.` }
        : { title: 'Le livreur arrive pour le retrait', subtitle: `${driver} vient chercher le colis.` };
    case 'toDropoff':
      return perspective === 'recipient'
        ? { title: 'Votre colis est en route', subtitle: `${driver} arrive chez vous.` }
        : { title: `En route vers ${recipient}`, subtitle: 'Colis récupéré.' };
    case 'delivered':
      return perspective === 'recipient'
        ? { title: 'Colis livré : merci !', subtitle: `Merci d’avoir reçu votre colis de ${sender} avec Yaar Livraison.` }
        : { title: `Livrée à ${recipient}`, subtitle: null };
    case 'cancelled':
      return {
        title: 'Livraison annulée',
        subtitle: perspective === 'recipient' ? `Contactez ${sender} pour plus d’informations.` : null,
      };
  }
}

/**
 * Message WhatsApp prérempli du destinataire à son livreur (page publique) : « Bonjour Issouf, je suis le
 * destinataire du colis #1052 de Pharmacie du Centre (Yaar Livraison). »
 */
export function recipientToDriverText(p: { driver?: string | null; sender?: string | null; number: number }): string {
  const driver = p.driver?.trim();
  const sender = p.sender?.trim();
  return `${driver ? `Bonjour ${driver}` : 'Bonjour'}, je suis le destinataire du colis #${p.number}${sender ? ` de ${sender}` : ''} (Yaar Livraison).`;
}
