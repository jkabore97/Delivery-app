import { ICON_PARTS, type IconName } from '../design/iconPaths';

export type { IconName } from '../design/iconPaths';

export interface TrackingIconProps {
  name: IconName;
  /** Côté en px (défaut 24). */
  size?: number;
  color?: string;
  /** Épaisseur du trait dans la grille 24 × 24 (défaut 2,2). */
  strokeWidth?: number;
  testID?: string;
}

/**
 * Web : mêmes tracés que `Icon` (iconPaths.ts) dessinés directement en SVG du navigateur, sans react-native-svg
 * (≈ 60 ko de moins au premier chargement de la page publique de suivi). Purement décoratif : le bouton qui le
 * porte a un libellé d'accessibilité.
 */
export function TrackingIcon({ name, size = 24, color = '#FFFFFF', strokeWidth = 2.2, testID }: TrackingIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      data-testid={testID}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {ICON_PARTS[name].map((part, i) =>
        'c' in part ? (
          <circle
            key={i}
            cx={part.c[0]}
            cy={part.c[1]}
            r={part.c[2]}
            fill={part.fill ? color : 'none'}
            stroke={part.fill ? 'none' : color}
            strokeWidth={part.fill ? 0 : strokeWidth}
          />
        ) : (
          <path
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
    </svg>
  );
}
