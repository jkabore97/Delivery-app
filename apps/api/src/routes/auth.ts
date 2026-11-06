import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { requestOtpSchema, verifyOtpSchema, type AuthResponse, type OtpRequestResponse } from '@yaar/shared';
import type { AppContext } from '../context';
import { signAccessToken } from '../lib/auth';
import { AppError } from '../lib/errors';
import { FixedWindowLimiter } from '../lib/rateLimit';
import { parse } from '../lib/validation';
import { toUserDto } from '../services/serializers';

const MAX_OTP_PER_HOUR = 5;
const MAX_OTP_ATTEMPTS = 5;
export const DEV_BYPASS_CODE = '123456';

function hashCode(secret: string, phone: string, code: string): string {
  return createHash('sha256').update(`${secret}:${phone}:${code}`).digest('hex');
}

export async function authRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { prisma, config, clock } = ctx;
  // Limites par IP (anti « SMS pumping » et force brute), en plus de la limite par numéro.
  const requestLimiter = new FixedWindowLimiter(clock, config.authRateLimitRequest, 10 * 60_000);
  const verifyLimiter = new FixedWindowLimiter(clock, config.authRateLimitVerify, 10 * 60_000);

  app.post('/auth/otp/request', async (req): Promise<OtpRequestResponse> => {
    requestLimiter.hit(req.ip);
    const { phone } = parse(requestOtpSchema, req.body);
    const now = clock.now();
    const recent = await prisma.otpCode.count({
      where: { phone, createdAt: { gte: new Date(now.getTime() - 3600_000) } },
    });
    if (recent >= MAX_OTP_PER_HOUR)
      throw new AppError(429, 'OTP_RATE_LIMITED', 'Trop de demandes de code. Réessayez dans une heure.');
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await prisma.otpCode.create({
      data: {
        phone,
        codeHash: hashCode(config.jwtSecret, phone, code),
        expiresAt: new Date(now.getTime() + config.otpTtlSeconds * 1000),
        createdAt: now,
      },
    });
    await ctx.sms.send(phone, `Yaar Livraison : votre code de connexion est ${code}. Il expire dans ${Math.round(config.otpTtlSeconds / 60)} min.`);
    return { sent: true, expiresInSeconds: config.otpTtlSeconds };
  });

  app.post('/auth/otp/verify', async (req): Promise<AuthResponse> => {
    verifyLimiter.hit(req.ip);
    const input = parse(verifyOtpSchema, req.body);
    const now = clock.now();
    const bypass = config.otpDevBypass && input.code === DEV_BYPASS_CODE;
    if (!bypass) {
      const otp = await prisma.otpCode.findFirst({
        where: { phone: input.phone, consumedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: 'desc' },
      });
      if (!otp) throw new AppError(400, 'OTP_INVALID', 'Code invalide ou expiré. Demandez un nouveau code.');
      // Réservation atomique de l'essai AVANT la comparaison : des requêtes parallèles ne dépassent pas 5 essais.
      const reserved = await prisma.otpCode.updateMany({
        where: { id: otp.id, consumedAt: null, attempts: { lt: MAX_OTP_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      });
      if (reserved.count === 0)
        throw new AppError(400, 'OTP_INVALID', 'Code invalide ou expiré. Demandez un nouveau code.');
      const expected = Buffer.from(otp.codeHash, 'hex');
      const given = Buffer.from(hashCode(config.jwtSecret, input.phone, input.code), 'hex');
      if (!timingSafeEqual(expected, given)) throw new AppError(400, 'OTP_INVALID', 'Code incorrect');
      // Usage unique, y compris en cas de requêtes simultanées avec le bon code.
      const consumed = await prisma.otpCode.updateMany({ where: { id: otp.id, consumedAt: null }, data: { consumedAt: now } });
      if (consumed.count === 0)
        throw new AppError(400, 'OTP_INVALID', 'Code invalide ou expiré. Demandez un nouveau code.');
    }

    let user = await prisma.user.findUnique({ where: { phone: input.phone } });
    let isNewUser = false;
    if (!user) {
      user = await prisma.user.create({
        data: { phone: input.phone, role: input.role ?? 'CLIENT', name: input.name ?? null },
      });
      isNewUser = true;
    }
    if (user.isSuspended) throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Compte suspendu. Contactez le support.');
    return {
      accessToken: signAccessToken(user, config.jwtSecret, config.jwtExpiresInSeconds),
      tokenType: 'Bearer',
      expiresIn: config.jwtExpiresInSeconds,
      isNewUser,
      user: toUserDto(user),
    };
  });
}
