import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { PrismaClient } from '@prisma/client';
import type { ClientToServerEvents, ServerToClientEvents, SubscribeAck } from '@yaar/shared';
import { authenticateToken, isBackOffice, type AuthUser } from '../lib/auth';
import { AppError } from '../lib/errors';
import { rooms, type IoServer, type RealtimeHub } from './hub';

interface SocketData {
  user: AuthUser;
}

/** Une socket peut-elle rejoindre la salle d'une commande ? Même règle que GET /orders/:id (+ livreur actif). */
async function canJoinOrder(prisma: PrismaClient, user: AuthUser, orderId: string): Promise<boolean> {
  const o = await prisma.order.findUnique({ where: { id: orderId }, include: { store: true } });
  if (!o) return false;
  if (isBackOffice(user.role)) return true;
  if (user.role === 'CLIENT') return o.clientId === user.id;
  if (user.role === 'SELLER') return o.store?.ownerId === user.id;
  if (user.role === 'DRIVER') return o.driverId === user.id && (o.status === 'ASSIGNED' || o.status === 'PICKED_UP');
  return false;
}

/**
 * Passerelle Socket.IO. Authentification par JWT au moment de la connexion
 * (`auth: { token }`). Salles rejointes automatiquement : `user:<id>`, `driver:<id>` (livreurs),
 * `controllers` (console). Les salles `order:<id>` se rejoignent avec `order.subscribe`.
 */
export function createSocketServer(
  httpServer: HttpServer,
  deps: { prisma: PrismaClient; jwtSecret: string; hub: RealtimeHub; corsOrigins: string[] | '*' },
): IoServer {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    cors: { origin: deps.corsOrigins === '*' ? true : deps.corsOrigins },
  });

  io.use(async (socket, next) => {
    try {
      const raw = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
      const token = typeof raw === 'string' ? raw.replace(/^Bearer\s+/i, '') : null;
      if (!token) return next(new Error('UNAUTHENTICATED'));
      socket.data.user = await authenticateToken(deps.prisma, token, deps.jwtSecret);
      next();
    } catch (err) {
      next(new Error(err instanceof AppError ? err.code : 'UNAUTHENTICATED'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    void socket.join(rooms.user(user.id));
    if (user.role === 'DRIVER') void socket.join(rooms.driver(user.id));
    if (isBackOffice(user.role)) void socket.join(rooms.controllers);

    socket.on('order.subscribe', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : (_: SubscribeAck) => {};
      const orderId = typeof payload?.orderId === 'string' ? payload.orderId : '';
      if (!orderId || !(await canJoinOrder(deps.prisma, user, orderId))) {
        reply({ ok: false, error: { code: 'NOT_FOUND', message: 'Commande introuvable' } });
        return;
      }
      await socket.join(rooms.order(orderId));
      reply({ ok: true });
    });

    socket.on('order.unsubscribe', async (payload, ack) => {
      const orderId = typeof payload?.orderId === 'string' ? payload.orderId : '';
      if (orderId) await socket.leave(rooms.order(orderId));
      if (typeof ack === 'function') ack({ ok: true });
    });
  });

  deps.hub.attach(io as unknown as IoServer);
  return io as unknown as IoServer;
}
