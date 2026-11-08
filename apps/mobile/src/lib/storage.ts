import { keyValueStore } from './secureStorage';
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
