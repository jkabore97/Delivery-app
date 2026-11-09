import { Linking, Platform, Share } from 'react-native';
import { normalizePhone } from '@yaar/shared/schemas';

/**
 * Envoi du lien de suivi au destinataire (il n'a pas de compte) :
 * - Android / iOS : feuille de partage du système (WhatsApp, SMS, copier…) ;
 * - web : navigator.share s'il existe (téléphones, Chrome / Edge / Safari récents), sinon un lien WhatsApp
 *   wa.me vers le numéro du destinataire, message prérempli ; « Copier le lien » en complément.
 */

function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] ?? '';
}

/**
 * Nom à utiliser pour s'adresser au destinataire : son prénom, ou le nom COMPLET d'une entreprise destinataire
 * (« Bureau Faso Conseil », pas « Bureau »).
 */
export function recipientCallName(name: string | null | undefined, isBusiness?: boolean | null): string {
  const n = name?.trim().replace(/\s+/g, ' ') ?? '';
  return isBusiness ? n : firstName(n);
}

export interface ShareParty {
  recipientName?: string | null;
  /** Le destinataire est une entreprise : son nom complet est utilisé. */
  recipientIsBusiness?: boolean | null;
  businessName?: string | null;
}

/** Texte d'accompagnement, sans le lien (navigator.share transmet le lien à part). */
export function trackingShareText(p: ShareParty): string {
  const who = recipientCallName(p.recipientName, p.recipientIsBusiness);
  const hello = who ? `Bonjour ${who}, ` : 'Bonjour, ';
  const from = p.businessName?.trim() || 'votre expéditeur';
  return `${hello}${from} vous envoie un colis avec Yaar Livraison. Suivez votre livreur en direct (le code à lui donner s’affiche sur la page) :`;
}

/** Message complet avec le lien (WhatsApp, SMS, feuille de partage). */
export function trackingShareMessage(p: ShareParty & { url: string }): string {
  return `${trackingShareText(p)} ${p.url}`;
}

/**
 * Message WhatsApp de l'entreprise au destinataire (boutons « WhatsApp » des livraisons) : le message du lien de
 * suivi quand il existe, sinon un bonjour avec le numéro du colis.
 */
export function recipientWhatsappText(p: ShareParty & { url?: string | null; orderNumber?: number | null }): string {
  if (p.url) return trackingShareMessage({ ...p, url: p.url });
  const who = recipientCallName(p.recipientName, p.recipientIsBusiness);
  const from = p.businessName?.trim() || 'votre expéditeur';
  return `${who ? `Bonjour ${who}, ` : 'Bonjour, '}${from} vous envoie un colis${p.orderNumber ? ` (#${p.orderNumber})` : ''} avec Yaar Livraison.`;
}

/**
 * Message WhatsApp prérempli de l'entreprise à son livreur (tableau de bord) : « Bonjour Issouf, c’est Le Verdoyant
 * (Yaar Livraison), au sujet de la livraison #1003. »
 */
export function driverWhatsappText(p: { driver?: string | null; businessName?: string | null; orderNumber?: number | null }): string {
  const driver = firstName(p.driver?.trim().replace(/\s+/g, ' ') ?? '');
  const from = p.businessName?.trim();
  return `${driver ? `Bonjour ${driver}` : 'Bonjour'}, c’est ${from || 'votre client'} (Yaar Livraison)${p.orderNumber ? `, au sujet de la livraison #${p.orderNumber}` : ''}.`;
}

/** Lien WhatsApp « wa.me/<chiffres du numéro>?text=… » (sans numéro valide : choix du contact dans WhatsApp). */
export function whatsappUrl(phone: string | null | undefined, text: string): string {
  const digits = (normalizePhone(phone ?? '') ?? '').replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

interface WebShareNavigator {
  share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
  clipboard?: { writeText?: (text: string) => Promise<void> };
}

export interface ShareEnv {
  platform: string;
  nativeShare: (content: { message: string; title?: string }) => Promise<{ action: string }>;
  navigator: WebShareNavigator | null;
  openUrl: (url: string) => Promise<unknown>;
  document: Document | null;
}

export function defaultShareEnv(): ShareEnv {
  const nav = typeof navigator !== 'undefined' ? (navigator as unknown as WebShareNavigator) : null;
  return {
    platform: Platform.OS,
    nativeShare: (content) => Share.share(content),
    navigator: nav,
    openUrl: (url) => Linking.openURL(url),
    document: typeof document !== 'undefined' ? document : null,
  };
}

export type ShareOutcome = 'shared' | 'dismissed' | 'whatsapp';

export async function shareTrackingLink(
  p: ShareParty & { url: string; recipientPhone?: string | null },
  env: ShareEnv = defaultShareEnv(),
): Promise<ShareOutcome> {
  const message = trackingShareMessage(p);
  if (env.platform !== 'web') {
    const r = await env.nativeShare({ message, title: 'Suivi de livraison' });
    return r.action === Share.dismissedAction ? 'dismissed' : 'shared';
  }
  if (typeof env.navigator?.share === 'function') {
    try {
      await env.navigator.share({ title: 'Suivi de livraison · Yaar Livraison', text: trackingShareText(p), url: p.url });
      return 'shared';
    } catch (e) {
      if ((e as { name?: string } | null)?.name === 'AbortError') return 'dismissed';
      // Partage refusé par le navigateur (contexte non sécurisé, cible absente) : repli WhatsApp.
    }
  }
  await env.openUrl(whatsappUrl(p.recipientPhone, message));
  return 'whatsapp';
}

/** Copie dans le presse-papiers (web) : API Clipboard, sinon zone de texte + execCommand. */
export async function copyText(text: string, env: ShareEnv = defaultShareEnv()): Promise<boolean> {
  const writeText = env.navigator?.clipboard?.writeText;
  if (typeof writeText === 'function') {
    try {
      await writeText.call(env.navigator?.clipboard, text);
      return true;
    } catch {
      /* permission refusée : repli */
    }
  }
  const doc = env.document;
  if (!doc?.body) return false;
  const area = doc.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  doc.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = typeof doc.execCommand === 'function' && doc.execCommand('copy');
  } catch {
    ok = false;
  }
  doc.body.removeChild(area);
  return ok;
}

/** Libellé court du même bouton (carte sombre : « Envoyer par WhatsApp » / « Envoyer le lien de suivi »). */
export function shareButtonShortLabel(env: Pick<ShareEnv, 'platform' | 'navigator'> = defaultShareEnv()): string {
  return env.platform === 'web' && typeof env.navigator?.share !== 'function' ? 'Envoyer par WhatsApp' : 'Envoyer le lien de suivi';
}

/** Le web sans navigator.share ouvre WhatsApp : le bouton le dit. */
export function shareButtonLabel(env: Pick<ShareEnv, 'platform' | 'navigator'> = defaultShareEnv()): string {
  if (env.platform === 'web' && typeof env.navigator?.share !== 'function') return 'Envoyer le lien de suivi par WhatsApp';
  return 'Envoyer le lien de suivi au destinataire';
}

export type QuickShareOutcome = ShareOutcome | 'copied' | 'failed';

/**
 * Bouton rond « Partager le lien » (suivi d'une livraison) : feuille de partage du téléphone, ou navigator.share sur
 * le web ; sur un ordinateur sans partage, le lien est COPIÉ (le bouton « WhatsApp » voisin envoie déjà le message).
 */
export async function shareOrCopyTrackingLink(
  p: ShareParty & { url: string; recipientPhone?: string | null },
  env: ShareEnv = defaultShareEnv(),
): Promise<QuickShareOutcome> {
  if (env.platform === 'web' && typeof env.navigator?.share !== 'function') return (await copyText(p.url, env)) ? 'copied' : 'failed';
  return shareTrackingLink(p, env);
}

/**
 * Message affiché après un envoi du lien (null : partage annulé, rien à dire). Sans symbole : l'écran l'accompagne
 * d'un pictogramme du système de design. Échec : le lien est alors affiché (sélectionnable) sous le message.
 */
export function shareFeedback(outcome: QuickShareOutcome): string | null {
  switch (outcome) {
    case 'whatsapp':
      return 'WhatsApp ouvert avec le message prêt à envoyer.';
    case 'shared':
      return 'Lien envoyé.';
    case 'copied':
      return 'Lien copié.';
    case 'failed':
      return 'Partage impossible : copiez le lien ci-dessous.';
    default:
      return null;
  }
}

/** Durée d'affichage d'un message de réussite (« Lien copié. ») avant qu'il ne s'efface. */
export const SHARE_FEEDBACK_MS = 4000;
