import type { AppConfig } from '../config';

/**
 * Messages aux destinataires des livraisons d'entreprise (sans compte Yaar) : lien de suivi et code de
 * livraison à la création, court message au retrait du colis. RECIPIENT_NOTIFIER=console (défaut : messages
 * écrits dans les logs, développement et démonstration) ou whatsapp (emplacement réservé, non implémenté).
 * Un échec d'envoi n'empêche jamais la création de la livraison (cf. DeliveryService).
 */
export interface RecipientNotifier {
  readonly channel: 'console' | 'whatsapp';
  send(phone: string, message: string): Promise<void>;
}

/** Le canal n'est pas configuré : l'envoi échoue (journalisé), la livraison continue. */
export class RecipientNotifierNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecipientNotifierNotConfiguredError';
  }
}

/** Développement / démonstration : le message (avec le lien et le code) est écrit dans les logs. */
export class ConsoleRecipientNotifier implements RecipientNotifier {
  readonly channel = 'console' as const;
  constructor(private readonly log: (msg: string) => void = (m) => console.info(m)) {}
  async send(phone: string, message: string): Promise<void> {
    this.log(`[DESTINATAIRE -> ${phone}] ${message}`);
  }
}

/**
 * WhatsApp (RECIPIENT_NOTIFIER=whatsapp) : EMPLACEMENT RÉSERVÉ, non implémenté ; aucun service n'est appelé.
 * Une intégration réelle (WhatsApp Business Cloud API ou un BSP, cf. providers/whatsapp.ts pour l'OTP) demandera
 * un modèle de message « UTILITY » approuvé par Meta (paramètres : nom de l'entreprise, lien, code, montant),
 * le consentement du destinataire recueilli par l'entreprise, et un repli SMS si le numéro n'a pas WhatsApp.
 */
export class WhatsAppRecipientNotifier implements RecipientNotifier {
  readonly channel = 'whatsapp' as const;
  async send(_phone: string, _message: string): Promise<void> {
    throw new RecipientNotifierNotConfiguredError(
      'Messages aux destinataires par WhatsApp non configurés (RECIPIENT_NOTIFIER=whatsapp) : aucun fournisseur branché.',
    );
  }
}

/** Tests : conserve les messages. */
export class MemoryRecipientNotifier implements RecipientNotifier {
  readonly channel = 'console' as const;
  readonly sent: Array<{ phone: string; message: string }> = [];
  async send(phone: string, message: string): Promise<void> {
    this.sent.push({ phone, message });
  }
}

export function createRecipientNotifier(config: AppConfig, log: (msg: string) => void): RecipientNotifier {
  return config.recipientNotifier === 'whatsapp' ? new WhatsAppRecipientNotifier() : new ConsoleRecipientNotifier(log);
}
