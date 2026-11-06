import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** URL par défaut : l'émulateur Android joint la machine hôte via 10.0.2.2. */
const DEFAULT_API_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

function readApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  const extra = Constants.expoConfig?.extra as { apiUrl?: string | null } | undefined;
  const url = fromEnv || extra?.apiUrl || DEFAULT_API_URL;
  return url.replace(/\/+$/, '');
}

export const API_URL = readApiUrl();
