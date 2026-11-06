import type { ErrorCode } from '@yaar/shared';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: Record<string, string[]>) =>
  new AppError(400, 'VALIDATION_ERROR', message, details);
export const unauthenticated = (message = 'Authentification requise') => new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'Accès refusé') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Ressource introuvable') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message: string, code: ErrorCode = 'CONFLICT') => new AppError(409, code, message);
