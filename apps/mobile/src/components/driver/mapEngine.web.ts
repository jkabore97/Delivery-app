import { loadMaplibre } from '../../lib/map/maplibre.web';

/**
 * Web : résolu quand MapLibre (≈ 270 ko compressés) est téléchargé, ou en échec : la page publique de suivi demande ses
 * polices seulement ensuite, pour qu'elles ne disputent pas la bande passante (3G) au moteur de la carte.
 */
export function mapEngineReady(): Promise<void> {
  return loadMaplibre().then(
    () => undefined,
    () => undefined,
  );
}
