import Svg, { Circle, Path } from 'react-native-svg';

/**
 * Pictogrammes vectoriels de Yaar (grille 24 × 24, trait arrondi), dessinés pour l'application : aucun logo de
 * marque (WhatsApp est représenté par une bulle de discussion générique). Ils n'ont pas de libellé d'accessibilité :
 * le bouton qui les porte en a un.
 */
export type IconName =
  | 'alert'
  | 'back'
  | 'camera'
  | 'cash'
  | 'chat'
  | 'check'
  | 'chevronDown'
  | 'chevronRight'
  | 'chevronUp'
  | 'clock'
  | 'close'
  | 'document'
  | 'flag'
  | 'info'
  | 'list'
  | 'map'
  | 'navigation'
  | 'package'
  | 'phone'
  | 'pin'
  | 'power'
  | 'recenter'
  | 'route'
  | 'star'
  | 'store'
  | 'user'
  | 'wallet';

/** Tracé (`p`) ou disque (`c` = [cx, cy, r]) ; `fill` : rempli de la couleur au lieu d'être tracé. */
type Part = { p: string; fill?: true } | { c: [number, number, number]; fill?: true };

const ICONS: Record<IconName, Part[]> = {
  alert: [{ p: 'M12 4.2 21 19.5H3L12 4.2z' }, { p: 'M12 10v4.2' }, { c: [12, 16.9, 1.1], fill: true }],
  back: [{ p: 'M19 12H5.5M11.5 5.8 5.3 12l6.2 6.2' }],
  camera: [
    { p: 'M4.5 8h2.8l1.6-2.5h6.2L16.7 8h2.8c.8 0 1.5.7 1.5 1.5v8c0 .8-.7 1.5-1.5 1.5h-15c-.8 0-1.5-.7-1.5-1.5v-8C3 8.7 3.7 8 4.5 8z' },
    { c: [12, 13.2, 3.3] },
  ],
  cash: [
    { p: 'M3.5 7h17a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z' },
    { c: [12, 12, 2.6] },
    { p: 'M6 10v4M18 10v4' },
  ],
  chat: [
    { p: 'M12 4c4.7 0 8.5 3.2 8.5 7.3s-3.8 7.3-8.5 7.3c-1.1 0-2.1-.2-3.1-.5L4.6 19.6l1.3-3.5C4.4 14.8 3.5 13.1 3.5 11.3 3.5 7.2 7.3 4 12 4z' },
    { c: [8.6, 11.4, 1.05], fill: true },
    { c: [12, 11.4, 1.05], fill: true },
    { c: [15.4, 11.4, 1.05], fill: true },
  ],
  check: [{ p: 'M5 12.5 9.6 17.1 19.2 7.4' }],
  chevronDown: [{ p: 'M6.5 9.5 12 15l5.5-5.5' }],
  chevronRight: [{ p: 'M9.5 6.5 15 12l-5.5 5.5' }],
  chevronUp: [{ p: 'M6.5 14.5 12 9l5.5 5.5' }],
  clock: [{ c: [12, 12, 8.6] }, { p: 'M12 7.4V12l3.2 2' }],
  close: [{ p: 'M6.5 6.5l11 11M17.5 6.5l-11 11' }],
  document: [
    { p: 'M6.5 3.5h7.5l4.5 4.5v11.2c0 .7-.6 1.3-1.3 1.3H6.5c-.7 0-1.3-.6-1.3-1.3V4.8c0-.7.6-1.3 1.3-1.3z' },
    { p: 'M13.5 3.7v4.8h4.8' },
    { p: 'M8.8 13h6.4M8.8 16.5h6.4' },
  ],
  flag: [{ p: 'M5.5 21V4.5' }, { p: 'M5.5 4.5h11.8l-2.4 4.3 2.4 4.3H5.5' }],
  info: [{ c: [12, 12, 8.6] }, { p: 'M12 11v5.5' }, { c: [12, 7.9, 1.15], fill: true }],
  list: [
    { p: 'M9 6.5h11M9 12h11M9 17.5h11' },
    { c: [4.7, 6.5, 1.25], fill: true },
    { c: [4.7, 12, 1.25], fill: true },
    { c: [4.7, 17.5, 1.25], fill: true },
  ],
  map: [{ p: 'M9 4.5 3.5 6.7v12.8L9 17.3l6 2.2 5.5-2.2V4.5L15 6.7 9 4.5z' }, { p: 'M9 4.5v12.8M15 6.7v12.8' }],
  navigation: [{ p: 'M20.2 3.8 3.8 10.6l7.1 2.5 2.5 7.1 6.8-16.4z', fill: true }],
  package: [
    { p: 'M12 3.2l7.8 4.3v9L12 20.8l-7.8-4.3v-9L12 3.2z' },
    { p: 'M4.4 7.6 12 11.8l7.6-4.2M12 11.8v8.8' },
    { p: 'M8.2 5.4l7.7 4.3' },
  ],
  phone: [
    {
      p: 'M8.3 3.6H6.1c-1.2 0-2.1 1-2 2.2.5 7.4 6.7 13.6 14.1 14.1 1.2.1 2.2-.8 2.2-2v-2.2c0-.5-.3-.9-.8-1l-3.2-.8c-.4-.1-.9.1-1.1.4l-1.1 1.5c-2.6-1.2-4.8-3.4-6-6l1.5-1.1c.3-.2.5-.7.4-1.1l-.8-3.2c-.1-.5-.5-.8-1-.8z',
    },
  ],
  pin: [{ p: 'M12 21c-.4 0-6.8-5.9-6.8-11a6.8 6.8 0 0 1 13.6 0c0 5.1-6.4 11-6.8 11z' }, { c: [12, 10, 2.5] }],
  power: [{ p: 'M12 3.2v8' }, { p: 'M7.1 6.3a7.6 7.6 0 1 0 9.8 0' }],
  recenter: [{ c: [12, 12, 6.5] }, { c: [12, 12, 2.2], fill: true }, { p: 'M12 2.8v2.7M12 18.5v2.7M2.8 12h2.7M18.5 12h2.7' }],
  route: [{ c: [6, 18, 2.2] }, { c: [18, 6, 2.2] }, { p: 'M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8' }],
  star: [{ p: 'M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.6z', fill: true }],
  store: [
    { p: 'M4 9.5 5.5 4.5h13L20 9.5' },
    { p: 'M4 9.5c0 1.4 1.1 2.5 2.7 2.5s2.6-1.1 2.6-2.5c0 1.4 1.2 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1.1 2.5 2.6 2.5S20 10.9 20 9.5' },
    { p: 'M5.5 12v7.5h13V12' },
    { p: 'M10 19.5V15h4v4.5' },
  ],
  user: [{ c: [12, 8.2, 3.8] }, { p: 'M4.6 20.2c.9-3.9 3.9-6.2 7.4-6.2s6.5 2.3 7.4 6.2' }],
  wallet: [
    { p: 'M18.5 7.5V5.8c0-.7-.6-1.3-1.3-1.3H5.3c-1 0-1.8.8-1.8 1.8' },
    { p: 'M3.5 6.3v11.4c0 1 .8 1.8 1.8 1.8h13.4c.7 0 1.3-.6 1.3-1.3V8.8c0-.7-.6-1.3-1.3-1.3H5.3c-1 0-1.8-.8-1.8-1.8z' },
    { c: [16.3, 13.5, 1.2], fill: true },
  ],
};

export interface IconProps {
  name: IconName;
  /** Côté en px (défaut 24). */
  size?: number;
  color?: string;
  /** Épaisseur du trait dans la grille 24 × 24 (défaut 2,2). */
  strokeWidth?: number;
  testID?: string;
}

/** Pictogramme (voir `IconName`), de la couleur `color`. */
export function Icon({ name, size = 24, color = '#FFFFFF', strokeWidth = 2.2, testID }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" testID={testID}>
      {ICONS[name].map((part, i) =>
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
