import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Stockage de fichiers (pièces KYC, photos de preuve). */
export interface StorageProvider {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/**
 * Stockage sur disque local. Si une clé AES-256 est fournie, chaque fichier est chiffré
 * (AES-256-GCM : iv 12 octets | tag 16 octets | contenu chiffré).
 */
export class LocalDiskStorage implements StorageProvider {
  private readonly root: string;
  private readonly key: Buffer | null;

  constructor(rootDir: string, encryptionKeyHex?: string) {
    this.root = path.resolve(rootDir);
    this.key = encryptionKeyHex ? Buffer.from(encryptionKeyHex, 'hex') : null;
  }

  private resolve(key: string): string {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(this.root + path.sep)) throw new Error('Clé de stockage invalide');
    return p;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const p = this.resolve(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, this.encrypt(data));
  }

  async get(key: string): Promise<Buffer> {
    return this.decrypt(await readFile(this.resolve(key)));
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  private encrypt(data: Buffer): Buffer {
    if (!this.key) return data;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(data), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), enc]);
  }

  private decrypt(data: Buffer): Buffer {
    if (!this.key) return data;
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
  }
}

export function extensionFor(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'application/pdf':
      return 'pdf';
    default:
      return 'bin';
  }
}
