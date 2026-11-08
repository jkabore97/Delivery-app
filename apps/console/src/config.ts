/** URL de l'API (REST + Socket.IO). Surcharger avec VITE_API_URL (cf. .env.example). */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

/** Rafraîchissement périodique des indicateurs (docs/API.md §8.1). */
export const DASHBOARD_REFRESH_MS = 30_000;

/** Filet de sécurité : rechargement complet de la carte en direct, même sans événement. */
export const MAP_SAFETY_REFRESH_MS = 60_000;

/**
 * Mode « poll » (API sur Vercel, sans Socket.IO) : rythme de rafraîchissement par écran
 * (docs/API.md, « Mode polling (Vercel) »). Jamais plus rapide que `pollIntervalMs` de GET /config.
 */
export const POLL_MS = {
  map: 5_000,
  pendingOrders: 5_000,
  dashboard: 30_000,
  incidents: 12_000,
  order: 7_000,
  orders: 15_000,
  cash: 30_000,
  kyc: 30_000,
} as const;
