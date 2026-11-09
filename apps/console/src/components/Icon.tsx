import { ICON_PARTS, type IconName } from './iconPaths';

export type { IconName } from './iconPaths';

export interface IconProps {
  name: IconName;
  /** Côté en px (défaut 20). */
  size?: number;
  /** Épaisseur du trait dans la grille 24 × 24 (défaut 2,2, comme l'application mobile). */
  strokeWidth?: number;
  className?: string;
}

/**
 * Pictogramme SVG de la couleur du texte (`currentColor`). Toujours décoratif (`aria-hidden`) : le bouton ou le texte
 * qui le porte donne le libellé.
 */
export function Icon({ name, size = 20, strokeWidth = 2.2, className }: IconProps) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {ICON_PARTS[name].map((part, i) =>
        'c' in part ? (
          <circle
            key={i}
            cx={part.c[0]}
            cy={part.c[1]}
            r={part.c[2]}
            fill={part.fill ? 'currentColor' : 'none'}
            stroke={part.fill ? 'none' : 'currentColor'}
            strokeWidth={part.fill ? undefined : strokeWidth}
          />
        ) : (
          <path
            key={i}
            d={part.p}
            fill={part.fill ? 'currentColor' : 'none'}
            stroke={part.fill ? 'none' : 'currentColor'}
            strokeWidth={part.fill ? undefined : strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ),
      )}
    </svg>
  );
}
