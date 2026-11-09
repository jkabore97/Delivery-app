/** URL de l'API (REST + Socket.IO). Surcharger avec VITE_API_URL (cf. .env.example). */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

/** Rafraîchissement périodique des indicateurs (docs/API.md §8.1). */
export const DASHBOARD_REFRESH_MS = 30_000;

/** Filet de sécurité : rechargement complet de la carte en direct, même sans événement. */
export const MAP_SAFETY_REFRESH_MS = 60_000;

/**
 * Mode « poll » (API sur Vercel, sans Socket.IO) : rythme de rafraîchissement par écran
 * (docs/API.md, « Mode polling (Vercel) »). Jamais plus rapide que `pollIntervalMs` de GET /config.
 * Budget (offre Hobby de Vercel : 1 M d'appels de fonction par mois) : une console ouverte sur la carte
 * en direct, sans activité, fait ≈ 0,32 requête/s (carte 0,1 + file 0,1 + alertes 0,067 + indicateurs
 * 0,033 + entreprises à valider 0,017), les préflights CORS étant mis en cache 2 h ; puis plus rien après
 * IDLE_PAUSE_MS d'inactivité. Les cartes animent les livreurs entre deux réponses, sans requête de plus.
 */
export const POLL_MS = {
  map: 10_000,
  pendingOrders: 10_000,
  dashboard: 30_000,
  /** Compteur des entreprises à valider (pastille « Entreprises ») : rarement modifié. */
  pendingStores: 60_000,
  /** Alertes partagées (SOS de l'en-tête + panneau de la carte) : une seule requête OPEN,IN_PROGRESS. */
  incidents: 15_000,
  order: 10_000,
  orders: 15_000,
  cash: 30_000,
} as const;

/** Mode poll : sans interaction (souris, clavier, toucher, onglet) pendant ce délai, la console s'arrête d'interroger l'API. */
export const IDLE_PAUSE_MS = 15 * 60_000;

declare global {
  interface Window {
    /** Tests de bout en bout uniquement (injecté avant le chargement) : délai d'inactivité raccourci. */
    __YAAR_IDLE_PAUSE_MS__?: number;
  }
}

/** Délai d'inactivité effectif : IDLE_PAUSE_MS, sauf surcharge de test `window.__YAAR_IDLE_PAUSE_MS__`. */
export function idlePauseMs(): number {
  const override = typeof window !== 'undefined' ? window.__YAAR_IDLE_PAUSE_MS__ : undefined;
  return typeof override === 'number' && Number.isFinite(override) && override >= 1000 ? override : IDLE_PAUSE_MS;
}
