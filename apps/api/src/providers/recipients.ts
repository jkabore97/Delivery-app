import type { AppConfig } from '../config';

/**
 * Messages aux destinataires des livraisons d'entreprise (sans compte Yaar) : lien de suivi et code de
 * livraison à la création, court message au retrait du colis et à l'annulation. RECIPIENT_NOTIFIER=console (défaut :
 * messages écrits dans les logs ; développement et démonstration, interdit en production hors DEMO_MODE) ou whatsapp
 * (emplacement réservé, non implémenté). Un échec d'envoi n'empêche jamais la livraison (cf. DeliveryService).
 */
export interface RecipientMessage {
  /** Texte envoyé au destinataire (lien de suivi et code de livraison compris). */
  text: string;
  /** Le même message sans lien ni code : seule version écrite dans les journaux hors DEMO_MODE. */
  logText: string;
}

export interface RecipientNotifier {
  readonly channel: 'console' | 'whatsapp';
  send(phone: string, message: RecipientMessage): Promise<void>;
}

/** Le canal n'est pas configuré : l'envoi échoue (journalisé), la livraison continue. */
export class RecipientNotifierNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecipientNotifierNotConfiguredError';
  }
}

/**
 * Numéro masqué pour les journaux : indicatif et deux derniers chiffres (`+22676123456` → `+226******56`).
 * Un numéro trop court est entièrement masqué.
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return '***';
  const prefix = phone.startsWith('+') ? `+${digits.slice(0, 3)}` : digits.slice(0, 3);
  return `${prefix}${'*'.repeat(digits.length - 5)}${digits.slice(-2)}`;
}

/**
 * Développement / démonstration : le message est écrit dans les logs. Avec DEMO_MODE (données fictives), le message
 * complet et le numéro ; sinon numéro masqué et message sans lien ni code (jetons porteurs, données personnelles).
 */
export class ConsoleRecipientNotifier implements RecipientNotifier {
  readonly channel = 'console' as const;
  constructor(
    private readonly log: (msg: string) => void = (m) => console.info(m),
    private readonly opts: { demoMode: boolean } = { demoMode: false },
  ) {}
  async send(phone: string, message: RecipientMessage): Promise<void> {
    if (this.opts.demoMode) this.log(`[DESTINATAIRE -> ${phone}] ${message.text}`);
    else this.log(`[DESTINATAIRE -> ${maskPhone(phone)}] ${message.logText}`);
  }
}

/**
 * WhatsApp (RECIPIENT_NOTIFIER=whatsapp) : EMPLACEMENT RÉSERVÉ, non implémenté ; aucun service n'est appelé.
 * Une intégration réelle (WhatsApp Business Cloud API ou un BSP, cf. providers/whatsapp.ts pour l'OTP) demandera
 * un modèle de message « UTILITY » approuvé par Meta (paramètres : nom de l'entreprise, lien, code, montant),
 * le consentement du destinataire recueilli par l'entreprise, et un repli SMS si le numéro n'a pas WhatsApp.
 * Elle ne devra journaliser que `logText` et un numéro masqué (`maskPhone`).
 */
export class WhatsAppRecipientNotifier implements RecipientNotifier {
  readonly channel = 'whatsapp' as const;
  async send(_phone: string, _message: RecipientMessage): Promise<void> {
    throw new RecipientNotifierNotConfiguredError(
      'Messages aux destinataires par WhatsApp non configurés (RECIPIENT_NOTIFIER=whatsapp) : aucun fournisseur branché.',
    );
  }
}

/** Tests : conserve les messages (`message` = texte complet). */
export class MemoryRecipientNotifier implements RecipientNotifier {
  readonly channel = 'console' as const;
  readonly sent: Array<{ phone: string; message: string; logText: string }> = [];
  async send(phone: string, message: RecipientMessage): Promise<void> {
    this.sent.push({ phone, message: message.text, logText: message.logText });
  }
}

export function createRecipientNotifier(config: AppConfig, log: (msg: string) => void): RecipientNotifier {
  return config.recipientNotifier === 'whatsapp'
    ? new WhatsAppRecipientNotifier()
    : new ConsoleRecipientNotifier(log, { demoMode: config.demoMode });
}
