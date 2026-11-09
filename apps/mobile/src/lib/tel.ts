/** Lien d'appel (bouton « Appeler ») ; sans dépendance aux schémas (utilisé par la page publique de suivi). */
export function telUrl(phone: string): string {
  return `tel:${phone.replace(/\s/g, '')}`;
}

/** Indicatif du Burkina Faso, ajouté aux numéros locaux à 8 chiffres. */
const BF_COUNTRY_CODE = '226';

/**
 * Lien WhatsApp (« Écrire sur WhatsApp ») : https://wa.me/<chiffres du numéro international>, avec un message
 * prérempli facultatif. Accepte « +226 70 12 34 56 », « 0022670123456 » ou un numéro local à 8 chiffres
 * (« 70 12 34 56 » → 22670123456). Sans dépendance aux schémas (zod) : utilisable par toutes les pages.
 */
export function whatsappUrl(phone: string, text?: string | null): string {
  // Préfixe international « 00 » retiré (un numéro burkinabè local ne commence jamais par 00).
  let digits = phone.replace(/\D/g, '').replace(/^00/, '');
  if (digits.length === 8) digits = `${BF_COUNTRY_CODE}${digits}`;
  const message = text?.trim();
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}
