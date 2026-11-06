import type { PaymentMethod } from '@yaar/shared';
import { AppError } from '../lib/errors';

export interface PaymentContext {
  orderId: string;
  amount: number;
  clientPhone: string;
}

export interface PaymentInitResult {
  /** PENDING : paiement attendu plus tard (ex. espèces à la livraison). */
  status: 'PENDING' | 'PAID';
  reference: string | null;
}

/** Fournisseur de paiement. Le Lot 2 ajoutera l'implémentation mobile money. */
export interface PaymentProvider {
  readonly method: PaymentMethod;
  /** Vérifie que le moyen de paiement peut être utilisé (avant création de la commande). */
  assertAvailable(): void;
  initiate(ctx: PaymentContext): Promise<PaymentInitResult>;
}

/** Espèces à la livraison : rien à faire à la commande, l'encaissement est constaté à la livraison. */
export class CashPaymentProvider implements PaymentProvider {
  readonly method = 'CASH' as const;
  assertAvailable(): void {}
  async initiate(): Promise<PaymentInitResult> {
    return { status: 'PENDING', reference: null };
  }
}

/** Réservé au Lot 2 (Orange Money, Moov Money ou agrégateur agréé). */
export class MobileMoneyProvider implements PaymentProvider {
  readonly method = 'MOBILE_MONEY' as const;
  assertAvailable(): void {
    throw new AppError(400, 'PAYMENT_METHOD_UNAVAILABLE', 'Paiement mobile money non disponible (Lot 2)');
  }
  async initiate(): Promise<PaymentInitResult> {
    this.assertAvailable();
    throw new Error('unreachable');
  }
}

export class PaymentRegistry {
  private readonly providers = new Map<PaymentMethod, PaymentProvider>();
  constructor(providers: PaymentProvider[]) {
    for (const p of providers) this.providers.set(p.method, p);
  }
  get(method: PaymentMethod): PaymentProvider {
    const p = this.providers.get(method);
    if (!p) throw new AppError(400, 'PAYMENT_METHOD_UNAVAILABLE', 'Moyen de paiement non disponible');
    return p;
  }
}
