import type { FileUploadInput } from '@yaar/shared';
import { base64Length, VERCEL_MAX_UPLOAD_BYTES } from '@yaar/shared/schemas';

/** Taille décodée (octets) d'une chaîne base64. */
export function base64DecodedSize(b64: string): number {
  const clean = b64.replace(/\s/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

/** Retire un éventuel préfixe `data:image/jpeg;base64,`. */
export function stripDataUrl(b64: string): string {
  const i = b64.indexOf('base64,');
  return i >= 0 ? b64.slice(i + 'base64,'.length) : b64;
}

/**
 * Plafond des photos envoyées par l'application, quel que soit le serveur : 3 Mo une fois décodées, soit
 * 4 Mo encodées en base64, sous la limite de 4,5 Mo des requêtes sur Vercel (au-delà, Vercel refuse la
 * requête avant même l'API). Les photos sont compressées (1280 px, JPEG 0,6) : quelques centaines de Ko.
 */
export const MAX_PHOTO_BYTES = VERCEL_MAX_UPLOAD_BYTES;
export const MAX_PHOTO_BASE64_LENGTH = base64Length(MAX_PHOTO_BYTES);

export class UploadTooLargeError extends Error {
  constructor() {
    super('Photo trop volumineuse (3 Mo maximum) : reprenez-la avec moins de détails ou choisissez une image plus légère.');
    this.name = 'UploadTooLargeError';
  }
}

/** Prépare un envoi ; vérifie la taille ENCODÉE (ce que transporte la requête) avant tout envoi. */
export function toFileUpload(base64: string, mimeType: FileUploadInput['mimeType'] = 'image/jpeg'): FileUploadInput {
  const dataBase64 = stripDataUrl(base64).replace(/\s/g, '');
  if (dataBase64.length > MAX_PHOTO_BASE64_LENGTH) throw new UploadTooLargeError();
  return { mimeType, dataBase64 };
}
