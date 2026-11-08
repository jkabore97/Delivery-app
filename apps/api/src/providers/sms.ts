/**
 * Envoi des codes de connexion (OTP). Le canal réel n'est pas encore choisi : WhatsApp est prévu
 * (voir `WhatsAppOtpProvider`, non implémenté). Le nom historique `SmsProvider` est conservé.
 */
export interface SmsProvider {
  /** Canal annoncé aux applications (GET /config → otpChannel). */
  readonly channel?: 'sms' | 'whatsapp' | 'console';
  send(phone: string, message: string): Promise<void>;
}

/** Alias explicite : un fournisseur d'envoi de codes OTP, quel que soit le canal. */
export type OtpProvider = SmsProvider;

/** Le canal d'envoi n'est pas configuré : la demande de code est refusée (HTTP 503). */
export class OtpProviderNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OtpProviderNotConfiguredError';
  }
}

/** Développement / démonstration : écrit le message dans les logs au lieu de l'envoyer. */
export class ConsoleSmsProvider implements SmsProvider {
  readonly channel = 'console' as const;
  constructor(private readonly log: (msg: string) => void = (m) => console.info(m)) {}
  async send(phone: string, message: string): Promise<void> {
    this.log(`[SMS -> ${phone}] ${message}`);
  }
}

/** Tests : conserve les messages envoyés. */
export class MemorySmsProvider implements SmsProvider {
  readonly channel = 'console' as const;
  readonly sent: Array<{ phone: string; message: string }> = [];
  async send(phone: string, message: string): Promise<void> {
    this.sent.push({ phone, message });
  }
  lastCodeFor(phone: string): string | null {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      const m = this.sent[i]!;
      if (m.phone === phone) return /(\d{6})/.exec(m.message)?.[1] ?? null;
    }
    return null;
  }
}
