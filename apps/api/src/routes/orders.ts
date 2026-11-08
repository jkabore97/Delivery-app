import type { FastifyInstance } from 'fastify';
import {
  cancelOrderSchema,
  createOrderSchema,
  deliverOrderSchema,
  disputeSchema,
  orderListQuerySchema,
  orderMessageSchema,
  quoteSchema,
  ratingSchema,
  type IncidentDto,
  type OrderMessageDto,
  type OrderDto,
  type Paginated,
  type QuoteResponse,
  type RatingDto,
} from '@yaar/shared';
import { z } from 'zod';
import type { AppContext } from '../context';
import { getAuth, guard } from '../lib/auth';
import { sendFile } from '../lib/files';
import { parse } from '../lib/validation';

const orderParams = z.object({ id: z.string().min(1) });

export async function orderRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { prisma, config } = ctx;
  const anyUser = guard(prisma, config.jwtSecret);
  const client = guard(prisma, config.jwtSecret, ['CLIENT']);
  const driver = guard(prisma, config.jwtSecret, ['DRIVER']);
  // Annulation : client (anciennes commandes), entreprise (ses livraisons, avant le retrait) ou console.
  const canCancel = guard(prisma, config.jwtSecret, ['CLIENT', 'SELLER', 'CONTROLLER', 'ADMIN']);
  const clientOrDriver = guard(prisma, config.jwtSecret, ['CLIENT', 'DRIVER']);
  const messaging = guard(prisma, config.jwtSecret, ['CLIENT', 'DRIVER', 'CONTROLLER', 'ADMIN']);

  app.post('/orders/quote', { preHandler: client }, async (req): Promise<QuoteResponse> => {
    return ctx.orders.quote(parse(quoteSchema, req.body));
  });

  app.post('/orders', { preHandler: client }, async (req, reply): Promise<OrderDto> => {
    const dto = await ctx.orders.create(getAuth(req), parse(createOrderSchema, req.body));
    reply.code(201);
    return dto;
  });

  app.get('/orders', { preHandler: anyUser }, async (req): Promise<Paginated<OrderDto>> => {
    return ctx.orders.list(getAuth(req), parse(orderListQuerySchema, req.query));
  });

  app.get('/orders/:id', { preHandler: anyUser }, async (req): Promise<OrderDto> => {
    const { id } = parse(orderParams, req.params);
    return ctx.orders.getDto(id, getAuth(req));
  });

  app.post('/orders/:id/cancel', { preHandler: canCancel }, async (req): Promise<OrderDto> => {
    const { id } = parse(orderParams, req.params);
    const { reason } = parse(cancelOrderSchema, req.body);
    return ctx.orders.cancel(id, getAuth(req), reason, req.ip);
  });

  app.post('/orders/:id/pickup', { preHandler: driver }, async (req): Promise<OrderDto> => {
    const { id } = parse(orderParams, req.params);
    return ctx.orders.pickup(id, getAuth(req));
  });

  app.post('/orders/:id/deliver', { preHandler: driver }, async (req): Promise<OrderDto> => {
    const { id } = parse(orderParams, req.params);
    return ctx.orders.deliver(id, getAuth(req), parse(deliverOrderSchema, req.body));
  });

  app.get('/orders/:id/proof-photo', { preHandler: anyUser }, async (req, reply) => {
    const { id } = parse(orderParams, req.params);
    const file = await ctx.orders.proofPhoto(id, getAuth(req), req.ip);
    return sendFile(reply, file.data, file.mimeType, `preuve-${id}`);
  });

  /** Messagerie client ↔ livreur (pendant la course). Lecture aussi pour la console. */
  app.get('/orders/:id/messages', { preHandler: messaging }, async (req): Promise<OrderMessageDto[]> => {
    const { id } = parse(orderParams, req.params);
    return ctx.orders.listMessages(id, getAuth(req));
  });

  app.post('/orders/:id/messages', { preHandler: clientOrDriver }, async (req, reply): Promise<OrderMessageDto> => {
    const { id } = parse(orderParams, req.params);
    const { body } = parse(orderMessageSchema, req.body);
    const m = await ctx.orders.postMessage(id, getAuth(req), body);
    reply.code(201);
    return m;
  });

  app.post('/orders/:id/rating', { preHandler: clientOrDriver }, async (req, reply): Promise<RatingDto> => {
    const { id } = parse(orderParams, req.params);
    const { score, comment } = parse(ratingSchema, req.body);
    const r = await ctx.orders.rate(id, getAuth(req), score, comment);
    reply.code(201);
    return r;
  });

  app.post('/orders/:id/dispute', { preHandler: anyUser }, async (req, reply): Promise<IncidentDto> => {
    const { id } = parse(orderParams, req.params);
    const { description } = parse(disputeSchema, req.body);
    const r = await ctx.orders.dispute(id, getAuth(req), description);
    reply.code(201);
    return r;
  });
}
