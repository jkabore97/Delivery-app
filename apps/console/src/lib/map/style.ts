/**
 * Apparence des cartes MapLibre de la console, alignée sur l'application mobile (apps/mobile/src/lib/map/style.ts) :
 * style vectoriel gratuit OpenFreeMap « positron » (sans clé), remplaçable par VITE_MAP_STYLE_URL. Si le style ne
 * répond pas (hôte bloqué, réseau lent : rien après STYLE_TIMEOUT_MS), la carte passe au style de secours embarqué
 * ci-dessous : fond clair sans tuiles, mais marqueurs et itinéraires restent affichés.
 */
export const DEFAULT_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

/** Lu au build par Vite (VITE_MAP_STYLE_URL, cf. .env.example). */
export const MAP_STYLE_URL: string =
  (import.meta.env.VITE_MAP_STYLE_URL as string | undefined)?.trim() || DEFAULT_MAP_STYLE_URL;

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
  route: '#0B7A4B',
  casing: '#FFFFFF',
  shadow: 'rgba(15, 46, 34, 0.22)',
  dashed: '#0B7A4B',
  /** Trajet retrait → destinataire pas encore commencé (pointillés discrets). */
  next: '#6B8F7E',
  /** Fond du style de secours et des cartes en cours de chargement. */
  background: '#EEF1EC',
  business: '#F28C1B',
  dropoff: '#0B7A4B',
  driverFree: '#0B7A4B',
  driverBusy: '#2563EB',
  searching: '#DC2626',
  sos: '#DC2626',
  driverInk: '#16202A',
} as const;

/** Style MapLibre minimal embarqué (aucune requête réseau), le même que celui de l'application mobile. */
export const FALLBACK_STYLE = {
  version: 8 as const,
  name: 'Yaar (secours)',
  sources: {},
  layers: [{ id: 'background', type: 'background' as const, paint: { 'background-color': MAP_COLORS.background } }],
};
