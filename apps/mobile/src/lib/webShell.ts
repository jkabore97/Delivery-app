import { Platform } from 'react-native';

/**
 * « Coquille » de la version web : écran de démarrage écrit dans le HTML (public/index.html, visible dès les
 * premiers octets, avant le JavaScript), retiré par l'application dès qu'un écran est affiché ; pages affichées
 * sur toute la largeur de la fenêtre.
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

/** Pages affichées sur toute la largeur de la fenêtre (le reste de l'application garde un format téléphone). */
export function isFullWidthPath(pathname: string | null | undefined): boolean {
  return !!pathname && pathname.startsWith('/suivi/');
}

/**
 * Connexion très lente ou économie de données (2G, « 3G lente » annoncée comme 2G, `saveData`) : même règle que
 * l'écran de démarrage du HTML (public/index.html), qui n'y précharge ni MapLibre ni les polices pour /suivi/.
 */
export function isSlowConnection(nav: { connection?: { saveData?: boolean; effectiveType?: string } } | null = typeof navigator !== 'undefined' ? (navigator as never) : null): boolean {
  const conn = nav?.connection;
  return !!conn && (conn.saveData === true || /(^|-)2g$/.test(conn.effectiveType ?? ''));
}
