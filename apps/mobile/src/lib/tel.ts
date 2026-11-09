/** Lien d'appel (bouton « Appeler ») ; sans dépendance aux schémas (utilisé par la page publique de suivi). */
export function telUrl(phone: string): string {
  return `tel:${phone.replace(/\s/g, '')}`;
}
