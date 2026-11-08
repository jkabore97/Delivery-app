/**
 * Données de démonstration autour de Ouagadougou (modèle B2B : des entreprises font livrer des colis à des
 * destinataires sans compte, qui suivent le livreur par un lien public).
 *   npm run db:seed -w apps/api            ATTENTION : vide toutes les tables de la base visée par DATABASE_URL.
 *   npm run db:seed:if-empty -w apps/api   ne fait rien si la base contient déjà un utilisateur ; ne vide jamais
 *                                          (build Vercel avec SEED_DEMO=true).
 * Autorisé avec NODE_ENV=production seulement si DEMO_MODE=true (ou SEED_FORCE=true pour le mode qui vide).
 * Itinéraires des courses en cours : ROUTING_PROVIDER (osrm par défaut, ligne droite si le service ne répond pas ;
 * ROUTING_PROVIDER=straight : aucun appel externe).
 */
import 'dotenv/config';
import { PrismaClient, type FeePayer, type OrderStatus, type VehicleType } from '@prisma/client';
import {
  DEFAULT_PRICING_RULES,
  computeDeliveryPrice,
  computeOrderTotals,
  roadDistanceKm,
  requiredDocuments,
} from '@yaar/shared';
import { loadConfig } from '../src/config';
import { bearingDeg } from '../src/lib/geo';
import { createRoutingProvider } from '../src/providers/routing';
import { createStorage } from '../src/providers/storage';
import { newTrackingToken } from '../src/services/deliveries';
import { normalizeHeading } from '../src/services/heading';
import { generateDeliveryCode } from '../src/services/orders';
import { trackingUrlFor } from '../src/services/serializers';

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
const routing = createRoutingProvider(config, (m) => console.warn(m));
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
  wemtenga: { lat: 12.3765, lng: -1.4855, address: 'Wemtenga, rue 29.12' },
  cissin: { lat: 12.3365, lng: -1.5405, address: 'Cissin, près du marché' },
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

  /* ---------------- Entreprises (comptes SELLER, boutique validée = profil d'entreprise) ---------------- */
  const businessesSpec = [
    {
      phone: '+22671000001', name: 'Awa Ouédraogo',
      store: { name: 'Le Verdoyant', ...Q.centre, landmark: 'En face de la BCEAO', description: 'Restaurant : plats burkinabè et grillades livrés à domicile et au bureau', openingHours: 'Lun-Dim 10h-23h' },
    },
    {
      phone: '+22671000002', name: 'Dr Moussa Sawadogo',
      store: { name: 'Pharmacie du Progrès', ...Q.gounghin, landmark: 'Derrière la mairie de Gounghin', description: 'Pharmacie : ordonnances et parapharmacie', openingHours: 'Lun-Sam 7h30-22h, garde le dimanche' },
    },
    {
      phone: '+22671000003', name: 'Rasmata Kaboré',
      store: { name: 'Faso Mode Boutique', ...Q.zogona, landmark: 'À côté du kiosque Orange', description: 'Vêtements et pagnes Faso Dan Fani', openingHours: 'Lun-Sam 9h-20h' },
    },
    {
      phone: '+22671000004', name: 'Boukary Compaoré',
      store: { name: 'Tech Plus Électronique', ...Q.tampouy, landmark: 'Entrée principale du marché', description: 'Téléphones, ordinateurs et accessoires', openingHours: 'Lun-Sam 8h-19h' },
    },
    {
      phone: '+22671000005', name: 'Salimata Traoré',
      store: { name: 'Kaya Market', ...Q.ouaga2000, landmark: 'Immeuble Kaya, rez-de-chaussée', description: 'Boutique en ligne : commandes WhatsApp et Facebook livrées en ville', openingHours: 'Tous les jours 8h-21h' },
    },
  ];
  type Business = { id: string; name: string; ownerId: string; lat: number; lng: number; address: string; landmark: string };
  const businesses: Record<string, Business> = {};
  for (const b of businessesSpec) {
    const owner = await prisma.user.create({ data: { phone: b.phone, name: b.name, role: 'SELLER' } });
    const store = await prisma.store.create({
      data: { ...b.store, isOpen: true, ownerId: owner.id, phone: b.phone, approvalStatus: 'APPROVED', approvedAt: minutesAgo(60 * 24 * 60) },
    });
    businesses[store.name] = store;
  }
  // Une entreprise en attente de validation (file « boutiques à valider » de la console).
  const pendingOwner = await prisma.user.create({ data: { phone: '+22671000009', name: 'Issa Compaoré', role: 'SELLER' } });
  await prisma.store.create({
    data: {
      ownerId: pendingOwner.id, name: 'Grillades de Pissy', ...Q.pissy, landmark: 'À côté du marché de Pissy',
      description: 'Brochettes et poulet bicyclette', phone: pendingOwner.phone, isOpen: false, approvalStatus: 'PENDING',
    },
  });

  /* ---------------- Comptes clients (ancien parcours, aucune commande) ---------------- */
  // Conservés pour les comptes de démonstration existants des applications ; la démo ne repose plus sur eux.
  const aminata = await prisma.user.create({ data: { phone: '+22672000001', name: 'Aminata K.', role: 'CLIENT' } });
  await prisma.user.create({ data: { phone: '+22672000002', name: 'Paul T.', role: 'CLIENT' } });
  await prisma.user.create({ data: { phone: '+22672000003', name: 'Mariam O.', role: 'CLIENT' } });
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

  const issouf = await createDriver({ phone: '+22673000001', name: 'Issouf S.', vehicleType: 'MOTO', plate: '11 JJ 4521', status: 'APPROVED', online: { lat: 12.3602, lng: -1.5248 } });
  const karim = await createDriver({ phone: '+22673000002', name: 'Karim D.', vehicleType: 'MOTO', plate: '11 KM 1187', status: 'APPROVED', online: { lat: 12.3985, lng: -1.5190 } });
  const fatimata = await createDriver({ phone: '+22673000003', name: 'Fatimata Z.', vehicleType: 'BIKE', status: 'APPROVED', online: { lat: 12.3790, lng: -1.5010 } });
  const abdoul = await createDriver({ phone: '+22673000004', name: 'Abdoul T.', vehicleType: 'CAR', plate: '11 HH 0917', status: 'APPROVED', online: { lat: 12.3920, lng: -1.5450 } });
  await createDriver({ phone: '+22673000005', name: 'Adama N.', vehicleType: 'MOTO', plate: '11 LL 3090', status: 'APPROVED', cashHeld: 52_000 });
  await createDriver({ phone: '+22673000006', name: 'Ousmane B.', vehicleType: 'MOTO', plate: '11 KM 2280', status: 'PENDING' });
  await createDriver({ phone: '+22673000007', name: 'Rasmané P.', vehicleType: 'BIKE', status: 'PENDING', skipDocs: ['SELFIE'] });

  /* ---------------- Livraisons d'entreprise ---------------- */
  const rules = new Map(DEFAULT_PRICING_RULES.map((r) => [r.vehicleType, r]));
  const balances = new Map<string, number>();
  const tracking: Array<{ label: string; url: string }> = [];

  /** Encaissement en espèces (journal de caisse, solde courant du livreur). */
  async function collect(driverId: string, orderId: string, amount: number, note: string, at: Date) {
    const balanceAfter = (balances.get(driverId) ?? 0) + amount;
    balances.set(driverId, balanceAfter);
    await prisma.cashLedgerEntry.create({ data: { driverId, type: 'COLLECTION', amount, balanceAfter, orderId, note, createdAt: at } });
  }

  async function createDelivery(spec: {
    business: Business;
    recipient: { name: string; phone: string; isBusiness?: boolean };
    dropoff: { lat: number; lng: number; address: string; landmark?: string };
    vehicleType: VehicleType;
    packageDescription: string;
    feePaidBy: FeePayer;
    cashToCollect: number;
    path: OrderStatus[];
    driver?: { id: string; lat: number; lng: number };
    createdMinutesAgo: number;
    cancelReason?: string;
  }) {
    const b = spec.business;
    const pickup = { lat: b.lat, lng: b.lng, address: b.address, landmark: b.landmark };
    const distanceKm = roadDistanceKm(pickup, spec.dropoff);
    const price = computeDeliveryPrice(rules.get(spec.vehicleType)!, distanceKm);
    const totals = computeOrderTotals(price, spec.cashToCollect, 0);
    const status = spec.path[spec.path.length - 1]!;
    const created = minutesAgo(spec.createdMinutesAgo);
    const at = (i: number) => new Date(created.getTime() + i * 4 * 60_000);
    const tsFor = (s: OrderStatus) => (spec.path.includes(s) ? at(spec.path.indexOf(s)) : null);
    const delivered = status === 'DELIVERED';
    const token = newTrackingToken();
    const order = await prisma.order.create({
      data: {
        type: 'PARCEL',
        status,
        clientId: b.ownerId,
        storeId: b.id,
        driverId: spec.driver?.id ?? null,
        vehicleType: spec.vehicleType,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        pickupAddress: pickup.address,
        pickupLandmark: pickup.landmark,
        dropoffLat: spec.dropoff.lat,
        dropoffLng: spec.dropoff.lng,
        dropoffAddress: spec.dropoff.address,
        dropoffLandmark: spec.dropoff.landmark ?? '',
        recipientName: spec.recipient.name,
        recipientPhone: spec.recipient.phone,
        recipientIsBusiness: spec.recipient.isBusiness ?? false,
        parcelDescription: spec.packageDescription,
        distanceKm,
        ...totals,
        paymentMethod: 'CASH',
        paymentStatus: delivered ? 'PAID' : status === 'CANCELLED' ? 'CANCELLED' : 'PENDING',
        cashCollected: delivered ? totals.total : null,
        feePaidBy: spec.feePaidBy,
        cashToCollect: spec.cashToCollect,
        owedToBusiness: delivered ? spec.cashToCollect : null,
        trackingToken: token,
        deliveryCode: generateDeliveryCode(),
        cancelReason: spec.cancelReason ?? null,
        createdAt: created,
        searchingSince: tsFor('SEARCHING_DRIVER'),
        assignedAt: tsFor('ASSIGNED'),
        pickedUpAt: tsFor('PICKED_UP'),
        deliveredAt: tsFor('DELIVERED'),
        cancelledAt: tsFor('CANCELLED'),
      },
    });
    let prev: OrderStatus | null = null;
    for (let i = 0; i < spec.path.length; i++) {
      const s = spec.path[i]!;
      await prisma.orderEvent.create({
        data: { orderId: order.id, fromStatus: prev, toStatus: s, actorId: i === 0 ? b.ownerId : null, actorRole: i === 0 ? 'SELLER' : null, createdAt: at(i) },
      });
      prev = s;
    }
    // Espèces : frais payés par l'entreprise au retrait (SENDER), marchandise (+ frais si RECIPIENT) à la livraison.
    if (spec.driver && spec.path.includes('PICKED_UP') && spec.feePaidBy === 'SENDER')
      await collect(spec.driver.id, order.id, totals.deliveryFee, `Frais de livraison payés par l’expéditeur, livraison #${order.number}`, tsFor('PICKED_UP')!);
    if (spec.driver && delivered) {
      const atDelivery = spec.cashToCollect + (spec.feePaidBy === 'RECIPIENT' ? totals.deliveryFee : 0);
      if (atDelivery > 0) await collect(spec.driver.id, order.id, atDelivery, `Encaissement à la livraison #${order.number}`, tsFor('DELIVERED')!);
    }
    // Course en cours : itinéraire de l'étape en cours (et durée retrait → livraison), cap du livreur.
    if (spec.driver && (status === 'ASSIGNED' || status === 'PICKED_UP')) {
      const from = { lat: spec.driver.lat, lng: spec.driver.lng };
      const target = status === 'ASSIGNED' ? pickup : spec.dropoff;
      const route = await routing.route(from, { lat: target.lat, lng: target.lng }, spec.vehicleType);
      const leg = status === 'ASSIGNED' ? await routing.route(pickup, spec.dropoff, spec.vehicleType) : null;
      await prisma.order.update({
        where: { id: order.id },
        data: {
          routeTarget: status === 'ASSIGNED' ? 'PICKUP' : 'DROPOFF',
          routePoints: route.points,
          routeDistanceM: route.distanceM,
          routeDurationS: route.durationS,
          routeSource: route.source,
          routeComputedAt: now,
          routeOriginLat: from.lat,
          routeOriginLng: from.lng,
          routeAttemptAt: now,
          deliveryLegDurationS: leg?.durationS ?? null,
        },
      });
      await prisma.driverProfile.update({
        where: { userId: spec.driver.id },
        data: { isBusy: true, lastHeading: normalizeHeading(bearingDeg(from, target)) },
      });
    }
    if (status !== 'DELIVERED' && status !== 'CANCELLED')
      tracking.push({ label: `#${order.number} ${b.name} → ${spec.recipient.name} (${status})`, url: trackingUrlFor(config.publicAppUrl, token) });
    return order;
  }

  const B = (name: string) => businesses[name]!;
  const ISSOUF = { id: issouf.id, lat: 12.3602, lng: -1.5248 };
  const FATIMATA = { id: fatimata.id, lat: 12.379, lng: -1.501 };
  const ABDOUL = { id: abdoul.id, lat: 12.392, lng: -1.545 };
  const DONE: OrderStatus[] = ['PENDING', 'SEARCHING_DRIVER', 'ASSIGNED', 'PICKED_UP', 'DELIVERED'];

  // Solde d'espèces d'Issouf avant la démonstration (38 500 FCFA détenus au total, cf. docs/API.md §12).
  const ISSOUF_OPENING = 38_500 - 12_000 - computeDeliveryPrice(rules.get('MOTO')!, roadDistanceKm(Q.ouaga2000, Q.patteDOie)).deliveryFee;
  balances.set(issouf.id, ISSOUF_OPENING);

  // Livrée hier par Issouf : frais payés par l'entreprise au retrait, marchandise encaissée pour elle.
  const delivered = await createDelivery({
    business: B('Kaya Market'), recipient: { name: 'Bintou Zongo', phone: '+22676100001' },
    dropoff: { ...Q.patteDOie, landmark: 'Derrière la station Total, portail bleu' },
    vehicleType: 'MOTO', packageDescription: 'Robe en wax et sac à main', feePaidBy: 'SENDER', cashToCollect: 12_000,
    path: DONE, driver: ISSOUF, createdMinutesAgo: 60 * 20,
  });
  // Livrée ce matin à une entreprise (clinique) par Fatimata : frais et médicaments payés par le destinataire.
  const deliveredToday = await createDelivery({
    business: B('Pharmacie du Progrès'), recipient: { name: 'Clinique Les Genêts', phone: '+22625360000', isBusiness: true },
    dropoff: { ...Q.cissin, landmark: 'Portail vert, accueil' },
    vehicleType: 'BIKE', packageDescription: 'Médicaments (commande de la clinique)', feePaidBy: 'RECIPIENT', cashToCollect: 8_500,
    path: DONE, driver: FATIMATA, createdMinutesAgo: 60 * 3,
  });
  // En livraison par Issouf (Ouaga 2000) : le destinataire paie le repas et les frais.
  await createDelivery({
    business: B('Le Verdoyant'), recipient: { name: 'Mariam Ouédraogo', phone: '+22676100003' },
    dropoff: { ...Q.ouaga2000, landmark: 'Villa 12, portail noir' },
    vehicleType: 'MOTO', packageDescription: 'Repas : riz gras poulet × 3', feePaidBy: 'RECIPIENT', cashToCollect: 7_500,
    path: ['PENDING', 'SEARCHING_DRIVER', 'ASSIGNED', 'PICKED_UP'], driver: ISSOUF, createdMinutesAgo: 25,
  });
  // Abdoul (voiture) va chercher un téléphone chez Tech Plus pour une entreprise de Dassasgho.
  await createDelivery({
    business: B('Tech Plus Électronique'), recipient: { name: 'Bureau Faso Conseil', phone: '+22625370000', isBusiness: true },
    dropoff: { ...Q.dassasgho, landmark: 'Immeuble bleu, 2e étage' },
    vehicleType: 'CAR', packageDescription: 'Téléphone Tecno Camon (boîte scellée)', feePaidBy: 'SENDER', cashToCollect: 85_000,
    path: ['PENDING', 'SEARCHING_DRIVER', 'ASSIGNED'], driver: ABDOUL, createdMinutesAgo: 10,
  });
  // En recherche de livreur : vélo près de Fatimata (offre au prochain cycle) et moto sans livreur proche (console).
  await createDelivery({
    business: B('Faso Mode Boutique'), recipient: { name: 'Awa Kaboré', phone: '+22676100004' },
    dropoff: { ...Q.wemtenga, landmark: 'Face à l’école Wend-Konta' },
    vehicleType: 'BIKE', packageDescription: '2 pagnes Faso Dan Fani', feePaidBy: 'SENDER', cashToCollect: 25_000,
    path: ['PENDING', 'SEARCHING_DRIVER'], createdMinutesAgo: 2,
  });
  await createDelivery({
    business: B('Pharmacie du Progrès'), recipient: { name: 'Paul Tiendrébéogo', phone: '+22676100005' },
    dropoff: { ...Q.pissy, landmark: 'Face à l’école primaire' },
    vehicleType: 'MOTO', packageDescription: 'Médicaments (ordonnance)', feePaidBy: 'SENDER', cashToCollect: 0,
    path: ['PENDING', 'SEARCHING_DRIVER'], createdMinutesAgo: 7,
  });
  // Annulée par l'entreprise avant le retrait.
  await createDelivery({
    business: B('Kaya Market'), recipient: { name: 'Issa Ouédraogo', phone: '+22676100006' },
    dropoff: { ...Q.tanghin }, vehicleType: 'MOTO', packageDescription: 'Paire de baskets', feePaidBy: 'RECIPIENT', cashToCollect: 18_000,
    path: ['PENDING', 'SEARCHING_DRIVER', 'CANCELLED'], createdMinutesAgo: 90, cancelReason: 'Annulée par l’entreprise : destinataire injoignable',
  });

  // Soldes d'espèces des livreurs = dernier solde du journal.
  for (const [driverId, cashHeld] of balances) await prisma.driverProfile.update({ where: { userId: driverId }, data: { cashHeld } });
  await prisma.rating.create({ data: { orderId: delivered.id, fromUserId: B('Kaya Market').ownerId, toUserId: issouf.id, score: 5, comment: 'Rapide et poli' } });
  await prisma.rating.create({ data: { orderId: deliveredToday.id, fromUserId: B('Pharmacie du Progrès').ownerId, toUserId: fatimata.id, score: 5 } });

  /* ---------------- Incidents ---------------- */
  await prisma.incident.create({
    data: { type: 'DISPUTE', reporterId: B('Kaya Market').ownerId, orderId: delivered.id, description: 'Colis endommagé à la livraison' },
  });
  await prisma.incident.create({
    data: { type: 'SOS', reporterId: karim.id, lat: 12.3985, lng: -1.519, description: 'Crevaison, besoin d’assistance' },
  });

  console.info('Base de démonstration créée (modèle B2B : livraisons demandées par des entreprises).');
  console.info('Connexion (OTP 123456 si OTP_DEV_BYPASS=true ou DEMO_MODE=true ; avec DEMO_MODE=true, les comptes');
  console.info('de console utilisent DEMO_STAFF_CODE, après « Recevoir le code ») :');
  console.info(`  Admin        ${admin.phone}`);
  console.info(`  Contrôleur   ${controller.phone}`);
  console.info('  Entreprises  ' + businessesSpec.map((b) => `${b.phone} (${b.store.name})`).join(', '));
  console.info('               +22671000009 (Grillades de Pissy, en attente de validation)');
  console.info('  Livreurs     +22673000001 (moto, en course), +22673000002 (moto), +22673000003 (vélo), +22673000004 (voiture, en course)');
  console.info('               +22673000005 (au plafond d’espèces), +22673000006 et +22673000007 (dossiers en attente)');
  console.info('  Clients      +22672000001, +22672000002, +22672000003 (ancien parcours de commande, sans commande)');
  console.info('Liens de suivi des destinataires (sans compte) :');
  for (const l of tracking) console.info(`  ${l.label} : ${l.url}`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
