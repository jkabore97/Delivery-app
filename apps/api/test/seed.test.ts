import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ManualClock } from '../src/lib/clock';
import { projectOnPolyline } from '../src/lib/geo';
import { startOfDayUtc } from '../src/lib/time';
import {
  DEMO_ACCOUNT_PHONES,
  DEMO_RESET_SETTING_KEY,
  DEMO_SIMULATED_DRIVER_PHONES,
  decideDemoReset,
  isLocalDatabaseUrl,
  seededDeliveryAges,
  wipeRefusal,
} from '../src/services/demo';
import { DEMO_MOTION_STEP_MS } from '../src/services/demoMotion';
import { currentRoute } from '../src/services/routes';
import { createTestApp, resetDb } from './helpers';

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

/** Lance `prisma/seed.ts` (base de test sauf `env.DATABASE_URL`) ; code de sortie et sorties standard réunies. */
async function runSeed(args: string[], env: Record<string, string> = {}, drop: string[] = []): Promise<{ code: number; out: string }> {
  const childEnv: Record<string, string | undefined> = { ...process.env, ROUTING_PROVIDER: 'straight', NODE_ENV: 'test', ...env };
  for (const k of ['DEMO_RESET_ID', 'SEED_DEMO', 'SEED_FORCE', 'DEMO_MODE', ...drop]) if (!(k in env)) delete childEnv[k];
  try {
    const { stdout, stderr } = await run('npx', ['tsx', 'prisma/seed.ts', ...args], { cwd: root, env: childEnv, timeout: 120_000 });
    return { code: 0, out: stdout + stderr };
  } catch (e) {
    const err = e as { code?: unknown; stdout?: string; stderr?: string };
    return { code: typeof err.code === 'number' ? err.code : 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

const demoReset = (id: string, over: Record<string, string> = {}) =>
  runSeed(['--demo-reset'], { DEMO_RESET_ID: id, DEMO_MODE: 'true', SEED_DEMO: 'true', ...over });
const SENTINEL = '+22679999999';
const appliedId = async () => (await prisma.appSetting.findUnique({ where: { key: DEMO_RESET_SETTING_KEY } }))?.value ?? null;
const hasSentinel = async () => (await prisma.user.count({ where: { phone: SENTINEL } })) === 1;

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
    // Liste des comptes de démonstration (exemptés du plafond de codes en DEMO_MODE) = exactement les comptes créés.
    expect(new Set(users.map((u) => u.phone))).toEqual(DEMO_ACCOUNT_PHONES);
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

    // Livraisons déjà livrées : l'une hier, l'autre aujourd'hui (jour UTC du seed), quelle que soit l'heure du seed.
    const seededAt = byPhone.get('+22670000001')!.createdAt;
    const dayStart = startOfDayUtc(seededAt).getTime();
    const done = await prisma.order.findMany({ where: { status: 'DELIVERED' }, include: { store: true } });
    expect(done.find((o) => o.store?.name === 'Kaya Market')!.deliveredAt!.getTime()).toBeLessThan(dayStart);
    if (seededAt.getTime() - dayStart >= 60_000)
      expect(done.find((o) => o.store?.name === 'Pharmacie du Progrès')!.deliveredAt!.getTime()).toBeGreaterThanOrEqual(dayStart);

    // --if-empty : second passage sans rien créer ni effacer.
    const count = await prisma.user.count();
    expect(await seedIfEmpty()).toMatch(/Seed de démonstration ignoré/);
    expect(await prisma.user.count()).toBe(count);

    // Démonstration : les deux livreurs du seed en course avancent dès le premier pas (les positions du seed ne comptent pas
    // comme un GPS réel récent) ; Karim et les autres livreurs ne bougent pas.
    const inProgress = await prisma.order.findMany({ where: { status: { in: ['ASSIGNED', 'PICKED_UP'] } }, include: { driver: true } });
    expect(new Set(inProgress.map((o) => o.driver?.phone))).toEqual(new Set(DEMO_SIMULATED_DRIVER_PHONES));
    const demo = await createTestApp({ DEMO_MODE: 'true', REALTIME_MODE: 'poll' }, { clock: new ManualClock(new Date(Date.now() + 60_000)) });
    try {
      const before = await prisma.driverProfile.findMany({ include: { user: true } });
      expect(await demo.ctx.demoMotion.step()).toEqual({ moved: 2, realGps: 0, waitingForRoute: 0 });
      const stepAt = Math.floor(demo.clock.now().getTime() / DEMO_MOTION_STEP_MS) * DEMO_MOTION_STEP_MS;
      for (const p of await prisma.driverProfile.findMany({ include: { user: true } })) {
        const prev = before.find((b) => b.userId === p.userId)!;
        const job = inProgress.find((o) => o.driverId === p.userId);
        if (!job) {
          expect(p, p.user.phone).toEqual(prev);
          continue;
        }
        expect(p.lastLocationAt?.getTime()).toBe(stepAt);
        expect([p.lastLat, p.lastLng]).not.toEqual([prev.lastLat, prev.lastLng]);
        expect(projectOnPolyline(currentRoute(job)!.points, { lat: p.lastLat!, lng: p.lastLng! }).distanceM).toBeLessThan(1);
      }
      expect(await prisma.order.count({ where: { status: { in: ['ASSIGNED', 'PICKED_UP'] } } })).toBe(2);
    } finally {
      await demo.app.close();
      await demo.prisma.$disconnect();
    }
  }, 240_000);

  it('livraisons déjà livrées : hier et aujourd’hui au sens du jour UTC, quelle que soit l’heure du seed', () => {
    const day = Date.UTC(2026, 10, 9);
    // Parcours complet du seed : livrée 16 min après sa création.
    const deliveredAt = (now: Date, minutesAgo: number) => now.getTime() - minutesAgo * 60_000 + 16 * 60_000;
    for (const minutes of [0.5, 1, 5, 16, 17, 17.5, 18, 60, 164, 165, 180, 196, 600, 1020, 1184, 1185, 1200, 1439.9]) {
      const now = new Date(day + minutes * 60_000);
      const ages = seededDeliveryAges(now);
      const yesterday = deliveredAt(now, ages.yesterdayMinutesAgo);
      const today = deliveredAt(now, ages.todayMinutesAgo);
      expect(yesterday, `${minutes} min`).toBeLessThan(day);
      expect(yesterday, `${minutes} min`).toBeGreaterThanOrEqual(day - 24 * 3600_000);
      if (minutes >= 1) expect(today, `${minutes} min`).toBeGreaterThanOrEqual(day);
      expect(today, `${minutes} min`).toBeLessThanOrEqual(now.getTime() - 60_000);
    }
    // En journée : 20 h et 3 h plus tôt, comme avant.
    expect(seededDeliveryAges(new Date(day + 12 * 3600_000))).toEqual({ yesterdayMinutesAgo: 1200, todayMinutesAgo: 180 });
  });

  it('livreurs simulés en démonstration : Issouf et Abdoul seulement (jamais Karim), comptes du seed', () => {
    expect(DEMO_SIMULATED_DRIVER_PHONES).toEqual(['+22673000001', '+22673000004']);
    expect(DEMO_SIMULATED_DRIVER_PHONES).not.toContain('+22673000002');
    for (const phone of DEMO_SIMULATED_DRIVER_PHONES) expect(DEMO_ACCOUNT_PHONES.has(phone)).toBe(true);
  });
});

describe('réinitialisation de la démo (DEMO_RESET_ID, build Vercel)', () => {
  it('décision : seulement avec DEMO_MODE=true et SEED_DEMO=true, une fois par identifiant', () => {
    const base = { resetId: 'nov-9', demoMode: true, seedDemo: true, lastAppliedId: null };
    expect(decideDemoReset(base)).toMatchObject({ action: 'reset', resetId: 'nov-9', reason: expect.stringContaining('première') });
    expect(decideDemoReset({ ...base, lastAppliedId: 'nov-1' })).toMatchObject({ action: 'reset', reason: expect.stringContaining('nov-1') });
    expect(decideDemoReset({ ...base, lastAppliedId: 'nov-9' })).toMatchObject({ action: 'skip' });
    expect(decideDemoReset({ ...base, resetId: '  nov-9 ', lastAppliedId: 'nov-9' })).toMatchObject({ action: 'skip' });
    expect(decideDemoReset({ ...base, resetId: undefined })).toMatchObject({ action: 'skip' });
    expect(decideDemoReset({ ...base, resetId: '   ' })).toMatchObject({ action: 'skip' });
    expect(decideDemoReset({ ...base, demoMode: false })).toMatchObject({ action: 'refuse', reason: expect.stringContaining('DEMO_MODE') });
    expect(decideDemoReset({ ...base, seedDemo: false })).toMatchObject({ action: 'refuse', reason: expect.stringContaining('SEED_DEMO') });
    // Sans DEMO_MODE : refus même si l'identifiant est déjà appliqué ou nouveau.
    expect(decideDemoReset({ ...base, demoMode: false, lastAppliedId: 'nov-9' }).action).toBe('refuse');
  });

  it('nouvel identifiant : base vidée puis démo B2B ; même identifiant : rien ; sans DEMO_MODE ou SEED_DEMO : refus', async () => {
    await resetDb(prisma);
    await prisma.user.create({ data: { phone: SENTINEL, role: 'CLIENT', name: 'Ancienne donnée' } });

    const first = await demoReset('reset-1');
    expect(first.code, first.out).toBe(0);
    expect(first.out).toMatch(/première réinitialisation/);
    expect(await hasSentinel()).toBe(false);
    expect(await prisma.store.count({ where: { name: 'Kaya Market' } })).toBe(1);
    expect(await appliedId()).toBe('reset-1');

    // Même identifiant (redéploiement) : aucune modification.
    await prisma.user.create({ data: { phone: SENTINEL, role: 'CLIENT' } });
    const again = await demoReset('reset-1');
    expect(again.code, again.out).toBe(0);
    expect(again.out).toMatch(/rien à faire/);
    expect(await hasSentinel()).toBe(true);

    // Refusée (et rien n'est effacé) sans DEMO_MODE=true ou sans SEED_DEMO=true.
    const refusedEnvs: Array<Record<string, string>> = [{ DEMO_MODE: 'false' }, { SEED_DEMO: 'false' }];
    for (const over of refusedEnvs) {
      const refused = await demoReset('reset-2', over);
      expect(refused.code, JSON.stringify(over)).not.toBe(0);
      expect(refused.out).toMatch(/Réinitialisation de la démo refusée/);
    }
    expect(await hasSentinel()).toBe(true);
    expect(await appliedId()).toBe('reset-1');

    // Nouvel identifiant : nouvelle réinitialisation.
    const second = await demoReset('reset-2');
    expect(second.code, second.out).toBe(0);
    expect(second.out).toMatch(/nouvel identifiant « reset-2 » \(précédent : « reset-1 »\)/);
    expect(await hasSentinel()).toBe(false);
    expect(await appliedId()).toBe('reset-2');
    expect(await prisma.order.count()).toBeGreaterThanOrEqual(6);

    // Même identifiant sur une base vide (données effacées à la main) : la démo est recréée, sans autre effacement.
    await prisma.$executeRawUnsafe('TRUNCATE "User", "PricingRule", "StoredFile", "JobLease" CASCADE');
    const empty = await demoReset('reset-2');
    expect(empty.code, empty.out).toBe(0);
    expect(empty.out).toMatch(/Base vide : création des données de démonstration/);
    expect(await prisma.user.count()).toBe(DEMO_ACCOUNT_PHONES.size);
  }, 240_000);
});

describe('garde-fou du seed qui vide la base', () => {
  it('base locale seulement, sauf SEED_FORCE=true ; jamais en production sans SEED_FORCE', () => {
    for (const url of [
      'postgresql://postgres:postgres@localhost:5433/yaar_dev?schema=public',
      'postgresql://postgres@127.0.0.1/yaar',
      'postgresql://postgres@[::1]:5432/yaar',
      'postgresql://postgres@localhost/yaar?host=/var/run/postgresql', // socket Unix (forme documentée par Prisma)
      'postgresql:///yaar?host=/var/run/postgresql',
    ])
      expect(isLocalDatabaseUrl(url), url).toBe(true);
    const neon = 'postgresql://neondb_owner:s3cr3t@ep-cool-123.eu-central-1.aws.neon.tech/neondb?sslmode=require';
    for (const url of [neon, 'postgresql://postgres@db:5432/yaar', 'postgresql://u@10.0.0.5/yaar', 'pas une url'])
      expect(isLocalDatabaseUrl(url), url).toBe(false);
    const local = 'postgresql://postgres:postgres@localhost:5433/yaar_dev';
    expect(wipeRefusal({ nodeEnv: 'development', databaseUrl: local, seedForce: false })).toBeNull();
    const remote = wipeRefusal({ nodeEnv: 'development', databaseUrl: neon, seedForce: false });
    expect(remote).toMatch(/base distante \(ep-cool-123\.eu-central-1\.aws\.neon\.tech\)/);
    expect(remote).not.toContain('s3cr3t');
    expect(wipeRefusal({ nodeEnv: 'production', databaseUrl: local, seedForce: false })).toMatch(/production/);
    expect(wipeRefusal({ nodeEnv: 'production', databaseUrl: neon, seedForce: true })).toBeNull();
  });

  it('npm run db:seed sur une base distante : refusé avant toute connexion', async () => {
    const r = await runSeed([], { DATABASE_URL: 'postgresql://postgres:postgres@db.example.test:5432/yaar?schema=public' });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/Seed interdit sur une base distante \(db\.example\.test\)/);
    expect(r.out).not.toMatch(/Base de démonstration créée/);
  }, 120_000);
});
