import { OtpProviderNotConfiguredError, type OtpProvider } from './sms';

/**
 * Envoi des codes OTP par WhatsApp (OTP_PROVIDER=whatsapp) : EMPLACEMENT RÉSERVÉ, non implémenté.
 * Aucun service externe n'est appelé ; chaque envoi échoue avec une erreur explicite (HTTP 503
 * `OTP_PROVIDER_UNAVAILABLE` sur POST /auth/otp/request). Le fournisseur n'est pas encore choisi.
 *
 * Ce qu'il faudra pour une intégration réelle (WhatsApp Business Cloud API de Meta, ou un BSP) :
 * - un compte WhatsApp Business (Meta Business Manager vérifié) et un numéro expéditeur dédié,
 *   enregistré sur la Cloud API → son « phone number id » (WHATSAPP_PHONE_NUMBER_ID) ;
 * - un jeton d'accès permanent d'utilisateur système (WHATSAPP_ACCESS_TOKEN), à stocker comme
 *   secret (variable d'environnement chiffrée de Vercel), jamais dans le dépôt ;
 * - un modèle de message de catégorie « AUTHENTICATION » approuvé par Meta (nom + langue `fr`,
 *   WHATSAPP_TEMPLATE_NAME), avec le code en paramètre et, idéalement, un bouton « copier le code » ;
 * - l'appel : POST https://graph.facebook.com/v<version>/<phone_number_id>/messages avec
 *   `{ messaging_product: "whatsapp", to: "<E.164 sans +>", type: "template", template: { name,
 *   language: { code: "fr" }, components: [{ type: "body", parameters: [{ type: "text", text: code }] },
 *   { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] }] } }` ;
 * - la gestion des erreurs (numéro sans WhatsApp → repli SMS éventuel, quota, jeton expiré) et,
 *   si besoin, le webhook de statut de livraison ;
 * - ne jamais journaliser le code en production.
 * L'interface reçoit aujourd'hui le message texte ; une intégration par modèle aura besoin du code
 * seul : extraire le code du message ou faire évoluer l'interface (`sendCode(phone, code, ttl)`).
 */
export class WhatsAppOtpProvider implements OtpProvider {
  readonly channel = 'whatsapp' as const;

  async send(_phone: string, _message: string): Promise<void> {
    throw new OtpProviderNotConfiguredError(
      'Envoi des codes par WhatsApp non configuré : aucun fournisseur WhatsApp n’est encore branché (OTP_PROVIDER=whatsapp).',
    );
  }
}
