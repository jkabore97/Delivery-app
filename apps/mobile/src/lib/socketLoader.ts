import type * as SocketModule from './socket';

/**
 * Chargement du client Socket.IO (mode « socket » uniquement). Android / iOS : un seul bundle, le module est
 * simplement requis ; web : voir socketLoader.web.ts (bloc JS séparé, jamais téléchargé en mode « poll »).
 */
export function loadSocketModule(): Promise<typeof SocketModule> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return Promise.resolve(require('./socket') as typeof SocketModule);
}
