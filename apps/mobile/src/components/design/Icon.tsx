import Svg, { Circle, Path } from 'react-native-svg';
import { ICON_PARTS, type IconName } from './iconPaths';

export type { IconName } from './iconPaths';

export interface IconProps {
  name: IconName;
  /** Côté en px (défaut 24). */
  size?: number;
  color?: string;
  /** Épaisseur du trait dans la grille 24 × 24 (défaut 2,2). */
  strokeWidth?: number;
  testID?: string;
}

/**
 * Pictogramme (voir `IconName`, tracés dans iconPaths.ts), de la couleur `color`. Pas de libellé d'accessibilité : le
 * bouton qui le porte en a un.
 */
export function Icon({ name, size = 24, color = '#FFFFFF', strokeWidth = 2.2, testID }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" testID={testID}>
      {ICON_PARTS[name].map((part, i) =>
        'c' in part ? (
          <Circle
            key={i}
            cx={part.c[0]}
            cy={part.c[1]}
            r={part.c[2]}
            fill={part.fill ? color : 'none'}
            stroke={part.fill ? 'none' : color}
            strokeWidth={part.fill ? 0 : strokeWidth}
          />
        ) : (
          <Path
            key={i}
            d={part.p}
            fill={part.fill ? color : 'none'}
            stroke={part.fill ? 'none' : color}
            strokeWidth={part.fill ? 0 : strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ),
      )}
    </Svg>
  );
}
