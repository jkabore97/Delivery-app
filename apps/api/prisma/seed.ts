/**
 * Données de démonstration autour de Ouagadougou.
 *   npm run db:seed -w apps/api            ATTENTION : vide toutes les tables de la base visée par DATABASE_URL.
 *   npm run db:seed:if-empty -w apps/api   ne fait rien si la base contient déjà un utilisateur ; ne vide jamais
 *                                          (build Vercel avec SEED_DEMO=true).
 * Autorisé avec NODE_ENV=production seulement si DEMO_MODE=true (ou SEED_FORCE=true pour le mode qui vide).
 */
import 'dotenv/config';
import { PrismaClient, type OrderStatus, type VehicleType } from '@prisma/client';
import {
  DEFAULT_PRICING_RULES,
  computeDeliveryPrice,
  computeOrderTotals,
  roadDistanceKm,
  requiredDocuments,
} from '@yaar/shared';
import { loadConfig } from '../src/config';
import { createStorage } from '../src/providers/storage';

const IF_EMPTY = process.argv.includes('--if-empty');

/** Une seule connexion : le verrou consultatif de session (anti double seed) reste sur la même connexion. */
function singleConnectionUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.set('connection_limit', '1');
  return u.toString();
}

const config = loadConfig();
const prisma = new PrismaClient({ datasources: { db: { url: singleConnectionUrl(config.databaseUrl) } } });
const storage = createStorage(config, prisma);
const SEED_LOCK_KEY = 7_242_001;

/** Quartiers (coordonnées approximatives). */
const Q = {
  centre: { lat: 12.3686, lng: -1.5275, address: 'Avenue Kwame Nkrumah, centre-ville' },
  patteDOie: { lat: 12.3395, lng: -1.517, address: "Patte d'Oie, secteur 15" },
  zogona: { lat: 12.3805, lng: -1.4975, address: 'Zogona, près de l’université' },
  ouaga2000: { lat: 12.3226, lng: -1.4977, address: 'Ouaga 2000, avenue Mouammar Kadhafi' },
  gounghin: { lat: 12.364, lng: -1.556, address: 'Gounghin, rue de la mairie' },
  tampouy: { lat: 12.405, lng: -1.559, address: 'Tampouy, marché' },
  pissy: { lat: 12.34, lng: -1.57, address: 'Pissy, secteur 17' },
  dassasgho: { lat: 12.375, lng: -1.47, address: 'Dassasgho, route de Fada' },
  tanghin: { lat: 12.397, lng: -1.517, address: 'Tanghin, bord du barrage' },
} as const;

// PNG 1×1 utilisé comme pièce justificative factice.
const FAKE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function wipe(): Promise<void> {
  const tables = [
    'StoredFile', 'JobLease', 'OrderMessage', 'PushToken', 'AuditLog', 'Rating', 'Incident', 'CashLedgerEntry', 'DispatchOffer', 'OrderEvent', 'OrderItem', 'Order',
    'SavedAddress', 'Product', 'Store', 'LocationPing', 'DriverDocument', 'DriverProfile', 'OtpCode', 'PricingRule', 'User',
  ];
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "Order_number_seq" RESTART WITH 1001`);
}

async function main(): Promise<void> {
  if (IF_EMPTY) {
    if (config.nodeEnv === 'production' && !config.demoMode)
      throw new Error('Seed de démonstration interdit en production sans DEMO_MODE=true.');
    // Deux builds simultanés : un seul seed (verrou consultatif de session, connexion unique).
    await prisma.$executeRawUnsafe(`SELECT pg_advisory_lock(${SEED_LOCK_KEY})`);
    try {
      const users = await prisma.user.count();
      if (users > 0) {
        console.info(`Seed de démonstration ignoré : la base contient déjà ${users} utilisateur(s).`);
        return;
      }
      console.info('Base vide : création des données de démonstration (sans effacement).');
      await seed();
    } finally {
      await prisma.$executeRawUnsafe(`SELECT pg_advisory_unlock(${SEED_LOCK_KEY})`);
    }
    return;
  }
  if (config.nodeEnv === 'production' && process.env.SEED_FORCE !== 'true')
    throw new Error('Seed interdit en production (il vide la base). Forcer avec SEED_FORCE=true.');
  await wipe();
  // Les fichiers des exécutions précédentes (pièces KYC, preuves, photos) ne sont plus référencés.
  for (const dir of ['kyc', 'proofs', 'products']) await storage.deletePrefix(dir);
  await seed();
}

async function seed(): Promise<void> {
  // Base vide (aucune commande) : la numérotation des commandes démarre à 1001.
  if ((await prisma.order.count()) === 0) await prisma.$executeRawUnsafe(`ALTER SEQUENCE "Order_number_seq" RESTART WITH 1001`);
  const now = new Date();
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

  for (const r of DEFAULT_PRICING_RULES)
    await prisma.pricingRule.upsert({ where: { vehicleType: r.vehicleType }, create: r, update: {} });

  /* ---------------- Console ---------------- */
  const admin = await prisma.user.create({ data: { phone: '+22670000001', name: 'Admin Yaar', role: 'ADMIN' } });
  const controller = await prisma.user.create({ data: { phone: '+22670000002', name: 'Salif K.', role: 'CONTROLLER' } });

  /* ---------------- Vendeurs et menus ---------------- */
  const sellersSpec = [
    {
      phone: '+22671000001', name: 'Awa Ouédraogo',
      store: { name: 'Le Verdoyant', ...Q.centre, landmark: 'En face de la BCEAO', description: 'Cuisine burkinabè et grillades', commissionPercent: 10, prepTimeMinutes: 15, openingHours: 'Lun-Dim 10h-23h' },
      products: [
        { name: 'Riz gras poulet', category: 'Plats', price: 2500, description: 'Riz gras, cuisse de poulet, légumes' },
        { name: 'Poulet bicyclette braisé', category: 'Grillades', price: 5000, description: 'Poulet entier braisé, attiéké ou frites' },
        { name: 'Tô sauce gombo', category: 'Plats', price: 1500, description: 'Tô de maïs, sauce gombo et viande' },
        { name: 'Bissap 50 cl', category: 'Boissons', price: 500 },
        { name: 'Jus de gingembre 50 cl', category: 'Boissons', price: 500 },
      ],
    },
    {
      phone: '+22671000002', name: 'Moussa Sawadogo',
      store: { name: 'Maquis Chez Tanti', ...Q.gounghin, landmark: 'Derrière la pharmacie de Gounghin', description: 'Maquis familial', commissionPercent: 10, prepTimeMinutes: 20, openingHours: 'Lun-Sam 11h-22h' },
      products: [
        { name: 'Tô sauce feuille', category: 'Plats', price: 1000 },
        { name: 'Riz sauce arachide', category: 'Plats', price: 1500 },
        { name: 'Poulet bicyclette (demi)', category: 'Grillades', price: 3000 },
        { name: 'Bissap glacé 1 L', category: 'Boissons', price: 1000 },
        { name: 'Dêguê', category: 'Desserts', price: 750, isAvailable: false },
      ],
    },
    {
      phone: '+22671000003', name: 'Rasmata Kaboré',
      store: { name: 'Saveurs de Zogona', ...Q.zogona, landmark: 'À côté du kiosque Orange', description: 'Fast-food et plats du jour', commissionPercent: 12, prepTimeMinutes: 12, openingHours: 'Tous les jours 9h-21h' },
      products: [
        { name: 'Riz gras mouton', category: 'Plats', price: 2000 },
        { name: 'Brochettes de bœuf (x5)', category: 'Grillades', price: 1500 },
        { name: 'Alloco', category: 'Accompagnements', price: 500 },
        { name: 'Bissap 50 cl', category: 'Boissons', price: 400 },
      ],
    },
    {
      phone: '+22671000004', name: 'Boukary Compaoré',
      store: { name: 'Alimentation Wend-Panga', ...Q.tampouy, landmark: 'Entrée principale du marché', description: 'Épicerie et produits de première nécessité', commissionPercent: 8, prepTimeMinutes: 10, openingHours: 'Lun-Dim 7h-21h', isOpen: false },
      products: [
        { name: 'Sac de riz 5 kg', category: 'Épicerie', price: 3500 },
        { name: 'Huile 1 L', category: 'Épicerie', price: 1300 },
        { name: 'Eau minérale 1,5 L (x6)', category: 'Boissons', price: 2400 },
      ],
    },
  ];
  const stores: Record<string, { id: string; ownerId: string; lat: number; lng: number; address: string; landmark: string; commissionPercent: number; products: Array<{ id: string; name: string; price: number }> }> = {};
  for (const s of sellersSpec) {
    const owner = await prisma.user.create({ data: { phone: s.phone, name: s.name, role: 'SELLER' } });
    const { isOpen, ...storeData } = { isOpen: true, ...s.store };
    const store = await prisma.store.create({
      data: { ...storeData, isOpen, ownerId: owner.id, phone: s.phone, approvalStatus: 'APPROVED', approvedAt: minutesAgo(60 * 24 * 60) },
    });
    const products = [];
    for (const p of s.products) products.push(await prisma.product.create({ data: { ...p, storeId: store.id } }));
    stores[store.name] = { ...store, products };
  }
  // Une boutique en attente de validation (file « boutiques à valider » de la console).
  const pendingOwner = await prisma.user.create({ data: { phone: '+22671000009', name: 'Issa Compaoré', role: 'SELLER' } });
  const pendingStore = await prisma.store.create({
    data: {
      ownerId: pendingOwner.id, name: 'Grillades de Pissy', ...Q.pissy, landmark: 'À côté du marché de Pissy',
      description: 'Brochettes et poulet bicyclette', phone: pendingOwner.phone, isOpen: false, approvalStatus: 'PENDING',
    },
  });
  await prisma.product.create({ data: { storeId: pendingStore.id, name: 'Poulet bicyclette braisé', category: 'Grillades', price: 4500 } });

  /* ---------------- Clients ---------------- */
  const aminata = await prisma.user.create({ data: { phone: '+22672000001', name: 'Aminata K.', role: 'CLIENT' } });
  const paul = await prisma.user.create({ data: { phone: '+22672000002', name: 'Paul T.', role: 'CLIENT' } });
  const mariam = await prisma.user.create({ data: { phone: '+22672000003', name: 'Mariam O.', role: 'CLIENT' } });
  await prisma.savedAddress.create({
    data: { userId: aminata.id, label: 'Maison', ...Q.patteDOie, landmark: 'Derrière la station Total, portail bleu' },
  });

  /* ---------------- Livreurs ---------------- */
  async function createDriver(spec: {
    phone: string; name: string; vehicleType: VehicleType; plate?: string; status: 'APPROVED' | 'PENDING';
    online?: { lat: number; lng: number }; cashHeld?: number; skipDocs?: Array<'SELFIE' | 'ASSURANCE'>;
  }) {
    const user = await prisma.user.create({ data: { phone: spec.phone, name: spec.name, role: 'DRIVER' } });
    await prisma.driverProfile.create({
      data: {
        userId: user.id,
        vehicleType: spec.vehicleType,
        plate: spec.plate ?? null,
        status: spec.status,
        approvedAt: spec.status === 'APPROVED' ? minutesAgo(60 * 24 * 30) : null,
        approvedById: spec.status === 'APPROVED' ? controller.id : null,
        isOnline: !!spec.online,
        lastLat: spec.online?.lat ?? null,
        lastLng: spec.online?.lng ?? null,
        lastLocationAt: spec.online ? minutesAgo(1) : null,
        onlineSince: spec.online ? minutesAgo(30) : null,
        trackingConsentAt: spec.status === 'APPROVED' ? minutesAgo(60 * 24 * 30) : null,
        cashHeld: spec.cashHeld ?? 0,
      },
    });
    for (const type of requiredDocuments(spec.vehicleType)) {
      if (spec.skipDocs?.includes(type as 'SELFIE' | 'ASSURANCE')) continue;
      const key = `kyc/${user.id}/${type.toLowerCase()}-seed.png`;
      await storage.put(key, FAKE_PNG);
      await prisma.driverDocument.create({
        data: {
          driverId: user.id,
          type,
          storageKey: key,
          mimeType: 'image/png',
          sizeBytes: FAKE_PNG.length,
          expiresAt: type === 'ASSURANCE' ? new Date(now.getFullYear() + 1, 2, 31) : null,
        },
      });
    }
    if (spec.online) {
      await prisma.locationPing.create({ data: { driverId: user.id, lat: spec.online.lat, lng: spec.online.lng } });
    }
    return user;
  }

  const issouf = await createDriver({ phone: '+22673000001', name: 'Issouf S.', vehicleType: 'MOTO', plate: '11 JJ 4521', status: 'APPROVED', online: { lat: 12.3602, lng: -1.5248 }, cashHeld: 38_500 });
  const karim = await createDriver({ phone: '+22673000002', name: 'Karim D.', vehicleType: 'MOTO', plate: '11 KM 1187', status: 'APPROVED', online: { lat: 12.3985, lng: -1.5190 } });
  await createDriver({ phone: '+22673000003', name: 'Fatimata Z.', vehicleType: 'BIKE', status: 'APPROVED', online: { lat: 12.3790, lng: -1.5010 } });
  await createDriver({ phone: '+22673000004', name: 'Abdoul T.', vehicleType: 'CAR', plate: '11 HH 0917', status: 'APPROVED', online: { lat: 12.3300, lng: -1.5000 } });
  await createDriver({ phone: '+22673000005', name: 'Adama N.', vehicleType: 'MOTO', plate: '11 LL 3090', status: 'APPROVED', cashHeld: 52_000 });
  await createDriver({ phone: '+22673000006', name: 'Ousmane B.', vehicleType: 'MOTO', plate: '11 KM 2280', status: 'PENDING' });
  await createDriver({ phone: '+22673000007', name: 'Rasmané P.', vehicleType: 'BIKE', status: 'PENDING', skipDocs: ['SELFIE'] });

  /* ---------------- Commandes ---------------- */
  const rules = new Map(DEFAULT_PRICING_RULES.map((r) => [r.vehicleType, r]));

  async function createOrder(spec: {
    client: { id: string };
    store?: (typeof stores)[string];
    items?: Array<[number, number]>; // [index produit, quantité]
    pickup?: { lat: number; lng: number; address: string; landmark?: string };
    dropoff: { lat: number; lng: number; address: string; landmark?: string };
    vehicleType: VehicleType;
    path: OrderStatus[];
    driver?: { id: string };
    createdMinutesAgo: number;
    parcelDescription?: string;
  }) {
    const pickup = spec.store
      ? { lat: spec.store.lat, lng: spec.store.lng, address: spec.store.address, landmark: spec.store.landmark }
      : { landmark: '', ...spec.pickup! };
    const distanceKm = roadDistanceKm(pickup, spec.dropoff);
    const items = (spec.items ?? []).map(([i, q]) => {
      const p = spec.store!.products[i]!;
      return { productId: p.id, name: p.name, unitPrice: p.price, quantity: q };
    });
    const itemsTotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const price = computeDeliveryPrice(rules.get(spec.vehicleType)!, distanceKm);
    const totals = computeOrderTotals(price, itemsTotal, spec.store?.commissionPercent ?? 0);
    const status = spec.path[spec.path.length - 1]!;
    const created = minutesAgo(spec.createdMinutesAgo);
    const at = (i: number) => new Date(created.getTime() + i * 4 * 60_000);
    const idx = (s: OrderStatus) => spec.path.indexOf(s);
    const tsFor = (s: OrderStatus) => (idx(s) >= 0 ? at(idx(s)) : null);
    const order = await prisma.order.create({
      data: {
        type: spec.store ? 'FOOD' : 'PARCEL',
        status,
        clientId: spec.client.id,
        storeId: spec.store?.id ?? null,
        driverId: spec.driver?.id ?? null,
        vehicleType: spec.vehicleType,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        pickupAddress: pickup.address,
        pickupLandmark: pickup.landmark ?? '',
        dropoffLat: spec.dropoff.lat,
        dropoffLng: spec.dropoff.lng,
        dropoffAddress: spec.dropoff.address,
        dropoffLandmark: spec.dropoff.landmark ?? '',
        parcelDescription: spec.parcelDescription ?? null,
        distanceKm,
        ...totals,
        paymentStatus: status === 'DELIVERED' ? 'PAID' : status === 'CANCELLED' ? 'CANCELLED' : 'PENDING',
        cashCollected: status === 'DELIVERED' ? totals.total : null,
        deliveryCode: String(1000 + Math.floor(Math.random() * 9000)),
        prepTimeMinutes: spec.store ? 15 : null,
        createdAt: created,
        acceptedAt: tsFor('ACCEPTED'),
        readyAt: tsFor('READY'),
        searchingSince: tsFor('SEARCHING_DRIVER'),
        assignedAt: tsFor('ASSIGNED'),
        pickedUpAt: tsFor('PICKED_UP'),
        deliveredAt: tsFor('DELIVERED'),
        items: { create: items },
      },
    });
    let prev: OrderStatus | null = null;
    for (let i = 0; i < spec.path.length; i++) {
      const s = spec.path[i]!;
      await prisma.orderEvent.create({ data: { orderId: order.id, fromStatus: prev, toStatus: s, createdAt: at(i) } });
      prev = s;
    }
    return order;
  }

  const FULL: OrderStatus[] = ['PENDING', 'ACCEPTED', 'READY', 'SEARCHING_DRIVER', 'ASSIGNED', 'PICKED_UP', 'DELIVERED'];

  // Livrée hier (encaissement espèces par Issouf).
  const delivered = await createOrder({
    client: aminata, store: stores['Le Verdoyant']!, items: [[0, 2], [3, 1]],
    dropoff: { ...Q.patteDOie, landmark: 'Derrière la station Total, portail bleu' },
    vehicleType: 'MOTO', path: FULL, driver: issouf, createdMinutesAgo: 60 * 20,
  });
  await prisma.cashLedgerEntry.create({
    data: { driverId: issouf.id, type: 'COLLECTION', amount: delivered.total, balanceAfter: 38_500, orderId: delivered.id, note: `Encaissement commande #${delivered.number}`, createdAt: delivered.deliveredAt! },
  });
  await prisma.rating.create({ data: { orderId: delivered.id, fromUserId: aminata.id, toUserId: issouf.id, score: 5, comment: 'Rapide et poli' } });

  // Nouvelle commande en attente du vendeur.
  await createOrder({
    client: aminata, store: stores['Le Verdoyant']!, items: [[0, 2], [3, 1]],
    dropoff: { ...Q.patteDOie, landmark: 'Derrière la station Total, portail bleu' },
    vehicleType: 'MOTO', path: ['PENDING'], createdMinutesAgo: 1,
  });
  // En préparation.
  await createOrder({
    client: paul, store: stores['Le Verdoyant']!, items: [[1, 1]],
    dropoff: { ...Q.zogona, landmark: 'Cité universitaire, pavillon B' },
    vehicleType: 'MOTO', path: ['PENDING', 'ACCEPTED'], createdMinutesAgo: 8,
  });
  // En livraison par Issouf (Ouaga 2000).
  await createOrder({
    client: mariam, store: stores['Maquis Chez Tanti']!, items: [[0, 3]],
    dropoff: { ...Q.ouaga2000, landmark: 'Villa 12, portail noir' },
    vehicleType: 'MOTO', path: ['PENDING', 'ACCEPTED', 'READY', 'SEARCHING_DRIVER', 'ASSIGNED', 'PICKED_UP'], driver: issouf, createdMinutesAgo: 30,
  });
  await prisma.driverProfile.update({ where: { userId: issouf.id }, data: { isBusy: true } });
  // Colis en recherche de livreur : Zogona -> Tampouy (vélo).
  await createOrder({
    client: paul, pickup: { ...Q.zogona, landmark: 'Boutique Faso Dan Fani' },
    dropoff: { ...Q.tampouy, landmark: 'Près de la mosquée' },
    vehicleType: 'BIKE', path: ['PENDING', 'SEARCHING_DRIVER'], createdMinutesAgo: 6, parcelDescription: 'Enveloppe de documents',
  });
  // Colis voiture Dassasgho -> Pissy en recherche.
  await createOrder({
    client: mariam, pickup: { ...Q.dassasgho, landmark: 'Quincaillerie du rond-point' },
    dropoff: { ...Q.pissy, landmark: 'Face à l’école primaire' },
    vehicleType: 'CAR', path: ['PENDING', 'SEARCHING_DRIVER'], createdMinutesAgo: 3, parcelDescription: 'Carton de vaisselle (fragile)',
  });
  // Annulée.
  await createOrder({
    client: aminata, store: stores['Saveurs de Zogona']!, items: [[0, 1]],
    dropoff: { ...Q.tanghin }, vehicleType: 'BIKE', path: ['PENDING', 'CANCELLED'], createdMinutesAgo: 90,
  });

  /* ---------------- Incidents ---------------- */
  await prisma.incident.create({
    data: { type: 'DISPUTE', reporterId: aminata.id, orderId: delivered.id, description: 'Colis endommagé à la livraison' },
  });
  await prisma.incident.create({
    data: { type: 'SOS', reporterId: karim.id, lat: 12.3985, lng: -1.519, description: 'Crevaison, besoin d’assistance' },
  });

  console.info('Base de démonstration créée.');
  console.info('Connexion (OTP 123456 si OTP_DEV_BYPASS=true ou DEMO_MODE=true ; avec DEMO_MODE=true, les comptes');
  console.info('de console utilisent DEMO_STAFF_CODE, après « Recevoir le code ») :');
  console.info(`  Admin       ${admin.phone}`);
  console.info(`  Contrôleur  ${controller.phone}`);
  console.info('  Vendeurs    +22671000001 (Le Verdoyant), +22671000002, +22671000003, +22671000004, +22671000009 (boutique à valider)');
  console.info('  Clients     +22672000001 (Aminata), +22672000002, +22672000003');
  console.info('  Livreurs    +22673000001 (moto, en course), +22673000002 (moto), +22673000003 (vélo), +22673000004 (voiture)');
  console.info('              +22673000005 (au plafond d’espèces), +22673000006 et +22673000007 (dossiers en attente)');
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
