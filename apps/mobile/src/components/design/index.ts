/**
 * Système de design « coursier » de Yaar (écrans du livreur ; réutilisable pour les écrans de l'entreprise et du
 * destinataire). Repères :
 * - couleurs : `colors` (clair, inchangé) et `dark` (surfaces sombres, vert vif `dark.green` à la place du vert de
 *   marque sur fond sombre, `dark.redFill` pour Refuser / SOS, `dark.amber` pour les espèces) dans src/theme.ts ;
 *   `typeScale` (titres 800–900, montants en chiffres tabulaires), `SHEET_RADIUS` (24), `MIN_TOUCH` (56) ;
 * - une seule action évidente par écran : `RoundButton tone="primary"` (ou `Pill tone="green" size="lg"`) ;
 * - feuille sombre sur carte claire : `LiveTrackingLayout sheetTheme="dark"` ; carte sombre : `LiveMap theme="dark"` ;
 *   épingles « avatar » : `initials` d'un marqueur (`SceneInput.initials` pour une course) ;
 * - montants : `formatFcfa` partout ; `AmountRow` garde le testID `<testID>-value` des vérifications exactes.
 * La page publique de suivi (3G) n'importe PAS les composants de ce dossier (react-native-svg) : elle utilise
 * components/tracking/TrackingParts.tsx et `TrackingIcon` (mêmes tracés, iconPaths.ts, en SVG du navigateur sur le web).
 */
export { Icon, type IconName, type IconProps } from './Icon';
export { ICON_PARTS, type IconPart } from './iconPaths';
export { RoundButton, ROUND_BUTTON_SIZES, type RoundButtonProps, type RoundButtonSize, type RoundButtonTone, type Surface } from './RoundButton';
export { CountdownRing, type CountdownRingProps, type CountdownState } from './CountdownRing';
export { MapIconButton, Pill, StatusChip, type ChipTone, type PillProps, type PillTone } from './Pill';
export { CallRoundButton, WhatsAppRoundButton } from './ContactButtons';
export { PackageCard, type PackageCardProps } from './PackageCard';
export { AmountRow, DarkHeader, DarkProgress, DarkScreen, SheetSurface, type AmountTone } from './Surfaces';
export { CourierIllustration } from './CourierIllustration';
