import { MAX_UPLOAD_BYTES, type FileUploadInput } from '@yaar/shared';

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

export class UploadTooLargeError extends Error {
  constructor() {
    super('Photo trop volumineuse (5 Mo maximum).');
    this.name = 'UploadTooLargeError';
  }
}

export function toFileUpload(base64: string, mimeType: FileUploadInput['mimeType'] = 'image/jpeg'): FileUploadInput {
  const dataBase64 = stripDataUrl(base64);
  if (base64DecodedSize(dataBase64) > MAX_UPLOAD_BYTES) throw new UploadTooLargeError();
  return { mimeType, dataBase64 };
}
