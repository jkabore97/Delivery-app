import type { OrderStatus } from '@yaar/shared';
import { stageOf, type DeliveryStage } from './liveScene';

export type StepState = 'done' | 'current' | 'todo';

export interface TrackingStep {
  key: 'confirmed' | 'toPickup' | 'toDropoff' | 'delivered';
  label: string;
  state: StepState;
}

/** Point de vue : destinataire (page publique) ou entreprise expéditrice. */
export type Perspective = 'recipient' | 'business';

/** Libellés courts, sur une ligne même sur un petit téléphone (le détail est dans le titre de la feuille). */
const LABELS: Record<Perspective, [string, string, string, string]> = {
  recipient: ['Confirmée', 'Retrait', 'En route', 'Livrée'],
  business: ['Demandée', 'Retrait', 'En route', 'Livrée'],
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
        title: 'Recherche d’un livreur…',
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
        ? { title: 'Colis livré : merci !', subtitle: `Merci d’avoir reçu votre colis de ${sender} avec Yaar Livraison.` }
        : { title: `Livrée à ${recipient}`, subtitle: null };
    case 'cancelled':
      return {
        title: 'Livraison annulée',
        subtitle: perspective === 'recipient' ? `Contactez ${sender} pour plus d’informations.` : null,
      };
  }
}
