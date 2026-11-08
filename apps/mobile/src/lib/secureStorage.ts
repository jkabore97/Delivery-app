import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Stockage clé / valeur du jeton de session.
 * - Android / iOS : expo-secure-store (Keychain / Keystore, chiffré).
 * - Web : expo-secure-store n'existe pas ; repli sur window.localStorage (le navigateur n'offre pas
 *   d'équivalent chiffré). Si localStorage est indisponible (navigation privée stricte, quota),
 *   la session est gardée en mémoire jusqu'à la fermeture de l'onglet.
 */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}

export const secureStoreBackend: KeyValueStore = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItem: (key) => SecureStore.deleteItemAsync(key),
};

type WebStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultWebStorage(): WebStorage | null {
  try {
    return typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : null;
  } catch {
    return null; // accès refusé (cookies bloqués)
  }
}

export function webStorageBackend(storage: WebStorage | null = defaultWebStorage()): KeyValueStore {
  const memory = new Map<string, string>();
  return {
    async getItem(key) {
      try {
        if (storage) return storage.getItem(key);
      } catch {
        /* repli mémoire */
      }
      return memory.get(key) ?? null;
    },
    async setItem(key, value) {
      memory.set(key, value);
      try {
        storage?.setItem(key, value);
      } catch {
        /* quota ou accès refusé : la copie mémoire suffit pour cet onglet */
      }
    },
    async deleteItem(key) {
      memory.delete(key);
      try {
        storage?.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

export function storageForPlatform(platformOs: string = Platform.OS): KeyValueStore {
  return platformOs === 'web' ? webStorageBackend() : secureStoreBackend;
}

let current: KeyValueStore | null = null;

/** Stockage de la plateforme courante (créé au premier appel). */
export function keyValueStore(): KeyValueStore {
  current ??= storageForPlatform();
  return current;
}
