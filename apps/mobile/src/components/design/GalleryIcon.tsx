import Svg, { Circle, Path } from 'react-native-svg';
import { palette } from '../../theme';

/**
 * Pictogramme « galerie » (une photo : cadre, soleil, relief) au dessin des icônes Yaar (grille 24 × 24, trait
 * arrondi, voir design/Icon), en cobalt avec un soleil jaune par défaut. `color` : cadre et relief ; `sunColor` : le
 * soleil (même couleur que le cadre si `monochrome`). Pas de libellé d'accessibilité : le bouton qui le porte en a un.
 */
export function GalleryIcon({
  size = 24,
  color = palette.cobalt,
  strokeWidth = 2.2,
  sunColor = palette.sun,
  monochrome = false,
}: {
  size?: number;
  color?: string;
  strokeWidth?: number;
  sunColor?: string;
  monochrome?: boolean;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 4.5h14c.8 0 1.5.7 1.5 1.5v12c0 .8-.7 1.5-1.5 1.5H5c-.8 0-1.5-.7-1.5-1.5V6c0-.8.7-1.5 1.5-1.5z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Circle cx={8.8} cy={9.3} r={1.9} fill={monochrome ? color : sunColor} />
      <Path d="M3.8 17.2l5-4.9 3.6 3.5 2.4-2.3 5.4 5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
