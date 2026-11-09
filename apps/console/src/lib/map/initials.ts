/** Mots ignorés après le premier (« Pharmacie du Centre » → PC, « Grillades de Pissy » → GP). */
const NAME_PARTICLES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'au', 'aux', 'chez', 'en']);
const ELIDED = new Set(['l', 'd']);
const FIRST_CHAR = /[A-Za-z0-9À-ÖØ-öø-ɏ]/;

/**
 * Une ou deux lettres pour le carré d'une entreprise (« Le Verdoyant » → LV, « Kaya Market » → KM, « L’Escale » → E),
 * mêmes règles que l'application mobile (`avatarInitials`) ; null sans nom exploitable (pictogramme boutique).
 */
export function markerInitials(name: string | null | undefined): string | null {
  if (!name) return null;
  let words = name
    .replace(/[’'`.\-_/()]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length > 1 && ELIDED.has(words[0]!.toLowerCase())) words = words.slice(1);
  const letters = words
    .filter((w, i) => i === 0 || !NAME_PARTICLES.has(w.toLowerCase()))
    .map((w) => FIRST_CHAR.exec(w)?.[0] ?? '')
    .filter(Boolean)
    .slice(0, 2);
  return letters.length ? letters.join('').toUpperCase() : null;
}
