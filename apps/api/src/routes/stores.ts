import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import {
  acceptOrderSchema,
  imageUploadSchema,
  productCreateSchema,
  productUpdateSchema,
  rejectOrderSchema,
  storeCreateSchema,
  storeListQuerySchema,
  storeUpdateSchema,
  type Paginated,
  type ProductDto,
  type SellerStatsDto,
  type StoreDetailDto,
  type StoreDto,
  type OrderDto,
} from '@yaar/shared';
import { z } from 'zod';
import type { AppContext } from '../context';
import { getAuth, guard, isBackOffice } from '../lib/auth';
import { notFound } from '../lib/errors';
import { decodeUpload, sendFile } from '../lib/files';
import { extensionFor } from '../providers/storage';
import { startOfDayUtc } from '../lib/time';
import { pageArgs, parse } from '../lib/validation';
import { toProductDto, toStoreDto } from '../services/serializers';

const storeParams = z.object({ storeId: z.string().min(1) });
const productParams = z.object({ productId: z.string().min(1) });
const orderParams = z.object({ id: z.string().min(1) });

export async function storeRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { prisma, config } = ctx;
  const anyUser = guard(prisma, config.jwtSecret);
  const seller = guard(prisma, config.jwtSecret, ['SELLER']);

  /* ---------------------- Catalogue (tous rôles connectés) ---------------------- */

  app.get('/stores', { preHandler: anyUser }, async (req): Promise<Paginated<StoreDto>> => {
    const q = parse(storeListQuerySchema, req.query);
    // Seules les boutiques validées par la console sont publiées.
    const where: Prisma.StoreWhereInput = { approvalStatus: 'APPROVED' };
    if (q.openOnly) where.isOpen = true;
    if (q.q) where.name = { contains: q.q, mode: 'insensitive' };
    const from = q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : null;
    const all = await prisma.store.findMany({ where, orderBy: { name: 'asc' } });
    let dtos = all.map((s) => toStoreDto(s, from));
    if (from) dtos = dtos.sort((a, b) => Number(b.isOpen) - Number(a.isOpen) || (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    const { skip, take } = pageArgs(q);
    return { items: dtos.slice(skip, skip + take), total: dtos.length, page: q.page, pageSize: q.pageSize };
  });

  app.get('/stores/:storeId', { preHandler: anyUser }, async (req): Promise<StoreDetailDto> => {
    const { storeId } = parse(storeParams, req.params);
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: { products: { where: { isDeleted: false }, orderBy: [{ category: 'asc' }, { name: 'asc' }] } },
    });
    const user = getAuth(req);
    const internal = isBackOffice(user.role) || store?.ownerId === user.id;
    if (!store || (store.approvalStatus !== 'APPROVED' && !internal)) throw notFound('Boutique introuvable');
    const showAll = user.role !== 'CLIENT';
    return {
      ...toStoreDto(store, null, { internal }),
      products: store.products.filter((p) => showAll || p.isAvailable).map(toProductDto),
    };
  });

  /* ---------------------- Espace vendeur ---------------------- */

  async function ownStore(storeId: string, ownerId: string) {
    const s = await prisma.store.findUnique({ where: { id: storeId } });
    if (!s || s.ownerId !== ownerId) throw notFound('Boutique introuvable');
    return s;
  }

  app.get('/seller/stores', { preHandler: seller }, async (req): Promise<StoreDto[]> => {
    const rows = await prisma.store.findMany({ where: { ownerId: getAuth(req).id }, orderBy: { createdAt: 'asc' } });
    return rows.map((s) => toStoreDto(s, null, { internal: true }));
  });

  app.post('/seller/stores', { preHandler: seller }, async (req, reply): Promise<StoreDto> => {
    const input = parse(storeCreateSchema, req.body);
    // Nouvelle boutique : en attente de validation par la console (invisible des clients d'ici là).
    const s = await prisma.store.create({ data: { ...input, phone: input.phone ?? null, ownerId: getAuth(req).id } });
    reply.code(201);
    return toStoreDto(s, null, { internal: true });
  });

  app.patch('/seller/stores/:storeId', { preHandler: seller }, async (req): Promise<StoreDto> => {
    const { storeId } = parse(storeParams, req.params);
    const input = parse(storeUpdateSchema, req.body);
    await ownStore(storeId, getAuth(req).id);
    const s = await prisma.store.update({ where: { id: storeId }, data: input });
    return toStoreDto(s, null, { internal: true });
  });

  app.get('/seller/stores/:storeId/products', { preHandler: seller }, async (req): Promise<ProductDto[]> => {
    const { storeId } = parse(storeParams, req.params);
    await ownStore(storeId, getAuth(req).id);
    const rows = await prisma.product.findMany({
      where: { storeId, isDeleted: false },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toProductDto);
  });

  app.post('/seller/stores/:storeId/products', { preHandler: seller }, async (req, reply): Promise<ProductDto> => {
    const { storeId } = parse(storeParams, req.params);
    const input = parse(productCreateSchema, req.body);
    await ownStore(storeId, getAuth(req).id);
    const p = await prisma.product.create({ data: { ...input, storeId } });
    reply.code(201);
    return toProductDto(p);
  });

  async function ownProduct(productId: string, ownerId: string) {
    const p = await prisma.product.findUnique({ where: { id: productId }, include: { store: true } });
    if (!p || p.isDeleted || p.store.ownerId !== ownerId) throw notFound('Produit introuvable');
    return p;
  }

  app.patch('/seller/products/:productId', { preHandler: seller }, async (req): Promise<ProductDto> => {
    const { productId } = parse(productParams, req.params);
    const input = parse(productUpdateSchema, req.body);
    await ownProduct(productId, getAuth(req).id);
    return toProductDto(await prisma.product.update({ where: { id: productId }, data: input }));
  });

  /** Photo du produit (JPEG, PNG ou WebP, `config.maxUploadBytes` max : 5 Mo, 3 Mo sur Vercel), remplace la précédente. */
  app.put('/seller/products/:productId/photo', { preHandler: seller }, async (req): Promise<ProductDto> => {
    const { productId } = parse(productParams, req.params);
    const input = parse(imageUploadSchema, req.body);
    const p = await ownProduct(productId, getAuth(req).id);
    const data = decodeUpload(input.dataBase64, input.mimeType, config.maxUploadBytes);
    const key = `products/${p.storeId}/${p.id}-${ctx.clock.now().getTime()}.${extensionFor(input.mimeType)}`;
    await ctx.storage.put(key, data);
    const updated = await prisma.product.update({ where: { id: productId }, data: { imageKey: key, imageMimeType: input.mimeType } });
    if (p.imageKey) await ctx.storage.delete(p.imageKey);
    return toProductDto(updated);
  });

  app.delete('/seller/products/:productId/photo', { preHandler: seller }, async (req): Promise<ProductDto> => {
    const { productId } = parse(productParams, req.params);
    const p = await ownProduct(productId, getAuth(req).id);
    const updated = await prisma.product.update({ where: { id: productId }, data: { imageKey: null, imageMimeType: null } });
    if (p.imageKey) await ctx.storage.delete(p.imageKey);
    return toProductDto(updated);
  });

  app.get('/products/:productId/photo', { preHandler: anyUser }, async (req, reply) => {
    const { productId } = parse(productParams, req.params);
    const user = getAuth(req);
    const p = await prisma.product.findUnique({ where: { id: productId }, include: { store: true } });
    const internal = !!p && (isBackOffice(user.role) || p.store.ownerId === user.id);
    if (!p || !p.imageKey || p.isDeleted || (p.store.approvalStatus !== 'APPROVED' && !internal))
      throw notFound('Photo introuvable');
    const data = await ctx.storage.get(p.imageKey);
    return sendFile(reply, data, p.imageMimeType ?? 'image/jpeg', `produit-${p.id}.${extensionFor(p.imageMimeType ?? 'image/jpeg')}`);
  });

  app.delete('/seller/products/:productId', { preHandler: seller }, async (req, reply) => {
    const { productId } = parse(productParams, req.params);
    await ownProduct(productId, getAuth(req).id);
    // Suppression logique : les commandes passées gardent la référence.
    await prisma.product.update({ where: { id: productId }, data: { isDeleted: true, isAvailable: false } });
    reply.code(204);
    return null;
  });

  app.get('/seller/stores/:storeId/stats', { preHandler: seller }, async (req): Promise<SellerStatsDto> => {
    const { storeId } = parse(storeParams, req.params);
    await ownStore(storeId, getAuth(req).id);
    const since = startOfDayUtc(ctx.clock.now());
    const today = await prisma.order.findMany({ where: { storeId, createdAt: { gte: since } } });
    const delivered = today.filter((o) => o.status === 'DELIVERED');
    const notCancelled = today.filter((o) => o.status !== 'CANCELLED');
    const prepDurations = today
      .filter((o) => o.acceptedAt && o.readyAt)
      .map((o) => (o.readyAt!.getTime() - o.acceptedAt!.getTime()) / 60000);
    const pendingOrders = await prisma.order.count({ where: { storeId, status: { in: ['PENDING', 'ACCEPTED'] } } });
    return {
      storeId,
      today: {
        orders: today.length,
        delivered: delivered.length,
        cancelled: today.length - notCancelled.length,
        sales: notCancelled.reduce((s, o) => s + o.itemsTotal, 0),
        commission: delivered.reduce((s, o) => s + (o.itemsTotal - o.sellerPayout), 0),
        payout: delivered.reduce((s, o) => s + o.sellerPayout, 0),
        avgPrepMinutes: prepDurations.length
          ? Math.round(prepDurations.reduce((a, b) => a + b, 0) / prepDurations.length)
          : null,
      },
      pendingOrders,
    };
  });

  /* ---------------------- Actions vendeur sur les commandes ---------------------- */

  app.post('/orders/:id/accept', { preHandler: seller }, async (req): Promise<OrderDto> => {
    const { id } = parse(orderParams, req.params);
    const { prepTimeMinutes } = parse(acceptOrderSchema, req.body);
    return ctx.orders.sellerAccept(id, getAuth(req), prepTimeMinutes);
  });

  app.post('/orders/:id/reject', { preHandler: seller }, async (req): Promise<OrderDto> => {
    const { id } = parse(orderParams, req.params);
    const { reason } = parse(rejectOrderSchema, req.body);
    return ctx.orders.sellerReject(id, getAuth(req), reason);
  });

  app.post('/orders/:id/ready', { preHandler: seller }, async (req): Promise<OrderDto> => {
    const { id } = parse(orderParams, req.params);
    return ctx.orders.sellerReady(id, getAuth(req));
  });
}
