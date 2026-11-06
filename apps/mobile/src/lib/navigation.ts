import { Platform } from 'react-native';

/**
 * Lien d'itinéraire vers une application de navigation externe (Google Maps, Plans...).
 * `platformOs` est injectable pour les tests.
 */
export function externalDirectionsUrl(
  dest: { lat: number; lng: number },
  label?: string,
  platformOs: string = Platform.OS,
): string {
  const ll = `${dest.lat},${dest.lng}`;
  if (platformOs === 'ios') {
    const q = label ? `&q=${encodeURIComponent(label)}` : '';
    return `http://maps.apple.com/?daddr=${ll}&dirflg=d${q}`;
  }
  if (platformOs === 'android') {
    // Ouvre Google Maps en mode navigation, sinon toute appli gérant geo:.
    return `google.navigation:q=${ll}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${ll}`;
}

/** Repli universel si l'URL native n'est pas gérée. */
export function webDirectionsUrl(dest: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}`;
}
