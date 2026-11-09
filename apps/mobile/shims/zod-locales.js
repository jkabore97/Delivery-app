// Remplace `zod/locales` (et l'espace de noms `z.locales`) dans les bundles de l'application : zod 4 y exporte
// plus de 50 langues (~350 ko non minifiés) alors que l'application n'utilise que le français (packages/shared,
// `z.config(fr())`) et l'anglais (langue par défaut de zod). Voir metro.config.js.
export { default as en } from 'zod/v4/locales/en.js';
export { default as fr } from 'zod/v4/locales/fr.js';
