/**
 * Pictogramme des écrans de suivi (TrackingParts, page publique du destinataire). Android / iOS : le pictogramme du
 * système de design (react-native-svg). Web : TrackingIcon.web.tsx dessine les mêmes tracés en SVG du navigateur,
 * pour que la page publique (ouverte en 3G) ne télécharge pas react-native-svg.
 */
export { Icon as TrackingIcon, type IconName, type IconProps as TrackingIconProps } from '../design/Icon';
