import { DEMO_OTP_CODE, type PublicConfigDto } from '@yaar/shared';

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
  return {
    realtime: o.realtime === 'poll' ? 'poll' : 'socket',
    pollIntervalMs: interval,
    demoMode: o.demoMode === true,
    otpChannel: channel,
  };
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
  /** Client, commande SEARCHING_DRIVER / ASSIGNED / PICKED_UP (= pollIntervalMs). */
  clientOrderLive: 0,
  clientOrderWaiting: 10_000,
  clientOrders: 30_000,
  sellerOrders: 7_000,
} as const;

/**
 * Code OTP accepté quand l'API tourne avec DEMO_MODE=true, pour les comptes client, vendeur et livreur
 * (et toute nouvelle inscription). Les comptes de console utilisent un code d'accès démo distinct.
 */
export { DEMO_OTP_CODE };

/** Comptes créés par apps/api/prisma/seed.ts (docs/API.md §12). */
export const DEMO_ACCOUNTS: ReadonlyArray<{ phone: string; label: string; role: string }> = [
  { phone: '72000001', label: 'Aminata K.', role: 'Client' },
  { phone: '71000001', label: 'Le Verdoyant', role: 'Vendeur' },
  { phone: '73000002', label: 'Karim D. (moto)', role: 'Livreur' },
  { phone: '73000003', label: 'Fatimata Z. (vélo)', role: 'Livreur' },
];
