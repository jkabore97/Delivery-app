import Svg, { Circle, Path } from 'react-native-svg';

/**
 * Pictogramme « galerie » (une photo : cadre, soleil, relief) au dessin des icônes Yaar (grille 24 × 24, trait
 * arrondi, voir design/Icon). Fichier à part, à rejoindre les tracés communs des icônes quand ils seront réunis.
 * Pas de libellé d'accessibilité : le bouton qui le porte en a un.
 */
export function GalleryIcon({ size = 24, color = '#FFFFFF', strokeWidth = 2.2 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 4.5h14c.8 0 1.5.7 1.5 1.5v12c0 .8-.7 1.5-1.5 1.5H5c-.8 0-1.5-.7-1.5-1.5V6c0-.8.7-1.5 1.5-1.5z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Circle cx={8.8} cy={9.3} r={1.6} fill={color} />
      <Path d="M3.8 17.2l5-4.9 3.6 3.5 2.4-2.3 5.4 5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
