import type { FastifyReply } from 'fastify';
import { AppError } from './errors';

/** Signatures (« magic bytes ») des types de fichiers acceptés. */
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  'application/pdf': (b) => b.length > 5 && b.subarray(0, 5).toString('latin1') === '%PDF-',
};

/** Taille en Mo pour les messages (« 3 », « 5 », « 2,5 »). */
export function formatMegabytes(bytes: number): string {
  return String(Math.round((bytes / (1024 * 1024)) * 10) / 10).replace('.', ',');
}

/**
 * Décode un fichier base64 et vérifie que son contenu correspond au type déclaré.
 * `maxBytes` : `config.maxUploadBytes` (5 Mo ; 3 Mo sur Vercel).
 */
export function decodeUpload(dataBase64: string, mimeType: string, maxBytes: number): Buffer {
  const data = Buffer.from(dataBase64.replace(/\s/g, ''), 'base64');
  if (data.length === 0) throw new AppError(400, 'VALIDATION_ERROR', 'Fichier vide');
  if (data.length > maxBytes)
    throw new AppError(
      413,
      'PAYLOAD_TOO_LARGE',
      `Fichier trop volumineux (${formatMegabytes(maxBytes)} Mo maximum) : envoyez une photo plus légère.`,
    );
  const check = SIGNATURES[mimeType];
  if (!check || !check(data))
    throw new AppError(415, 'UNSUPPORTED_FILE', `Le contenu du fichier ne correspond pas au type ${mimeType}`);
  return data;
}

export function mimeFromKey(key: string): string {
  const ext = key.split('.').pop();
  return ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'pdf' ? 'application/pdf' : 'image/jpeg';
}

/** Envoie un fichier stocké avec des en-têtes sûrs (pas de cache, pas de détection de type). */
export function sendFile(reply: FastifyReply, data: Buffer, mimeType: string, filename: string): FastifyReply {
  return reply
    .header('Cache-Control', 'no-store')
    .header('X-Content-Type-Options', 'nosniff')
    .header('Content-Disposition', `inline; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`)
    .type(mimeType)
    .send(data);
}
