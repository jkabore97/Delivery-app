import type { PrismaClient } from '@prisma/client';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Envoi de notifications push (Expo / FCM). L'implémentation de production appellera le service
 * Expo Push ou FCM ; en développement les messages sont écrits dans les logs.
 */
export interface PushProvider {
  send(tokens: string[], message: PushMessage): Promise<void>;
}

export class ConsolePushProvider implements PushProvider {
  constructor(private readonly log: (msg: string) => void = (m) => console.info(m)) {}
  async send(tokens: string[], message: PushMessage): Promise<void> {
    this.log(`[PUSH -> ${tokens.length} appareil(s)] ${message.title} : ${message.body}`);
  }
}

/** Tests : conserve les notifications envoyées. */
export class MemoryPushProvider implements PushProvider {
  readonly sent: Array<{ tokens: string[]; message: PushMessage }> = [];
  async send(tokens: string[], message: PushMessage): Promise<void> {
    this.sent.push({ tokens, message });
  }
}

/** Envoie une notification à tous les appareils enregistrés d'un utilisateur. Ne lève jamais. */
export class Notifier {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: PushProvider,
    private readonly onError: (err: unknown) => void = () => {},
  ) {}

  async toUser(userId: string, message: PushMessage): Promise<void> {
    try {
      const rows = await this.prisma.pushToken.findMany({ where: { userId }, select: { token: true } });
      if (rows.length === 0) return;
      await this.provider.send(
        rows.map((r) => r.token),
        message,
      );
    } catch (err) {
      this.onError(err);
    }
  }
}
