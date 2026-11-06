import { normalizePhone } from '@yaar/shared';

export { normalizePhone };

/** Affichage lisible : +22670123456 → « 70 12 34 56 ». */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  const n = normalizePhone(e164);
  if (!n) return e164;
  const local = n.slice(4);
  return local.replace(/(\d{2})(?=\d)/g, '$1 ');
}

/** Lien d'appel (bouton « Appeler »). */
export function telUrl(phone: string): string {
  return `tel:${phone.replace(/\s/g, '')}`;
}
