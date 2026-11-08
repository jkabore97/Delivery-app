/** Charte graphique (provisoire) de Yaar Livraison. */
export const colors = {
  green: '#0B7A4B',
  greenLight: '#E7F4EE',
  orange: '#F28C1B',
  orangeLight: '#FEF3E6',
  blue: '#2D6CDF',
  blueLight: '#EAF1FD',
  red: '#D93636',
  redLight: '#FDECEC',
  text: '#16202A',
  textMuted: '#5E6B78',
  border: '#E3E7EC',
  background: '#F5F7F9',
  card: '#FFFFFF',
  white: '#FFFFFF',
} as const;

/** Couleur principale selon l'espace : vert client, orange vendeur, bleu livreur. */
export const roleColor = {
  CLIENT: colors.green,
  SELLER: colors.orange,
  DRIVER: colors.blue,
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** Largeur maximale de l'application sur le web (grand écran : affichage « téléphone ») et des feuilles modales. */
export const MAX_APP_WIDTH = 440;
