import type { FastifyInstance } from 'fastify';
import {
  createDeliverySchema,
  deliveryQuoteSchema,
  orderListQuerySchema,
  type BusinessSummaryDto,
  type OrderDto,
  type Paginated,
  type QuoteResponse,
} from '@yaar/shared';
import type { AppContext } from '../context';
import { getAuth, guard } from '../lib/auth';
import { parse } from '../lib/validation';

/**
 * Espace entreprise (compte SELLER = entreprise, boutique validée = profil d'entreprise) : demandes de livraison
 * vers des destinataires sans compte. Lecture et annulation d'une livraison : GET /orders/:id et
 * POST /orders/:id/cancel (avant le retrait).
 */
export async function businessRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const business = guard(ctx.prisma, ctx.config.jwtSecret, ['SELLER']);

  app.post('/business/deliveries/quote', { preHandler: business }, async (req): Promise<QuoteResponse> => {
    return ctx.deliveries.quote(getAuth(req), parse(deliveryQuoteSchema, req.body));
  });

  app.post('/business/deliveries', { preHandler: business }, async (req, reply): Promise<OrderDto> => {
    const dto = await ctx.deliveries.create(getAuth(req), parse(createDeliverySchema, req.body));
    reply.code(201);
    return dto;
  });

  /** Livraisons demandées par l'entreprise (filtre `status`, `updatedSince` comme GET /orders). */
  app.get('/business/deliveries', { preHandler: business }, async (req): Promise<Paginated<OrderDto>> => {
    return ctx.deliveries.list(getAuth(req), parse(orderListQuerySchema, req.query));
  });

  /** Tableau de bord : livraisons en cours et chiffres du jour (mêmes livraisons que GET /business/deliveries). */
  app.get('/business/summary', { preHandler: business }, async (req): Promise<BusinessSummaryDto> => {
    return ctx.deliveries.summary(getAuth(req));
  });
}
