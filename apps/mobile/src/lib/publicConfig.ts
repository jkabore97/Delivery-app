import { DEMO_OTP_CODE, type OrderStatus, type PublicConfigDto } from '@yaar/shared';

/**
 * Configuration publique de l'API (GET /config, docs/API.md §1.8), lue au démarrage avant la connexion.
 */

/** Hors de tout <AppConfigProvider> (tests) : comportement historique, Socket.IO. */
export const SOCKET_DEFAULT_CONFIG: PublicConfigDto = {
  realtime: 'socket',
  pollIntervalMs: 4000,
  demoMode: false,
  otpChannel: 'sms',
};

/** /config injoignable : le polling REST fonctionne avec tous les serveurs, c'est le choix sûr. */
export const FALLBACK_CONFIG: PublicConfigDto = { ...SOCKET_DEFAULT_CONFIG, realtime: 'poll' };

/** Valide la réponse de /config (valeurs par défaut pour les champs absents ou invalides). */
export function parsePublicConfig(raw: unknown): PublicConfigDto {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const interval = typeof o.pollIntervalMs === 'number' && o.pollIntervalMs >= 1000 ? o.pollIntervalMs : 4000;
  const channel = o.otpChannel === 'whatsapp' || o.otpChannel === 'console' || o.otpChannel === 'sms' ? o.otpChannel : 'sms';
  const tracking =
    typeof o.trackingPollIntervalMs === 'number' && Number.isFinite(o.trackingPollIntervalMs) && o.trackingPollIntervalMs >= 1000
      ? o.trackingPollIntervalMs
      : undefined;
  return {
    realtime: o.realtime === 'poll' ? 'poll' : 'socket',
    pollIntervalMs: interval,
    demoMode: o.demoMode === true,
    otpChannel: channel,
    ...(tracking !== undefined ? { trackingPollIntervalMs: tracking } : {}),
  };
}

/** Rafraîchissement par défaut de la page publique de suivi : le livreur envoie sa position toutes les ~8 s. */
export const DEFAULT_TRACKING_POLL_MS = 8000;

/**
 * Intervalle de GET /track/:token selon l'étape : `trackingPollIntervalMs` de /config (sinon 8 s, jamais plus vite
 * que `pollIntervalMs`) pendant que le livreur est en route (et tant que l'étape n'est pas connue) ; le double
 * pendant la recherche d'un livreur (rien ne bouge sur la carte) ; 0 = plus de rafraîchissement (livrée, annulée).
 */
export function trackingPollMs(
  config: Pick<PublicConfigDto, 'pollIntervalMs' | 'trackingPollIntervalMs'> | null | undefined,
  status?: OrderStatus | null,
): number {
  const base = config?.trackingPollIntervalMs ?? Math.max(DEFAULT_TRACKING_POLL_MS, config?.pollIntervalMs ?? 0);
  if (status === 'DELIVERED' || status === 'CANCELLED') return 0;
  if (!status || status === 'ASSIGNED' || status === 'PICKED_UP') return base;
  return base * 2;
}

export async function fetchPublicConfig(
  baseUrl: string,
  fetchFn: typeof fetch = fetch,
  attempts = 3,
  retryDelayMs = 1000,
): Promise<PublicConfigDto> {
  const url = `${baseUrl.replace(/\/+$/, '')}/config`;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchFn(url, { headers: { Accept: 'application/json' } });
      if (res.ok) return parsePublicConfig(await res.json());
      if (res.status === 404) return SOCKET_DEFAULT_CONFIG; // ancienne API sans /config
    } catch {
      /* réseau : on réessaie */
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, retryDelayMs * (i + 1)));
  }
  return FALLBACK_CONFIG;
}

/** Intervalles de rafraîchissement en mode poll (docs/API.md, « Mode polling (Vercel) »). */
export const POLL_MS = {
  /**
   * Livreur en ligne, sans course : GET /driver/offers (= pollIntervalMs). Jamais suspendu pour inactivité
   * (le livreur doit recevoir les offres, 30 s pour répondre) ; seulement quand l'application est en
   * arrière-plan / l'onglet masqué (le système ne laisse pas tourner l'application de toute façon).
   */
  driverOffers: 0,
  driverProfile: 30_000,
  driverCurrentOrder: 10_000,
  /** Entreprise : suivi d'une livraison SEARCHING_DRIVER / ASSIGNED / PICKED_UP (= pollIntervalMs). */
  businessDeliveryLive: 0,
  businessDeliveryWaiting: 10_000,
  /** Entreprise : liste et carte des livraisons en cours (positions des livreurs comprises), comme docs/API.md. */
  businessDeliveries: 10_000,
} as const;

/**
 * Code OTP accepté quand l'API tourne avec DEMO_MODE=true, pour les comptes entreprise et livreur
 * (et toute nouvelle inscription). Les comptes de console utilisent un code d'accès démo distinct.
 */
export { DEMO_OTP_CODE };

/**
 * Comptes de démonstration (apps/api/prisma/seed.ts, docs/API.md §12) : entreprises (rôle SELLER) et
 * livreurs ; `signupRole` présélectionne le profil sur l'écran de connexion.
 */
export const DEMO_ACCOUNTS: ReadonlyArray<{ phone: string; label: string; role: string; signupRole: 'SELLER' | 'DRIVER' }> = [
  { phone: '71000001', label: 'Le Verdoyant (restaurant)', role: 'Entreprise', signupRole: 'SELLER' },
  { phone: '71000002', label: 'Pharmacie du Progrès', role: 'Entreprise', signupRole: 'SELLER' },
  { phone: '71000003', label: 'Faso Mode Boutique', role: 'Entreprise', signupRole: 'SELLER' },
  { phone: '73000002', label: 'Karim D. (moto)', role: 'Livreur', signupRole: 'DRIVER' },
  { phone: '73000003', label: 'Fatimata Z. (vélo)', role: 'Livreur', signupRole: 'DRIVER' },
];
