import type { FontFileTable } from './fonts';

/**
 * Fichiers de la police sur le web : sous-ensembles WOFF2 « latins » de assets/fonts/ (≈ 11 ko par graisse au lieu de
 * ≈ 95 ko pour le TTF complet ; 44 ko pour les 4 graisses chargées, contre 175 ko compressés). Ils couvrent U+0000–00FF,
 * Œ œ Ÿ, la ponctuation générale U+2000–206F (’ « » … – — et espaces), €, →, −, ≈ : tout le texte français de
 * l'application. Un caractère absent (nom saisi dans une autre écriture…) est dessiné par la police du système, qui suit
 * dans chaque famille (`typeface` de src/fonts.ts).
 *
 * Créés depuis les TTF du paquet @expo-google-fonts avec fontTools (commande : docs/DESIGN.md § « Changer de police »).
 * Les noms gardent « _<graisse><Nom>. » : scripts/web-postexport.mjs y lit la graisse pour précharger les fichiers.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
export const FONT_FILES: FontFileTable = {
  400: { normal: require('../assets/fonts/PlusJakartaSans_400Regular.latin.woff2') },
  500: { normal: require('../assets/fonts/PlusJakartaSans_500Medium.latin.woff2') },
  600: { normal: require('../assets/fonts/PlusJakartaSans_600SemiBold.latin.woff2') },
  700: { normal: require('../assets/fonts/PlusJakartaSans_700Bold.latin.woff2') },
  800: { normal: require('../assets/fonts/PlusJakartaSans_800ExtraBold.latin.woff2') },
};
