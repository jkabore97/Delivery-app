import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { DEMO_OTP_CODE, requestOtpSchema, verifyOtpSchema, type AuthResponse, type OtpRequestResponse } from '@yaar/shared';
import type { AppContext } from '../context';
import { isBackOffice, signAccessToken } from '../lib/auth';
import { AppError } from '../lib/errors';
import { FixedWindowLimiter } from '../lib/rateLimit';
import { parse } from '../lib/validation';
import { OtpProviderNotConfiguredError } from '../providers/sms';
import { DEMO_ACCOUNT_PHONES, otpRequestsPerHour } from '../services/demo';
import { toUserDto } from '../services/serializers';

const MAX_OTP_ATTEMPTS = 5;
/** Code universel (développement avec OTP_DEV_BYPASS, ou démonstration hors comptes de console). */
export const DEV_BYPASS_CODE = DEMO_OTP_CODE;
const INVALID_OR_EXPIRED = 'Code invalide ou expiré. Demandez un nouveau code.';

function hashCode(secret: string, phone: string, code: string): string {
  return createHash('sha256').update(`${secret}:${phone}:${code}`).digest('hex');
}

/** Comparaison à temps constant de deux codes (empreintes de même longueur). */
function sameCode(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
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
    // 5 codes par heure et par numéro ; démonstration : sans plafond pour les comptes du seed qui se connectent avec
    // 123456, 30 pour ses comptes de console (services/demo.ts).
    let backOffice = false;
    if (config.demoMode && DEMO_ACCOUNT_PHONES.has(phone)) {
      const existing = await prisma.user.findUnique({ where: { phone }, select: { role: true } });
      backOffice = existing !== null && isBackOffice(existing.role);
    }
    const perHour = otpRequestsPerHour({ demoMode: config.demoMode, phone, backOffice });
    if (Number.isFinite(perHour)) {
      const recent = await prisma.otpCode.count({
        where: { phone, createdAt: { gte: new Date(now.getTime() - 3600_000) } },
      });
      if (recent >= perHour)
        throw new AppError(429, 'OTP_RATE_LIMITED', 'Trop de demandes de code. Réessayez dans une heure.');
    }
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await prisma.otpCode.create({
      data: {
        phone,
        codeHash: hashCode(config.jwtSecret, phone, code),
        expiresAt: new Date(now.getTime() + config.otpTtlSeconds * 1000),
        createdAt: now,
      },
    });
    try {
      await ctx.sms.send(phone, `Yaar Livraison : votre code de connexion est ${code}. Il expire dans ${Math.round(config.otpTtlSeconds / 60)} min.`);
    } catch (err) {
      if (err instanceof OtpProviderNotConfiguredError) {
        req.log.error(err.message);
        throw new AppError(503, 'OTP_PROVIDER_UNAVAILABLE', 'L’envoi des codes de connexion est momentanément indisponible.');
      }
      throw err;
    }
    return { sent: true, expiresInSeconds: config.otpTtlSeconds };
  });

  /**
   * Vérifie le dernier code demandé pour ce numéro : l'essai est réservé atomiquement AVANT la comparaison
   * (5 essais par code, même en parallèle), puis le code est consommé (usage unique).
   * `alternateCode` : code d'accès démo des comptes de console, accepté à la place du code envoyé
   * (avec le même compteur d'essais : il faut d'abord demander un code).
   */
  async function consumeOtp(phone: string, code: string, now: Date, alternateCode?: string): Promise<void> {
    const otp = await prisma.otpCode.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: now } },
      // Dernier code demandé ; à la même milliseconde, l'identifiant (cuid, croissant) départage.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (!otp) throw new AppError(400, 'OTP_INVALID', INVALID_OR_EXPIRED);
    const reserved = await prisma.otpCode.updateMany({
      where: { id: otp.id, consumedAt: null, attempts: { lt: MAX_OTP_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (reserved.count === 0) throw new AppError(400, 'OTP_INVALID', INVALID_OR_EXPIRED);
    const expected = Buffer.from(otp.codeHash, 'hex');
    const given = Buffer.from(hashCode(config.jwtSecret, phone, code), 'hex');
    const matchesSent = timingSafeEqual(expected, given);
    const matchesAlternate = alternateCode !== undefined && sameCode(code, alternateCode);
    if (!matchesSent && !matchesAlternate) throw new AppError(400, 'OTP_INVALID', 'Code incorrect');
    // Usage unique, y compris en cas de requêtes simultanées avec le bon code.
    const consumed = await prisma.otpCode.updateMany({ where: { id: otp.id, consumedAt: null }, data: { consumedAt: now } });
    if (consumed.count === 0) throw new AppError(400, 'OTP_INVALID', INVALID_OR_EXPIRED);
  }

  app.post('/auth/otp/verify', async (req): Promise<AuthResponse> => {
    verifyLimiter.hit(req.ip);
    const input = parse(verifyOtpSchema, req.body);
    const now = clock.now();
    let user = await prisma.user.findUnique({ where: { phone: input.phone } });
    // Démonstration publique : le code 123456 n'ouvre jamais un compte de console existant (accès aux pièces
    // KYC) ; ces comptes utilisent DEMO_STAFF_CODE. Une inscription ne crée jamais un compte de console.
    const staffInDemo = config.demoMode && user !== null && isBackOffice(user.role);
    const bypass = config.otpDevBypass && !staffInDemo && sameCode(input.code, DEV_BYPASS_CODE);
    if (!bypass) await consumeOtp(input.phone, input.code, now, staffInDemo ? config.demoStaffCode : undefined);

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
