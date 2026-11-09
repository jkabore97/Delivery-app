/**
 * Palette « Cobalt » des cartes : fond de carte (style public/map/cobalt-style.json), tracés et marqueurs, aux
 * valeurs exactes du système de design (docs/DESIGN.md, « Cobalt »). Les cartes ont leur propre palette, ici, au lieu
 * d'importer theme.ts : elle est partagée par le web (MapLibre, marqueurs HTML), le natif (react-native-maps) et la
 * console (apps/console/src/lib/map/palette.ts, mêmes valeurs).
 */
export const COBALT_MAP = {
  /* Fond de carte (OpenFreeMap « positron » recoloré, voir cobalt-style.json) */
  land: '#F3F5F8',
  landuse: '#EEF1F5',
  water: '#A9C9FF',
  waterway: '#96BBF7',
  park: '#D6EEDC',
  building: '#E4E8EE',
  road: '#FFFFFF',
  roadCasing: '#E0E5ED',
  arterialCasing: '#D6DCE6',
  trunk: '#FFE38A',
  trunkCasing: '#F0C85A',
  /** Noms des quartiers (Noto Sans Bold, majuscules). */
  label: '#7B8597',

  /* Système de design */
  ink: '#0C1222',
  inkMuted: '#5B6475',
  cobalt: '#2448FF',
  cobaltText: '#1F3BD6',
  cobaltTint: '#E9EDFF',
  white: '#FFFFFF',
  sun: '#FFC93C',
  /** Encoche de cap d'un disque Sun (plus soutenue que le disque). */
  sunDeep: '#E0A400',
  mint: '#16C47F',
  coral: '#FF5A4E',
  coralFill: '#D92D20',
} as const;

/** `#RRGGBB` + opacité → `rgba(r, g, b, a)`. */
export function rgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  const [r, g, b] = [m[1]!, m[2]!, m[3]!].map((h) => parseInt(h, 16));
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 1000) / 1000})`;
}

/** Ombres des marqueurs (encre du système de design, jamais du noir pur). */
export const MARKER_SHADOW = {
  /** Disque du livreur, carré de l'entreprise. */
  float: `0 2px 4px ${rgba(COBALT_MAP.ink, 0.22)}, 0 6px 14px ${rgba(COBALT_MAP.ink, 0.12)}`,
  /** Épingle du destinataire (filtre drop-shadow : suit la forme de la goutte). */
  pin: `drop-shadow(0 3px 4px ${rgba(COBALT_MAP.ink, 0.25)})`,
} as const;
