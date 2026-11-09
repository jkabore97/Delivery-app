/**
 * Point d'entrée de `@yaar/shared` pour l'application mobile : tout le code partagé SAUF les schémas zod
 * (packages/shared/src/schemas.ts, ~240 ko non minifiés avec zod), dont seuls les TYPES sont réexportés ici.
 * Les écrans qui valident des données importent les valeurs (schémas, normalizePhone…) depuis
 * `@yaar/shared/schemas` : la page publique de suivi, elle, ne télécharge jamais zod. TypeScript refuse l'usage
 * d'un schéma importé d'ici comme valeur (« exported using 'export type' »).
 * Résolu par metro.config.js, tsconfig.json (paths) et Jest (moduleNameMapper).
 */
export * from '../../../packages/shared/src/enums';
export * from '../../../packages/shared/src/constants';
export * from '../../../packages/shared/src/geo';
export * from '../../../packages/shared/src/map';
export * from '../../../packages/shared/src/pricing';
export * from '../../../packages/shared/src/orderStatus';
export type * from '../../../packages/shared/src/schemas';
export type * from '../../../packages/shared/src/types';
