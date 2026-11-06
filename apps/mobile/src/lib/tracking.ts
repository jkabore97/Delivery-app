/**
 * Règles d'envoi de la position GPS du livreur (docs/API.md § 7.2).
 * Confidentialité : AUCUN envoi quand le livreur est hors ligne.
 */
export const PING_INTERVAL_ON_DELIVERY_MS = 8_000;
export const PING_INTERVAL_IDLE_MS = 45_000;
/** Déplacement minimal qui justifie un envoi anticipé quand le livreur est libre. */
export const PING_MIN_MOVE_METERS = 150;

export interface PingState {
  online: boolean;
  onDelivery: boolean;
  lastSentAt: number | null;
  /** Distance (m) parcourue depuis le dernier envoi. */
  movedMeters: number;
}

export function pingInterval(onDelivery: boolean): number {
  return onDelivery ? PING_INTERVAL_ON_DELIVERY_MS : PING_INTERVAL_IDLE_MS;
}

export function shouldSendPing(s: PingState, now: number): boolean {
  if (!s.online) return false;
  if (s.lastSentAt === null) return true;
  const elapsed = now - s.lastSentAt;
  if (elapsed >= pingInterval(s.onDelivery)) return true;
  // Libre : on anticipe si le livreur a beaucoup bougé (au plus toutes les 8 s).
  return !s.onDelivery && s.movedMeters >= PING_MIN_MOVE_METERS && elapsed >= PING_INTERVAL_ON_DELIVERY_MS;
}

/** Convertit une position expo-location vers le corps de POST /driver/location (valeurs bornées). */
export function toLocationPing(coords: {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
}): { lat: number; lng: number; accuracy?: number; heading?: number; speed?: number } {
  const ping: { lat: number; lng: number; accuracy?: number; heading?: number; speed?: number } = {
    lat: coords.latitude,
    lng: coords.longitude,
  };
  if (coords.accuracy !== null && coords.accuracy >= 0 && coords.accuracy <= 10_000) ping.accuracy = coords.accuracy;
  if (coords.heading !== null && coords.heading >= 0 && coords.heading <= 360) ping.heading = coords.heading;
  if (coords.speed !== null && coords.speed >= 0 && coords.speed <= 100) ping.speed = coords.speed;
  return ping;
}
