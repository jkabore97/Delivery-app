import type { FastifyInstance } from 'fastify';
import {
  DOCUMENTS_WITH_EXPIRY,
  MAX_UPLOAD_BYTES,
  availabilitySchema,
  documentTypeSchema,
  documentUploadSchema,
  driverProfileSchema,
  locationPingSchema,
  requiredDocuments,
  sosSchema,
  type DriverEarningsDto,
  type DriverProfileDto,
  type IncidentDto,
  type OfferDto,
  type OrderDto,
} from '@yaar/shared';
import { z } from 'zod';
import type { AppContext } from '../context';
import { getAuth, guard } from '../lib/auth';
import { AppError, badRequest, conflict, notFound } from '../lib/errors';
import { decodeUpload } from '../lib/files';
import { iso, startOfDayUtc } from '../lib/time';
import { parse } from '../lib/validation';
import { extensionFor } from '../providers/storage';
import { ratingStats } from '../services/ratings';
import {
  incidentInclude,
  ledgerInclude,
  toDriverProfileDto,
  toIncidentDto,
  toLedgerDto,
  toOfferDto,
} from '../services/serializers';

const docParams = z.object({ type: documentTypeSchema });
const offerParams = z.object({ id: z.string().min(1) });

export async function loadDriverProfileDto(ctx: AppContext, userId: string): Promise<DriverProfileDto> {
  const p = await ctx.prisma.driverProfile.findUnique({
    where: { userId },
    include: { user: true, documents: { orderBy: { uploadedAt: 'asc' } } },
  });
  if (!p) throw notFound('Profil livreur introuvable : renseignez d’abord votre véhicule');
  const stats = await ratingStats(ctx.prisma, [userId]);
  return toDriverProfileDto(p, { now: ctx.clock.now(), cashLimit: ctx.config.cashLimit, rating: stats.get(userId) });
}

export async function driverRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { prisma, config, clock } = ctx;
  const driver = guard(prisma, config.jwtSecret, ['DRIVER']);

  async function profileOrThrow(userId: string) {
    const p = await prisma.driverProfile.findUnique({ where: { userId } });
    if (!p) throw notFound('Profil livreur introuvable : renseignez d’abord votre véhicule');
    return p;
  }

  app.get('/driver/profile', { preHandler: driver }, async (req) => loadDriverProfileDto(ctx, getAuth(req).id));

  /** Crée ou modifie le véhicule. Un changement de véhicule repasse le dossier en validation. */
  app.put('/driver/profile', { preHandler: driver }, async (req): Promise<DriverProfileDto> => {
    const userId = getAuth(req).id;
    const input = parse(driverProfileSchema, req.body);
    const plate = input.plate ?? null;
    const existing = await prisma.driverProfile.findUnique({ where: { userId } });
    const consent = input.trackingConsent && !existing?.trackingConsentAt ? { trackingConsentAt: clock.now() } : {};
    if (!existing) {
      await prisma.driverProfile.create({ data: { userId, vehicleType: input.vehicleType, plate, ...consent } });
    } else {
      const changed = existing.vehicleType !== input.vehicleType || existing.plate !== plate;
      if (changed && (existing.isOnline || existing.isBusy))
        throw conflict('Passez hors ligne avant de modifier votre véhicule');
      if (existing.status === 'SUSPENDED') throw new AppError(403, 'FORBIDDEN', 'Compte livreur suspendu');
      await prisma.driverProfile.update({
        where: { userId },
        data: {
          vehicleType: input.vehicleType,
          plate,
          ...consent,
          ...(changed && existing.status !== 'PENDING' ? { status: 'PENDING', approvedAt: null, rejectionReason: null } : {}),
        },
      });
    }
    return loadDriverProfileDto(ctx, userId);
  });

  /** Dépôt (ou remplacement) d'une pièce du dossier KYC, encodée en base64. */
  app.put('/driver/documents/:type', { preHandler: driver }, async (req): Promise<DriverProfileDto> => {
    const userId = getAuth(req).id;
    const { type } = parse(docParams, req.params);
    const input = parse(documentUploadSchema, req.body);
    const profile = await profileOrThrow(userId);
    if (profile.status === 'SUSPENDED') throw new AppError(403, 'FORBIDDEN', 'Compte livreur suspendu');
    if (!requiredDocuments(profile.vehicleType).includes(type))
      throw badRequest(`La pièce ${type} n’est pas demandée pour ce type de véhicule`);
    if (DOCUMENTS_WITH_EXPIRY.includes(type) && !input.expiresAt)
      throw badRequest('La date d’expiration est obligatoire pour cette pièce', { expiresAt: ['Requis'] });
    const data = decodeUpload(input.dataBase64, input.mimeType, MAX_UPLOAD_BYTES);

    const key = `kyc/${userId}/${type.toLowerCase()}-${clock.now().getTime()}.${extensionFor(input.mimeType)}`;
    await ctx.storage.put(key, data);
    const previous = await prisma.driverDocument.findUnique({ where: { driverId_type: { driverId: userId, type } } });
    const fields = {
      storageKey: key,
      mimeType: input.mimeType,
      sizeBytes: data.length,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      uploadedAt: clock.now(),
    };
    await prisma.driverDocument.upsert({
      where: { driverId_type: { driverId: userId, type } },
      create: { driverId: userId, type, ...fields },
      update: fields,
    });
    if (previous) await ctx.storage.delete(previous.storageKey);
    // Un dossier refusé repasse en attente lorsqu'une pièce est redéposée.
    if (profile.status === 'REJECTED')
      await prisma.driverProfile.update({ where: { userId }, data: { status: 'PENDING', rejectionReason: null } });
    return loadDriverProfileDto(ctx, userId);
  });

  /**
   * Consentement au suivi GPS (obligatoire avant le premier passage en ligne). Le retrait du
   * consentement remet le livreur hors ligne et efface sa dernière position.
   */
  app.post('/driver/consent', { preHandler: driver }, async (req): Promise<DriverProfileDto> => {
    const userId = getAuth(req).id;
    const p = await profileOrThrow(userId);
    if (!p.trackingConsentAt) await prisma.driverProfile.update({ where: { userId }, data: { trackingConsentAt: clock.now() } });
    return loadDriverProfileDto(ctx, userId);
  });

  app.delete('/driver/consent', { preHandler: driver }, async (req): Promise<DriverProfileDto> => {
    const userId = getAuth(req).id;
    const p = await profileOrThrow(userId);
    if (p.isBusy) throw conflict('Terminez votre course avant de retirer votre consentement', 'DRIVER_BUSY');
    await prisma.driverProfile.update({
      where: { userId },
      data: { trackingConsentAt: null, isOnline: false, onlineSince: null, lastLat: null, lastLng: null, lastLocationAt: null },
    });
    await ctx.dispatch.withdrawDriverOffers(userId);
    if (p.isOnline) ctx.realtime.driverStatus({ driverId: userId, isOnline: false, isBusy: false });
    return loadDriverProfileDto(ctx, userId);
  });

  /** Passage en ligne / hors ligne. Le suivi GPS n'est actif qu'en ligne. */
  app.patch('/driver/availability', { preHandler: driver }, async (req): Promise<DriverProfileDto> => {
    const userId = getAuth(req).id;
    const input = parse(availabilitySchema, req.body);
    const p = await profileOrThrow(userId);
    const now = clock.now();
    if (input.online) {
      if (p.status !== 'APPROVED')
        throw new AppError(403, 'DRIVER_NOT_APPROVED', 'Votre dossier doit être validé par un contrôleur');
      if (p.cashHeld >= config.cashLimit)
        throw new AppError(409, 'CASH_LIMIT_REACHED', `Plafond d’espèces atteint (${config.cashLimit} FCFA) : déposez l’argent avant de reprendre`);
      if (!p.trackingConsentAt && !input.trackingConsent)
        throw new AppError(
          403,
          'CONSENT_REQUIRED',
          'Acceptez le suivi de votre position pendant le service avant de passer en ligne',
        );
      const hasPos = input.lat !== undefined && input.lng !== undefined;
      await prisma.driverProfile.update({
        where: { userId },
        data: {
          isOnline: true,
          onlineSince: now,
          ...(p.trackingConsentAt ? {} : { trackingConsentAt: now }),
          ...(hasPos ? { lastLat: input.lat, lastLng: input.lng, lastLocationAt: now } : {}),
        },
      });
      if (hasPos)
        await prisma.locationPing.create({ data: { driverId: userId, lat: input.lat!, lng: input.lng!, createdAt: now } });
    } else {
      if (p.isBusy) throw conflict('Terminez votre course avant de passer hors ligne', 'DRIVER_BUSY');
      // Hors ligne : on efface la dernière position (pas de suivi hors service).
      await prisma.driverProfile.update({
        where: { userId },
        data: { isOnline: false, onlineSince: null, lastLat: null, lastLng: null, lastLocationAt: null },
      });
      await ctx.dispatch.withdrawDriverOffers(userId);
    }
    ctx.realtime.driverStatus({ driverId: userId, isOnline: input.online, isBusy: p.isBusy });
    if (input.online) await ctx.dispatch.tick();
    return loadDriverProfileDto(ctx, userId);
  });

  /** Position GPS : acceptée UNIQUEMENT lorsque le livreur est en ligne (exigence légale). */
  app.post('/driver/location', { preHandler: driver }, async (req, reply) => {
    const userId = getAuth(req).id;
    const input = parse(locationPingSchema, req.body);
    const p = await prisma.driverProfile.findUnique({ where: { userId } });
    if (!p || !p.isOnline)
      throw new AppError(403, 'DRIVER_OFFLINE', 'Position refusée : le suivi n’est autorisé qu’en ligne');
    const now = clock.now();
    const active = await prisma.order.findFirst({
      where: { driverId: userId, status: { in: ['ASSIGNED', 'PICKED_UP'] } },
      select: { id: true },
    });
    await prisma.$transaction([
      prisma.locationPing.create({
        data: {
          driverId: userId,
          orderId: active?.id ?? null,
          lat: input.lat,
          lng: input.lng,
          accuracy: input.accuracy ?? null,
          heading: input.heading ?? null,
          speed: input.speed ?? null,
          createdAt: now,
        },
      }),
      prisma.driverProfile.update({
        where: { userId },
        data: { lastLat: input.lat, lastLng: input.lng, lastLocationAt: now },
      }),
    ]);
    ctx.realtime.driverLocation({
      driverId: userId,
      lat: input.lat,
      lng: input.lng,
      heading: input.heading ?? null,
      speed: input.speed ?? null,
      orderId: active?.id ?? null,
      at: iso(now),
    });
    reply.code(204);
    return null;
  });

  app.get('/driver/offers', { preHandler: driver }, async (req): Promise<OfferDto[]> => {
    const rows = await prisma.dispatchOffer.findMany({
      where: { driverId: getAuth(req).id, status: 'OFFERED', expiresAt: { gt: clock.now() } },
      include: { order: { include: { store: true } } },
      orderBy: { offeredAt: 'desc' },
    });
    return rows.map(toOfferDto);
  });

  app.post('/driver/offers/:id/accept', { preHandler: driver }, async (req): Promise<OrderDto> => {
    const { id } = parse(offerParams, req.params);
    const user = getAuth(req);
    const orderId = await ctx.dispatch.acceptOffer(id, user.id);
    return ctx.orders.getDto(orderId, user);
  });

  app.post('/driver/offers/:id/reject', { preHandler: driver }, async (req, reply) => {
    const { id } = parse(offerParams, req.params);
    await ctx.dispatch.rejectOffer(id, getAuth(req).id);
    reply.code(204);
    return null;
  });

  app.get('/driver/current-order', { preHandler: driver }, async (req): Promise<{ order: OrderDto | null }> => {
    const user = getAuth(req);
    const o = await prisma.order.findFirst({
      where: { driverId: user.id, status: { in: ['ASSIGNED', 'PICKED_UP'] } },
      orderBy: { assignedAt: 'desc' },
    });
    return { order: o ? await ctx.orders.getDto(o.id, user) : null };
  });

  app.get('/driver/earnings', { preHandler: driver }, async (req): Promise<DriverEarningsDto> => {
    const userId = getAuth(req).id;
    const p = await profileOrThrow(userId);
    const since = startOfDayUtc(clock.now());
    const [today, allTime, ledger] = await Promise.all([
      prisma.order.aggregate({
        where: { driverId: userId, status: 'DELIVERED', deliveredAt: { gte: since } },
        _count: { _all: true },
        _sum: { driverEarning: true, cashCollected: true },
      }),
      prisma.order.aggregate({
        where: { driverId: userId, status: 'DELIVERED' },
        _count: { _all: true },
        _sum: { driverEarning: true },
      }),
      prisma.cashLedgerEntry.findMany({
        where: { driverId: userId },
        include: ledgerInclude,
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    return {
      today: {
        deliveries: today._count._all,
        earnings: today._sum.driverEarning ?? 0,
        cashCollected: today._sum.cashCollected ?? 0,
      },
      allTime: { deliveries: allTime._count._all, earnings: allTime._sum.driverEarning ?? 0 },
      cashHeld: p.cashHeld,
      cashLimit: config.cashLimit,
      cashBlocked: p.cashHeld >= config.cashLimit,
      recentLedger: ledger.map(toLedgerDto),
    };
  });

  /** Bouton SOS : crée un incident visible immédiatement par les contrôleurs. */
  app.post('/driver/sos', { preHandler: driver }, async (req, reply): Promise<IncidentDto> => {
    const userId = getAuth(req).id;
    const input = parse(sosSchema, req.body);
    let orderId: string | null = null;
    if (input.orderId) {
      const o = await prisma.order.findUnique({ where: { id: input.orderId } });
      if (!o || o.driverId !== userId) throw notFound('Commande introuvable');
      orderId = o.id;
    } else {
      const active = await prisma.order.findFirst({
        where: { driverId: userId, status: { in: ['ASSIGNED', 'PICKED_UP'] } },
        select: { id: true },
      });
      orderId = active?.id ?? null;
    }
    const incident = await prisma.incident.create({
      data: {
        type: 'SOS',
        reporterId: userId,
        orderId,
        lat: input.lat,
        lng: input.lng,
        description: input.message?.trim() || 'Alerte SOS du livreur',
        createdAt: clock.now(),
      },
      include: incidentInclude,
    });
    const dto = toIncidentDto(incident);
    ctx.realtime.sos(dto);
    reply.code(201);
    return dto;
  });
}
