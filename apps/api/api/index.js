// Fonction Vercel unique : toutes les routes y sont réécrites (vercel.json → rewrites).
// `../dist/vercel.mjs` est produit par `npm run vercel-build` (esbuild) avant l'empaquetage des fonctions.
export { default } from '../dist/vercel.mjs';
