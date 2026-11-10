import { Platform } from 'react-native';
import type { TrackingDto } from '@yaar/shared';
import { publicApi } from './publicApi';

/**
 * « Coquille » de la version web : écran de démarrage écrit dans le HTML (public/index.html, visible dès les
 * premiers octets, avant le JavaScript), retiré par l'application dès qu'un écran est affiché ; pages affichées
 * sur toute la largeur de la fenêtre (page publique de suivi, espace entreprise sur ordinateur) ; requête de la page
 * publique de suivi lancée dès le démarrage.
 */

/** Identifiant de l'écran de démarrage dans public/index.html. */
export const WEB_SPLASH_ID = 'yaar-splash';

/** Retire (en fondu) l'écran de démarrage du HTML. Sans effet sur Android / iOS ou s'il n'existe plus. */
export function hideWebSplash(doc: Document | null = typeof document !== 'undefined' ? document : null): void {
  if (Platform.OS !== 'web' || !doc) return;
  const el = doc.getElementById(WEB_SPLASH_ID);
  if (!el || el.dataset.hiding === '1') return;
  el.dataset.hiding = '1';
  el.style.opacity = '0';
  el.style.pointerEvents = 'none';
  setTimeout(() => el.remove(), 250);
}

/**
 * Page publique de suivi : toute la largeur de la fenêtre (carte à gauche et feuille à droite sur ordinateur). Décide
 * aussi de la politique des polices de cette page (mise en page racine) : ne sert qu'à elle.
 */
export function isFullWidthPath(pathname: string | null | undefined): boolean {
  return !!pathname && pathname.startsWith('/suivi/');
}

/** Largeur de fenêtre à partir de laquelle l'espace entreprise s'affiche en version ordinateur (barre latérale). */
export const WIDE_APP_MIN_WIDTH = 1024;

/**
 * Espace entreprise sur ordinateur (fenêtre de `WIDE_APP_MIN_WIDTH` px au moins, adresses /business…) : la mise en page
 * racine lui donne toute la fenêtre au lieu de la colonne « téléphone » de 440 px. En dessous, ou ailleurs dans
 * l'application, la colonne reste.
 */
export function isWideAppPath(pathname: string | null | undefined, width: number): boolean {
  if (!pathname || !(width >= WIDE_APP_MIN_WIDTH)) return false;
  return pathname === '/business' || pathname.startsWith('/business/');
}

/**
 * Connexion très lente ou économie de données (2G, « 3G lente » annoncée comme 2G, `saveData`) : même règle que
 * l'écran de démarrage du HTML (public/index.html), qui n'y précharge ni MapLibre ni les polices pour /suivi/.
 */
export function isSlowConnection(nav: { connection?: { saveData?: boolean; effectiveType?: string } } | null = typeof navigator !== 'undefined' ? (navigator as never) : null): boolean {
  const conn = nav?.connection;
  return !!conn && (conn.saveData === true || /(^|-)2g$/.test(conn.effectiveType ?? ''));
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Page publique de suivi : GET /track/<jeton> dès le démarrage                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Jeton d'une adresse de la page publique de suivi (« /suivi/<jeton> »), sinon null. */
export function trackingTokenFromPath(pathname: string | null | undefined): string | null {
  const m = /^\/suivi\/([^/?#]+)/.exec(pathname ?? '');
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/** Au-delà, la réponse lancée au démarrage n'est plus reprise (données trop anciennes). */
const PREFETCH_MAX_AGE_MS = 15_000;

let prefetched: { token: string; promise: Promise<TrackingDto>; at: number } | null = null;

/**
 * Page publique de suivi (ouverte depuis un SMS, souvent en 3G) : lance GET /track/<jeton> dès que le JavaScript de
 * l'application s'exécute, avant l'attente des polices et le premier rendu de l'écran (≈ 0,3 s plus tôt, plus l'aller-
 * retour réseau qui se fait pendant ce temps). L'écran de suivi reprend cette requête (`takePrefetchedTracking`) au
 * lieu d'en lancer une seconde. Ailleurs : rien.
 */
export function prefetchPublicTracking(
  pathname: string | null | undefined,
  fetcher: (token: string) => Promise<TrackingDto> = publicApi.trackDelivery,
  now: number = Date.now(),
): boolean {
  const token = trackingTokenFromPath(pathname);
  if (!token) return false;
  const promise = fetcher(token);
  // Erreur traitée par l'écran qui la reprend ; jamais signalée comme « non traitée » sinon.
  promise.catch(() => undefined);
  prefetched = { token, promise, at: now };
  return true;
}

/** Requête lancée au démarrage pour ce jeton, reprise UNE fois (récente seulement), sinon null. */
export function takePrefetchedTracking(token: string, now: number = Date.now()): Promise<TrackingDto> | null {
  const p = prefetched;
  if (!p || p.token !== token) return null;
  prefetched = null;
  return now - p.at <= PREFETCH_MAX_AGE_MS ? p.promise : null;
}

// Démarrage de l'application web : ce module est chargé par la mise en page racine, avant tout rendu.
if (Platform.OS === 'web' && typeof location !== 'undefined') prefetchPublicTracking(location.pathname);
