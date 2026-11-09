import type { ExpoConfig } from 'expo/config';

/**
 * Configuration Expo de Yaar Livraison.
 * Les valeurs propres à l'environnement viennent de `.env` (voir `.env.example`) :
 * - EXPO_PUBLIC_API_URL : URL de l'API (lue à l'exécution par src/config.ts) ;
 * - GOOGLE_MAPS_API_KEY : clé Google Maps SDK for Android (obligatoire pour afficher
 *   la carte dans un build Android ; inutile dans Expo Go en développement).
 */
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY ?? '';

const config: ExpoConfig = {
  name: 'Yaar Livraison',
  slug: 'yaar-livraison',
  scheme: 'yaar',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'bf.yaar.livraison',
  },
  android: {
    package: 'bf.yaar.livraison',
    adaptiveIcon: {
      backgroundColor: '#0B7A4B',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    // Localisation au premier plan uniquement : aucun suivi en arrière-plan (exigence légale).
    // VIBRATE : vibration à l'arrivée d'une offre de course (permission normale, sans demande à l'utilisateur).
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'CAMERA', 'VIBRATE'],
    blockedPermissions: ['android.permission.ACCESS_BACKGROUND_LOCATION'],
    predictiveBackGestureEnabled: false,
  },
  // Version web (Vercel, projet « yaar-app ») : `npx expo export --platform web` → dist/ (application monopage).
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
    output: 'single',
    name: 'Yaar Livraison',
    shortName: 'Yaar',
    lang: 'fr',
    themeColor: '#0B7A4B',
    backgroundColor: '#FFFFFF',
    description: 'Yaar Livraison : livraisons à la demande pour les entreprises de Ouagadougou, suivies en direct par vos clients.',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Yaar Livraison utilise votre position pour placer l’adresse de votre entreprise et, pour les livreurs, uniquement pendant qu’ils sont en ligne.',
        isAndroidBackgroundLocationEnabled: false,
        isIosBackgroundLocationEnabled: false,
      },
    ],
    [
      'expo-image-picker',
      {
        cameraPermission: 'Yaar Livraison utilise l’appareil photo pour vos pièces justificatives et la preuve de livraison.',
        photosPermission: 'Yaar Livraison accède à vos photos pour envoyer vos pièces justificatives.',
        microphonePermission: false,
      },
    ],
    ['react-native-maps', { androidGoogleMapsApiKey: googleMapsApiKey }],
  ],
  experiments: {
    typedRoutes: false,
    // Web : blocs JS regroupés par écran (la page publique /suivi/… ne télécharge ni le code livreur / entreprise
    // ni Socket.IO) au lieu d'un bloc « __common » chargé par toutes les pages.
    chunking: { mode: 'granular' },
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? null,
  },
};

export default config;
