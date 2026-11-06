/** URL de l'API (REST + Socket.IO). Surcharger avec VITE_API_URL (cf. .env.example). */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

/** Rafraîchissement périodique des indicateurs (docs/API.md §8.1). */
export const DASHBOARD_REFRESH_MS = 30_000;

/** Filet de sécurité : rechargement complet de la carte en direct, même sans événement. */
export const MAP_SAFETY_REFRESH_MS = 60_000;
