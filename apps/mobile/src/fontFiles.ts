import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';
import type { FontFileTable } from './fonts';

/**
 * Fichiers de la police sur Android / iOS : les TTF complets du paquet @expo-google-fonts (toutes les lettres latines,
 * ≈ 95 ko par graisse, embarqués dans l'application). Le web a son propre tableau (fontFiles.web.ts : sous-ensembles
 * WOFF2 latins, ≈ 11 ko par graisse). Avec src/fonts.ts, ce sont les seuls fichiers qui nomment la police (voir
 * docs/DESIGN.md § « Changer de police »).
 */
export const FONT_FILES: FontFileTable = {
  400: { normal: PlusJakartaSans_400Regular },
  500: { normal: PlusJakartaSans_500Medium },
  600: { normal: PlusJakartaSans_600SemiBold },
  700: { normal: PlusJakartaSans_700Bold },
  800: { normal: PlusJakartaSans_800ExtraBold },
};
