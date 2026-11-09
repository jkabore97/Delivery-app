import { preloadMaplibre } from './maplibre.web';

/**
 * Web : commence à télécharger MapLibre (≈ 280 ko compressés) dès que la page en aura besoin, sans attendre que
 * la carte soit affichée. La page publique de suivi le précharge aussi depuis le HTML (scripts/web-postexport.mjs).
 */
export function preloadMapEngine(): void {
  preloadMaplibre();
}
