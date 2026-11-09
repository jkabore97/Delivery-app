import { keyValueStore, type KeyValueStore } from './secureStorage';
import type { UserDto } from '@yaar/shared';

const KEY = 'yaar.session';

export interface StoredSession {
  token: string;
  user: UserDto;
  /** Date d'expiration du jeton (ms epoch). */
  expiresAt: number;
}

/** Le jeton est conservé dans le stockage chiffré du téléphone (Keychain / Keystore) ; localStorage sur le web. */
export async function loadSession(now: number = Date.now()): Promise<StoredSession | null> {
  try {
    const raw = await keyValueStore().getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof parsed.token !== 'string' || !parsed.user || typeof parsed.expiresAt !== 'number') return null;
    if (parsed.expiresAt <= now) return null;
    return parsed as StoredSession;
  } catch {
    return null;
  }
}

export async function saveSession(session: StoredSession): Promise<void> {
  await keyValueStore().setItem(KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await keyValueStore().deleteItem(KEY);
}

/* ------------------------------------------------------------------ */
/* Écran « Vous êtes prêt ! » du livreur                               */
/* ------------------------------------------------------------------ */

/**
 * Clé (par utilisateur) de l'écran « Vous êtes prêt ! » qui n'a plus lieu d'être sur cet appareil : écarté avec
 * « Plus tard », ou livreur déjà vu avec son consentement au suivi GPS (déjà passé en ligne, voir state/driver).
 * Caractères limités à ceux qu'accepte expo-secure-store (lettres, chiffres, « . », « - », « _ »).
 */
export function driverReadyKey(userId: string): string {
  return `yaar.driverReady.${userId.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

/**
 * true si l'écran « Vous êtes prêt ! » n'est plus à montrer à ce livreur sur cet appareil (écarté, ou livreur déjà
 * passé en ligne) ; false si stockage illisible.
 */
export async function loadDriverReadyDismissed(userId: string, store: KeyValueStore = keyValueStore()): Promise<boolean> {
  try {
    return (await store.getItem(driverReadyKey(userId))) !== null;
  } catch {
    return false;
  }
}

/** Mémorise (sur cet appareil) que l'écran « Vous êtes prêt ! » n'est plus à montrer à ce livreur. */
export async function saveDriverReadyDismissed(userId: string, store: KeyValueStore = keyValueStore()): Promise<void> {
  try {
    await store.setItem(driverReadyKey(userId), new Date().toISOString());
  } catch {
    /* stockage indisponible : l'écran pourra revenir au prochain lancement */
  }
}
