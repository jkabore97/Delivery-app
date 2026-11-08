import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetDb } from './helpers';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

/** Lance le seed comme le build Vercel (`--if-empty`), sur la base de test, sans accès réseau (ligne droite). */
async function seedIfEmpty(): Promise<string> {
  const { stdout } = await run('npx', ['tsx', 'prisma/seed.ts', '--if-empty'], {
    cwd: root,
    env: { ...process.env, ROUTING_PROVIDER: 'straight', NODE_ENV: 'test' },
    timeout: 120_000,
  });
  return stdout;
}

beforeAll(async () => {
  await resetDb(prisma);
});
afterAll(async () => {
  await resetDb(prisma);
  await prisma.$disconnect();
});

describe('seed de démonstration (modèle B2B)', () => {
  it('base vide : entreprises validées, livraisons dans tous les statuts, comptes existants conservés ; 2e passage sans effet', async () => {
    const out = await seedIfEmpty();
    expect(out).toContain('Base de démonstration créée');
    for (const phone of ['+22671000001', '+22671000002', '+22671000003', '+22671000004', '+22671000005']) expect(out).toContain(phone);
    expect(out).toMatch(/\/suivi\/[A-Za-z0-9_-]{24}/);

    // Comptes de console et livreurs inchangés.
    const users = await prisma.user.findMany({ include: { driverProfile: true } });
    const byPhone = new Map(users.map((u) => [u.phone, u]));
    expect(byPhone.get('+22670000001')?.role).toBe('ADMIN');
    expect(byPhone.get('+22670000002')?.role).toBe('CONTROLLER');
    for (let i = 1; i <= 7; i++) expect(byPhone.get(`+2267300000${i}`)?.role).toBe('DRIVER');
    expect(byPhone.get('+22673000001')?.driverProfile).toMatchObject({ isBusy: true, cashHeld: 38_500, vehicleType: 'MOTO' });
    expect(byPhone.get('+22673000005')?.driverProfile?.cashHeld).toBe(52_000);

    // Entreprises : 5 validées dans des quartiers différents + 1 en attente.
    const stores = await prisma.store.findMany({ include: { owner: true } });
    const approved = stores.filter((s) => s.approvalStatus === 'APPROVED');
    expect(approved).toHaveLength(5);
    expect(new Set(approved.map((s) => `${s.lat},${s.lng}`)).size).toBe(5);
    expect(approved.every((s) => s.owner.role === 'SELLER')).toBe(true);
    expect(stores.find((s) => s.approvalStatus === 'PENDING')?.owner.phone).toBe('+22671000009');
    expect(await prisma.product.count()).toBe(0);

    // Livraisons : toutes demandées par une entreprise (aucune commande de client), lien de suivi, destinataire.
    const orders = await prisma.order.findMany({ include: { client: true } });
    expect(orders.length).toBeGreaterThanOrEqual(6);
    expect(orders.every((o) => o.type === 'PARCEL' && o.feePaidBy !== null && o.client.role === 'SELLER')).toBe(true);
    expect(new Set(orders.map((o) => o.status))).toEqual(new Set(['SEARCHING_DRIVER', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'CANCELLED']));
    expect(new Set(orders.map((o) => o.trackingToken)).size).toBe(orders.length);
    expect(orders.every((o) => o.recipientName && o.recipientPhone?.startsWith('+226'))).toBe(true);
    expect(orders.some((o) => o.feePaidBy === 'RECIPIENT' && (o.cashToCollect ?? 0) > 0)).toBe(true);
    expect(orders.some((o) => o.feePaidBy === 'SENDER' && (o.cashToCollect ?? 0) > 0)).toBe(true);
    expect(orders.some((o) => o.recipientIsBusiness)).toBe(true);
    for (const o of orders.filter((x) => x.status === 'ASSIGNED' || x.status === 'PICKED_UP')) {
      expect(o.routeTarget).toBe(o.status === 'ASSIGNED' ? 'PICKUP' : 'DROPOFF');
      expect(o.routeSource).toBe('straight');
      expect(o.driverId).not.toBeNull();
    }
    // Montants dus aux entreprises = marchandise des livraisons livrées ; journal de caisse cohérent.
    for (const o of orders.filter((x) => x.status === 'DELIVERED')) {
      expect(o.owedToBusiness).toBe(o.cashToCollect);
      expect(o.cashCollected).toBe(o.total);
    }
    const profiles = await prisma.driverProfile.findMany();
    for (const p of profiles) {
      const last = await prisma.cashLedgerEntry.findFirst({ where: { driverId: p.userId }, orderBy: { balanceAfter: 'desc' } });
      if (last) expect(last.balanceAfter, p.userId).toBe(p.cashHeld);
    }

    // --if-empty : second passage sans rien créer ni effacer.
    const count = await prisma.user.count();
    expect(await seedIfEmpty()).toMatch(/Seed de démonstration ignoré/);
    expect(await prisma.user.count()).toBe(count);
  }, 240_000);
});
