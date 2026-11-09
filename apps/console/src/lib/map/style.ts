import { COBALT_MAP, rgba } from './palette';

/**
 * Apparence des cartes MapLibre de la console, la même que l'application mobile (apps/mobile/src/lib/map/style.ts) :
 * fond « Cobalt » (OpenFreeMap « positron » recoloré : terre #F3F5F8, eau #A9C9FF, parcs #D6EEDC, rues blanches,
 * grands axes jaunes, noms des quartiers seulement), style statique servi par la console elle-même
 * (`public/map/cobalt-style.json` → `/map/cobalt-style.json`), remplaçable par VITE_MAP_STYLE_URL. Ses tuiles, polices et
 * sprites viennent de tiles.openfreemap.org (gratuit, sans clé). Si le style ne répond pas (rien après
 * STYLE_TIMEOUT_MS) ou est refusé, la carte passe au style de secours embarqué ci-dessous : fond Cobalt uni sans
 * tuiles, mais marqueurs et itinéraires restent affichés.
 */
export const DEFAULT_MAP_STYLE_URL = '/map/cobalt-style.json';

/** Lu au build par Vite (VITE_MAP_STYLE_URL, cf. .env.example). */
export const MAP_STYLE_URL: string =
  (import.meta.env.VITE_MAP_STYLE_URL as string | undefined)?.trim() || DEFAULT_MAP_STYLE_URL;

const ABSOLUTE_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/** URL absolue d'un style (une URL relative est résolue par rapport à la page) ; sans page : inchangée. */
export function resolveMapStyleUrl(url: string, base?: string): string {
  if (!url || ABSOLUTE_URL.test(url)) return url;
  const page = base ?? (typeof location !== 'undefined' && typeof location.href === 'string' ? location.href : undefined);
  if (!page) return url;
  try {
    return new URL(url, page).href;
  } catch {
    return url;
  }
}

/** Mention des données cartographiques, toujours affichée sur la carte (VITE_MAP_ATTRIBUTION avec un autre style). */
export const MAP_ATTRIBUTION: string =
  (import.meta.env.VITE_MAP_ATTRIBUTION as string | undefined)?.trim() ||
  '© OpenFreeMap © OpenMapTiles © contributeurs OpenStreetMap';
export const MAP_ATTRIBUTION_URL = 'https://www.openstreetmap.org/copyright';

/** Délai maximal de chargement du style distant avant de passer au style de secours. */
export const STYLE_TIMEOUT_MS = 6000;
/** Densité de pixels plafonnée (écrans 3x : 2x suffit et divise le coût du rendu). */
export const MAX_PIXEL_RATIO = 2;
/** Durée du glissement d'un livreur entre deux rafraîchissements de la carte. */
export const DRIVER_ANIMATION_MS = 1500;

export const MAP_COLORS = {
  /** Itinéraire devant le livreur : cobalt 6 px sur un liseré blanc de 2 px, ombre douce, chevrons blancs. */
  route: COBALT_MAP.cobalt,
  casing: COBALT_MAP.white,
  shadow: rgba(COBALT_MAP.ink, 0.22),
  /** Lignes droites (vers la cible sans itinéraire, livraison qui attend un livreur) : cobalt en tirets. */
  dashed: COBALT_MAP.cobalt,
  /** Trajet retrait → destinataire à venir (ou effectué) : encre à 30 % en pointillés. */
  next: rgba(COBALT_MAP.ink, 0.32),
  /** Fond du style de secours et des cartes en cours de chargement (terre du fond Cobalt). */
  background: COBALT_MAP.land,
  /** Entreprise : carré encre arrondi (initiales ou boutique). */
  business: COBALT_MAP.ink,
  /** Destinataire : goutte cobalt. */
  dropoff: COBALT_MAP.cobalt,
  /** Livreur libre : disque blanc, véhicule encre atténuée, pastille menthe (disponible). */
  driverFree: COBALT_MAP.inkMuted,
  /** Livreur en livraison : disque blanc, véhicule et encoche cobalt. */
  driverBusy: COBALT_MAP.cobalt,
  driverDisc: COBALT_MAP.white,
  available: COBALT_MAP.mint,
  /** SOS : point corail, étiquette corail foncé (texte blanc 4,83:1). */
  sos: COBALT_MAP.coral,
  sosFill: COBALT_MAP.coralFill,
  label: COBALT_MAP.label,
} as const;

/** Style MapLibre minimal embarqué (aucune requête réseau) : la terre du fond Cobalt, comme l'application mobile. */
export const FALLBACK_STYLE = {
  version: 8 as const,
  name: 'Yaar Cobalt (secours)',
  sources: {},
  layers: [{ id: 'background', type: 'background' as const, paint: { 'background-color': COBALT_MAP.land } }],
};
