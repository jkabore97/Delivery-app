/**
 * Lit une valeur d'énumération depuis l'URL : une valeur inconnue (lien ancien ou modifié)
 * est ignorée au lieu d'être envoyée à l'API, qui répondrait 400.
 */
export function enumParam<T extends string>(value: string | null, allowed: readonly T[]): T | '' {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : '';
}

/** Numéro de page valide (entier ≥ 1), 1 sinon. */
export function pageParam(value: string | null): number {
  const n = Number(value ?? '1');
  return Number.isInteger(n) && n >= 1 ? n : 1;
}
