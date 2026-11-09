import { Platform, type ViewStyle } from 'react-native';
import { MIN_TOUCH } from '../theme';

/**
 * Zone tactile d'au moins `min` px (56 par défaut, MIN_TOUCH) autour d'un élément de `size` px : `hitSlop` en natif ;
 * react-native-web ignore `hitSlop`, l'élément y reçoit donc une marge intérieure de `pad` px compensée par une
 * marge négative (même place dans la mise en page, même dessin, zone tactile agrandie). Sans dépendance graphique :
 * utilisable par la page publique de suivi.
 */
export function touchTarget(size: number, min: number = MIN_TOUCH, os: string = Platform.OS): { hitSlop?: number; style?: ViewStyle } {
  const pad = Math.max(0, Math.ceil((min - size) / 2));
  if (!pad) return {};
  return os === 'web' ? { style: { padding: pad, margin: -pad } } : { hitSlop: pad };
}
