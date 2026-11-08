import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { notFound } from '../lib/errors';

/** Stockage de fichiers (pièces KYC, photos de preuve). */
export interface StorageProvider {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/**
 * Chiffrement des fichiers au repos. Avec une clé AES-256, chaque fichier est chiffré
 * (AES-256-GCM : iv 12 octets | tag 16 octets | contenu chiffré) ; sans clé (dev), il est stocké tel quel.
 */
export class FileCipher {
  private readonly key: Buffer | null;

  constructor(encryptionKeyHex?: string) {
    this.key = encryptionKeyHex ? Buffer.from(encryptionKeyHex, 'hex') : null;
  }

  encrypt(data: Buffer): Buffer {
    if (!this.key) return data;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(data), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), enc]);
  }

  decrypt(data: Buffer): Buffer {
    if (!this.key) return data;
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
  }
}

/** Clés de stockage : chemins relatifs simples (`kyc/<id>/cnib-123.png`), sans `..` ni chemin absolu. */
function assertValidKey(key: string): void {
  if (!key || key.startsWith('/') || key.includes('\\') || key.split('/').some((p) => p === '' || p === '.' || p === '..'))
    throw new Error('Clé de stockage invalide');
}

/** Stockage sur disque local (STORAGE_DRIVER=local, défaut hors Vercel). */
export class LocalDiskStorage implements StorageProvider {
  private readonly root: string;
  private readonly cipher: FileCipher;

  constructor(rootDir: string, encryptionKeyHex?: string) {
    this.root = path.resolve(rootDir);
    this.cipher = new FileCipher(encryptionKeyHex);
  }

  private resolve(key: string): string {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(this.root + path.sep)) throw new Error('Clé de stockage invalide');
    return p;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const p = this.resolve(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, this.cipher.encrypt(data));
  }

  async get(key: string): Promise<Buffer> {
    return this.cipher.decrypt(await readFile(this.resolve(key)));
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  /** Supprime tous les fichiers sous un préfixe (seed de démonstration). */
  async deletePrefix(prefix: string): Promise<void> {
    await rm(this.resolve(prefix), { recursive: true, force: true });
  }
}

/**
 * Stockage dans PostgreSQL (STORAGE_DRIVER=db) : table `StoredFile`, octets chiffrés par FileCipher
 * AVANT l'écriture en base (la base ne voit jamais une pièce KYC en clair). Adapté à Vercel, dont
 * le disque n'est pas persistant ; prévu pour les volumes du Lot 1 (quelques Mo par livreur).
 */
export class DbStorage implements StorageProvider {
  private readonly cipher: FileCipher;

  constructor(
    private readonly prisma: PrismaClient,
    encryptionKeyHex?: string,
  ) {
    this.cipher = new FileCipher(encryptionKeyHex);
  }

  async put(key: string, data: Buffer): Promise<void> {
    assertValidKey(key);
    const bytes = new Uint8Array(this.cipher.encrypt(data));
    await this.prisma.storedFile.upsert({
      where: { key },
      create: { key, data: bytes, sizeBytes: data.length },
      update: { data: bytes, sizeBytes: data.length },
    });
  }

  async get(key: string): Promise<Buffer> {
    assertValidKey(key);
    const row = await this.prisma.storedFile.findUnique({ where: { key } });
    if (!row) throw notFound('Fichier introuvable');
    return this.cipher.decrypt(Buffer.from(row.data));
  }

  async delete(key: string): Promise<void> {
    assertValidKey(key);
    await this.prisma.storedFile.deleteMany({ where: { key } });
  }

  async deletePrefix(prefix: string): Promise<void> {
    assertValidKey(prefix);
    await this.prisma.storedFile.deleteMany({ where: { key: { startsWith: `${prefix}/` } } });
  }
}

/** Fournisseur de stockage selon STORAGE_DRIVER. */
export function createStorage(
  config: { storageDriver: 'local' | 'db'; storageDir: string; storageEncryptionKey: string | undefined },
  prisma: PrismaClient,
): LocalDiskStorage | DbStorage {
  return config.storageDriver === 'db'
    ? new DbStorage(prisma, config.storageEncryptionKey)
    : new LocalDiskStorage(config.storageDir, config.storageEncryptionKey);
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
