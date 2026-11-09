import type * as SocketModule from './socket';

/** Web : client Socket.IO dans un bloc JS séparé, téléchargé seulement en mode « socket » (jamais sur Vercel). */
export function loadSocketModule(): Promise<typeof SocketModule> {
  return import('./socket');
}
