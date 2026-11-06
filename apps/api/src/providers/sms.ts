/** Envoi de SMS (codes OTP). L'implémentation réelle (opérateur ou agrégateur local) viendra en production. */
export interface SmsProvider {
  send(phone: string, message: string): Promise<void>;
}

/** Développement : écrit le SMS dans les logs au lieu de l'envoyer. */
export class ConsoleSmsProvider implements SmsProvider {
  constructor(private readonly log: (msg: string) => void = (m) => console.info(m)) {}
  async send(phone: string, message: string): Promise<void> {
    this.log(`[SMS -> ${phone}] ${message}`);
  }
}

/** Tests : conserve les messages envoyés. */
export class MemorySmsProvider implements SmsProvider {
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
