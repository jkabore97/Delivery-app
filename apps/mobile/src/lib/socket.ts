import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@yaar/shared';

export type YaarSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createSocket(baseUrl: string, token: string): YaarSocket {
  return io(baseUrl, {
    auth: { token },
    transports: ['websocket'], // recommandé sur React Native
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });
}
