/**
 * Système de design « Cobalt » de Yaar (docs/DESIGN.md) : clair, vif, arrondi. Repères :
 * - jetons : `palette`, `radii`, `shadows`, `spacing`, `typography` de src/theme.ts (les anciens `colors` / `dark` /
 *   `typeScale` restent pour les écrans pas encore redessinés, remappés en Cobalt clair) ;
 * - police : src/fonts.ts (un seul endroit) ; les textes passent par `Text` / `TextInput` de components/Text.tsx ;
 * - une seule action évidente par écran : `Pill tone="cobalt" size="lg"` ou `RoundButton tone="primary"` ; au plus
 *   UNE tuile héros cobalt pleine par écran ; le soleil (sun) est réservé aux espèces ;
 * - feuille blanche sur carte : `LiveTrackingLayout` ; barre d'onglets : `FloatingTabBar` (+ `TabBarInsetProvider`) ;
 * - montants : `formatFcfa` partout ; `AmountRow` garde le testID `<id>-value` des vérifications exactes.
 * La page publique de suivi (3G) n'importe PAS les composants de ce dossier (react-native-svg) : elle utilise
 * components/tracking/TrackingParts.tsx et `TrackingIcon` (mêmes tracés, iconPaths.ts, en SVG du navigateur sur le web).
 */
export { Icon, type IconName, type IconProps } from './Icon';
export { ICON_PARTS, type IconPart } from './iconPaths';
export { RoundButton, ROUND_BUTTON_SIZES, type RoundButtonProps, type RoundButtonSize, type RoundButtonTone, type Surface } from './RoundButton';
export { CountdownRing, type CountdownRingProps, type CountdownState } from './CountdownRing';
export { chipLabel, MapIconButton, Pill, StatusChip, type ChipTone, type PillProps, type PillTone } from './Pill';
export { CallRoundButton, WhatsAppRoundButton } from './ContactButtons';
export { PackageCard, type PackageCardProps } from './PackageCard';
export {
  AmountRow,
  DarkHeader,
  DarkProgress,
  DarkScreen,
  ProgressTrack,
  ScreenHeader,
  SheetSurface,
  SurfaceScreen,
  type AmountTone,
} from './Surfaces';
export { FloatingTabBar, TAB_BAR_HEIGHT, TabBarInsetProvider, tabIcon, useTabBarInset } from './TabBar';
export { CourierIllustration } from './CourierIllustration';
export { GalleryIcon } from './GalleryIcon';
