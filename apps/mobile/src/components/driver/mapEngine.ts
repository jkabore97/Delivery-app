/**
 * Moteur de la carte prêt (téléchargé) : Android / iOS, la carte fait partie de l'application, rien à attendre. Web :
 * voir mapEngine.web.ts (MapLibre, bloc JS séparé).
 */
export function mapEngineReady(): Promise<void> {
  return Promise.resolve();
}
