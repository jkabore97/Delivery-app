import type { FastifyInstance } from 'fastify';
import {
  pushTokenDeleteSchema,
  pushTokenSchema,
  savedAddressSchema,
  updateMeSchema,
  type SavedAddressDto,
  type UserDto,
} from '@yaar/shared';
import { z } from 'zod';
import type { AppContext } from '../context';
import { getAuth, guard } from '../lib/auth';
import { notFound } from '../lib/errors';
import { iso } from '../lib/time';
import { parse } from '../lib/validation';
import { toUserDto } from '../services/serializers';

const idParams = z.object({ id: z.string().min(1) });

export async function meRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { prisma } = ctx;
  const auth = guard(prisma, ctx.config.jwtSecret);
  const client = guard(prisma, ctx.config.jwtSecret, ['CLIENT']);

  app.get('/me', { preHandler: auth }, async (req): Promise<UserDto> => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: getAuth(req).id } });
    return toUserDto(user);
  });

  app.patch('/me', { preHandler: auth }, async (req): Promise<UserDto> => {
    const { name } = parse(updateMeSchema, req.body);
    const user = await prisma.user.update({ where: { id: getAuth(req).id }, data: { name } });
    return toUserDto(user);
  });

  const toDto = (a: { id: string; label: string; lat: number; lng: number; address: string; landmark: string; createdAt: Date }): SavedAddressDto => ({
    id: a.id,
    label: a.label,
    lat: a.lat,
    lng: a.lng,
    address: a.address,
    landmark: a.landmark,
    createdAt: iso(a.createdAt),
  });

  /** Enregistre le jeton push de l'appareil (un jeton appartient au dernier compte connecté dessus). */
  app.post('/me/push-tokens', { preHandler: auth }, async (req, reply) => {
    const input = parse(pushTokenSchema, req.body);
    const userId = getAuth(req).id;
    await prisma.pushToken.upsert({
      where: { token: input.token },
      create: { token: input.token, platform: input.platform, userId },
      update: { platform: input.platform, userId },
    });
    reply.code(204);
    return null;
  });

  /** Désinscription (déconnexion de l'appareil). */
  app.delete('/me/push-tokens', { preHandler: auth }, async (req, reply) => {
    const { token } = parse(pushTokenDeleteSchema, req.body);
    await prisma.pushToken.deleteMany({ where: { token, userId: getAuth(req).id } });
    reply.code(204);
    return null;
  });

  app.get('/me/addresses', { preHandler: client }, async (req): Promise<SavedAddressDto[]> => {
    const rows = await prisma.savedAddress.findMany({ where: { userId: getAuth(req).id }, orderBy: { createdAt: 'desc' } });
    return rows.map(toDto);
  });

  app.post('/me/addresses', { preHandler: client }, async (req, reply): Promise<SavedAddressDto> => {
    const input = parse(savedAddressSchema, req.body);
    const row = await prisma.savedAddress.create({ data: { ...input, userId: getAuth(req).id } });
    reply.code(201);
    return toDto(row);
  });

  app.delete('/me/addresses/:id', { preHandler: client }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    const r = await prisma.savedAddress.deleteMany({ where: { id, userId: getAuth(req).id } });
    if (r.count === 0) throw notFound('Adresse introuvable');
    reply.code(204);
    return null;
  });
}
