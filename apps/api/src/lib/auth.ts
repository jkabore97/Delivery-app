import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient, User } from '@prisma/client';
import type { Role } from '@yaar/shared';
import { AppError, forbidden, unauthenticated } from './errors';

export interface AuthUser {
  id: string;
  role: Role;
  phone: string;
  name: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthUser;
  }
}

interface TokenPayload {
  sub: string;
  role: Role;
}

export function signAccessToken(user: Pick<User, 'id' | 'role'>, secret: string, expiresInSeconds: number): string {
  const payload: TokenPayload = { sub: user.id, role: user.role };
  return jwt.sign(payload, secret, { expiresIn: expiresInSeconds, algorithm: 'HS256' });
}

export function verifyAccessToken(token: string, secret: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string') throw new Error('payload');
    return { sub: decoded.sub, role: decoded.role as Role };
  } catch {
    throw unauthenticated('Jeton invalide ou expiré');
  }
}

/** Charge l'utilisateur d'un jeton et vérifie qu'il n'est pas suspendu. */
export async function authenticateToken(prisma: PrismaClient, token: string, secret: string): Promise<AuthUser> {
  const payload = verifyAccessToken(token, secret);
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw unauthenticated('Compte introuvable');
  if (user.isSuspended) throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Compte suspendu');
  return { id: user.id, role: user.role, phone: user.phone, name: user.name };
}

export function bearerToken(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const [scheme, value] = h.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}

/**
 * Garde de route : authentifie la requête puis vérifie le rôle.
 * Sans rôles passés, tout utilisateur authentifié est accepté.
 */
export function guard(prisma: PrismaClient, secret: string, roles?: readonly Role[]) {
  return async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const token = bearerToken(req);
    if (!token) throw unauthenticated();
    const user = await authenticateToken(prisma, token, secret);
    if (roles && roles.length > 0 && !roles.includes(user.role)) {
      throw forbidden('Rôle non autorisé pour cette action');
    }
    req.auth = user;
  };
}

export function getAuth(req: FastifyRequest): AuthUser {
  if (!req.auth) throw unauthenticated();
  return req.auth;
}

export function isBackOffice(role: Role): boolean {
  return role === 'CONTROLLER' || role === 'ADMIN';
}
