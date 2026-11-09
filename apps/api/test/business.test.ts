import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PRICING_RULES,
  computeDeliveryPrice,
  formatFcfa,
  roadDistanceKm,
  type ApiErrorBody,
  type BusinessBalanceDto,
  type CashLedgerEntryDto,
  type DriverEarningsDto,
  type OfferDto,
  type OrderDto,
  type Paginated,
  type QuoteResponse,
} from '@yaar/shared';
import {
  call,
  createBusiness,
  createDriver,
  createStore,
  createTestApp,
  login,
  loginStaff,
  P,
  resetDb,
  T0,
  type TestApp,
} from './helpers';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
  await t.prisma.$disconnect();
});
beforeEach(async () => {
  await t.ctx.work.settled();
  await resetDb(t.prisma);
  t.clock.set(T0);
  t.recipients.sent.length = 0;
  t.push.sent.length = 0;
});

const near = { lat: 12.37, lng: -1.526 }; // ~0,2 km du centre
const farther = { lat: 12.38, lng: -1.53 }; // ~1,3 km
const dropoff = { ...P.patteDOie, address: "Patte d'Oie, secteur 15", landmark: 'Portail bleu' };
const delivery = (over: Record<string, unknown> = {}) => ({
  dropoff,
  recipientName: 'Ali Ouédraogo',
  recipientPhone: '76 00 00 00',
  packageDescription: '2 boîtes de médicaments',
  vehicleType: 'MOTO',
  ...over,
});
const fee = (vt: 0 | 1 | 2 = 1, from = P.centre) => computeDeliveryPrice(DEFAULT_PRICING_RULES[vt]!, roadDistanceKm(from, dropoff)).deliveryFee;

async function create(token: string, over: Record<string, unknown> = {}) {
  const r = await call(t.app, 'POST', '/business/deliveries', token, delivery(over));
  expect(r.statusCode, r.body).toBe(201);
  return r.json<OrderDto>();
}

async function assign(orderId: string, driverToken: string) {
  const offer = await t.prisma.dispatchOffer.findFirstOrThrow({ where: { orderId, status: 'OFFERED' } });
  const r = await call(t.app, 'POST', `/driver/offers/${offer.id}/accept`, driverToken, {});
  expect(r.statusCode).toBe(200);
  await t.ctx.work.settled();
}

describe('devis et demande de livraison', () => {
  it('réservés aux entreprises dont le profil (boutique) est validé', async () => {
    const client = await login(t.app, 'CLIENT');
    const quoteBody = { dropoff };
    expect((await call(t.app, 'POST', '/business/deliveries/quote', client.accessToken, quoteBody)).statusCode).toBe(403);
    const noStore = await login(t.app, 'SELLER');
    const r1 = await call(t.app, 'POST', '/business/deliveries/quote', noStore.accessToken, quoteBody);
    expect(r1.statusCode).toBe(403);
    expect(r1.json<ApiErrorBody>().error.code).toBe('STORE_NOT_APPROVED');
    const pending = await createBusiness(t, P.centre, { approval: 'PENDING' });
    for (const [url, body] of [['/business/deliveries/quote', quoteBody], ['/business/deliveries', delivery()]] as const) {
      const r = await call(t.app, 'POST', url, pending.business.accessToken, body);
      expect(r.statusCode).toBe(403);
      expect(r.json<ApiErrorBody>().error).toMatchObject({ code: 'STORE_NOT_APPROVED', message: expect.stringMatching(/validée/) });
    }
    expect(await t.prisma.order.count()).toBe(0);
  });

  it('devis : prix par véhicule depuis l’adresse de l’entreprise (ou un autre point de retrait)', async () => {
    const { business } = await createBusiness(t, P.centre);
    const r = await call(t.app, 'POST', '/business/deliveries/quote', business.accessToken, { dropoff });
    expect(r.statusCode).toBe(200);
    const q = r.json<QuoteResponse>();
    expect(q).toMatchObject({ type: 'PARCEL', itemsTotal: 0, paymentMethods: ['CASH'], distanceKm: roadDistanceKm(P.centre, dropoff) });
    expect(q.pickup).toEqual({ ...P.centre, address: 'Avenue Kwame Nkrumah', landmark: 'Face BCEAO' });
    expect(q.options.map((o) => o.vehicleType)).toEqual(['BIKE', 'MOTO', 'CAR']);
    expect(q.options[1]).toMatchObject({ available: true, deliveryFee: fee(), total: fee() });
    const other = await call(t.app, 'POST', '/business/deliveries/quote', business.accessToken, {
      pickup: { ...P.zogona, address: 'Entrepôt Zogona' },
      dropoff,
    });
    expect(other.json<QuoteResponse>()).toMatchObject({ pickup: { address: 'Entrepôt Zogona', landmark: '' }, distanceKm: roadDistanceKm(P.zogona, dropoff) });
  });

  it('validation : destinataire, numéro, description et montant à encaisser ; tarif désactivé', async () => {
    const { business } = await createBusiness(t);
    const bad = async (body: Record<string, unknown>, field: string) => {
      const r = await call(t.app, 'POST', '/business/deliveries', business.accessToken, body);
      expect(r.statusCode, field).toBe(400);
      expect(r.json<ApiErrorBody>().error.details, field).toHaveProperty(field);
    };
    const { recipientPhone: _p, ...noPhone } = delivery();
    await bad(noPhone, 'recipientPhone');
    await bad(delivery({ recipientPhone: '12' }), 'recipientPhone');
    await bad(delivery({ recipientName: '' }), 'recipientName');
    await bad(delivery({ packageDescription: '' }), 'packageDescription');
    await bad(delivery({ cashToCollect: -1 }), 'cashToCollect');
    await bad(delivery({ cashToCollect: 10.5 }), 'cashToCollect');
    await bad(delivery({ feePaidBy: 'CLIENT' }), 'feePaidBy');
    await bad(delivery({ dropoff: { lat: 12.3 } }), 'dropoff.lng');
    await t.prisma.pricingRule.update({ where: { vehicleType: 'CAR' }, data: { isActive: false } });
    const off = await call(t.app, 'POST', '/business/deliveries', business.accessToken, delivery({ vehicleType: 'CAR' }));
    expect(off.statusCode).toBe(409);
    expect(off.json<ApiErrorBody>().error.code).toBe('PRICING_UNAVAILABLE');
  });

  it('création : recherche de livreur immédiate, offre au plus proche, lien de suivi, code jamais montré à l’entreprise', async () => {
    const { business, storeId } = await createBusiness(t, P.centre, { name: 'Pharmacie du Centre' });
    const nearDriver = await createDriver(t, 'MOTO', near);
    const farDriver = await createDriver(t, 'MOTO', farther);
    await createDriver(t, 'BIKE', near);
    const o = await create(business.accessToken);
    expect(o).toMatchObject({
      type: 'PARCEL',
      status: 'SEARCHING_DRIVER',
      store: { id: storeId, name: 'Pharmacie du Centre' },
      pickup: { ...P.centre, address: 'Avenue Kwame Nkrumah', landmark: 'Face BCEAO' },
      dropoff,
      recipientName: 'Ali Ouédraogo',
      recipientPhone: '+22676000000',
      parcelDescription: '2 boîtes de médicaments',
      feePaidBy: 'SENDER',
      cashToCollect: 0,
      recipientIsBusiness: false,
      deliveryCode: null,
      deliveryFee: fee(),
      total: fee(),
      sellerPayout: 0,
      commission: null,
    });
    expect(o.trackingUrl).toMatch(/^https:\/\/yaar-livraison\.vercel\.app\/suivi\/[A-Za-z0-9_-]{24}$/);
    const token = o.trackingUrl!.split('/').at(-1)!;
    expect(Buffer.from(token, 'base64url')).toHaveLength(18); // 144 bits aléatoires
    const row = await t.prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(row).toMatchObject({ trackingToken: token, clientId: business.user.id, storeId });
    expect(row.deliveryCode).toMatch(/^\d{4}$/);
    const full = (await call(t.app, 'GET', `/orders/${o.id}`, business.accessToken)).json<OrderDto>();
    expect(full.events!.map((e) => [e.fromStatus, e.toStatus, e.actorRole])).toEqual([
      [null, 'PENDING', 'SELLER'],
      ['PENDING', 'SEARCHING_DRIVER', 'SELLER'],
    ]);
    // Deuxième livraison : autre jeton.
    const o2 = await create(business.accessToken, { recipientIsBusiness: true, recipientName: 'Clinique Les Genêts' });
    expect(o2.trackingUrl).not.toBe(o.trackingUrl);
    expect(o2.recipientIsBusiness).toBe(true);

    // Offre au livreur MOTO le plus proche : adresse et nom de l'entreprise (lieu professionnel), zone de livraison.
    const offers = (await call(t.app, 'GET', '/driver/offers', nearDriver.accessToken)).json<OfferDto[]>();
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ orderId: o.id, pickup: { address: 'Avenue Kwame Nkrumah', name: 'Pharmacie du Centre' }, cashToCollect: fee() });
    expect(offers[0]!.dropoff.address).toMatch(/^Secteur /);
    expect(JSON.stringify(offers[0])).not.toContain('76000000');
    // o2 : le livreur proche a déjà une offre ouverte → le suivant.
    expect((await call(t.app, 'GET', '/driver/offers', farDriver.accessToken)).json<OfferDto[]>()[0]?.orderId).toBe(o2.id);

    // Message au destinataire : entreprise, lien, code ; rien à payer (frais payés par l'expéditeur).
    await t.ctx.work.settled();
    expect(t.recipients.sent).toHaveLength(2);
    expect(t.recipients.sent[0]!.phone).toBe('+22676000000');
    const msg = t.recipients.sent[0]!.message;
    expect(msg).toContain('Pharmacie du Centre');
    expect(msg).toContain(o.trackingUrl!);
    expect(msg).toContain(row.deliveryCode);
    expect(msg).toContain('Rien à payer');
  });

  it('message au destinataire : montant à payer (marchandise + frais si le destinataire les paie)', async () => {
    const { business } = await createBusiness(t);
    const o = await create(business.accessToken, { feePaidBy: 'RECIPIENT', cashToCollect: 15_000 });
    expect(o).toMatchObject({ feePaidBy: 'RECIPIENT', cashToCollect: 15_000, itemsTotal: 15_000, sellerPayout: 15_000, total: 15_000 + fee() });
    await t.ctx.work.settled();
    expect(t.recipients.sent[0]!.message).toContain(`À payer au livreur à la réception : ${formatFcfa(15_000 + fee())} en espèces`);
  });

  it('un envoi au destinataire qui échoue ou traîne ne bloque jamais la demande', async () => {
    let calls = 0;
    const failing = createTestApp({}, { recipients: { channel: 'whatsapp', send: async () => { calls++; throw new Error('panne'); } } });
    const slow = createTestApp({}, { recipients: { channel: 'console', send: () => new Promise<void>(() => { calls++; }) } });
    const placeholder = createTestApp({ RECIPIENT_NOTIFIER: 'whatsapp' }, { recipients: null });
    for (const pending of [failing, slow, placeholder]) {
      const app = await pending;
      try {
        if (pending === placeholder) expect(app.ctx.recipients.channel).toBe('whatsapp');
        const { business } = await createBusiness(app);
        const started = Date.now();
        const r = await call(app.app, 'POST', '/business/deliveries', business.accessToken, delivery());
        expect(r.statusCode).toBe(201);
        expect(Date.now() - started).toBeLessThan(5000);
        if (pending !== slow) await app.ctx.work.settled();
      } finally {
        await app.app.close();
        await app.prisma.$disconnect();
      }
    }
    expect(calls).toBe(2);
  });
});

describe('suivi par l’entreprise et visibilité', () => {
  it('l’entreprise voit le livreur, sa position, l’itinéraire et l’ETA, jamais le code ; les autres : 404', async () => {
    const { business } = await createBusiness(t);
    const other = await createBusiness(t, P.zogona, { name: 'Autre entreprise' });
    const client = await login(t.app, 'CLIENT');
    const staff = await loginStaff(t);
    const driver = await createDriver(t, 'MOTO', near);
    const o = await create(business.accessToken, { cashToCollect: 5_000 });
    await assign(o.id, driver.accessToken);
    const mine = (await call(t.app, 'GET', `/orders/${o.id}`, business.accessToken)).json<OrderDto>();
    expect(mine.status).toBe('ASSIGNED');
    expect(mine.driver).toMatchObject({ id: driver.user.id, phone: driver.user.phone });
    expect(mine.driver?.lastLocation).toMatchObject({ lat: near.lat, lng: near.lng });
    expect(mine.route?.target).toBe('PICKUP');
    expect(mine.etaMinutes).toBeGreaterThan(0);
    expect(mine.deliveryCode).toBeNull();
    expect(mine.trackingUrl).toBe(o.trackingUrl);
    for (const tok of [other.business.accessToken, client.accessToken]) expect((await call(t.app, 'GET', `/orders/${o.id}`, tok)).statusCode).toBe(404);
    // Livreur affecté : ce qu'il faut encaisser, sans lien de suivi ni code.
    const forDriver = (await call(t.app, 'GET', `/orders/${o.id}`, driver.accessToken)).json<OrderDto>();
    expect(forDriver).toMatchObject({ feePaidBy: 'SENDER', cashToCollect: 5_000, trackingUrl: null, deliveryCode: null, recipientPhone: '+22676000000' });
    expect(forDriver.store?.phone).toBe('+22625300000');
    // Console : lien de suivi visible, code non.
    expect((await call(t.app, 'GET', `/orders/${o.id}`, staff.accessToken)).json<OrderDto>()).toMatchObject({ trackingUrl: o.trackingUrl, deliveryCode: null });
    // Après la livraison, l'entreprise garde ses adresses et son destinataire.
    await call(t.app, 'POST', `/orders/${o.id}/pickup`, driver.accessToken, {});
    const code = (await t.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).deliveryCode;
    await call(t.app, 'POST', `/orders/${o.id}/deliver`, driver.accessToken, { code });
    const after = (await call(t.app, 'GET', `/orders/${o.id}`, business.accessToken)).json<OrderDto>();
    expect(after).toMatchObject({ status: 'DELIVERED', dropoff, recipientPhone: '+22676000000', route: null, deliveryCode: null });
    expect(after.driver?.lastLocation).toBeNull();
  });

  it('GET /business/deliveries : ses livraisons seulement, filtre status, updatedSince (changements, statut ignoré)', async () => {
    const { seller, storeId, productIds } = await createStore(t);
    const client = await login(t.app, 'CLIENT');
    // Ancienne commande d'un client sur la même boutique : pas dans les livraisons de l'entreprise.
    await call(t.app, 'POST', '/orders', client.accessToken, {
      type: 'FOOD', storeId, vehicleType: 'MOTO', items: [{ productId: productIds[0], quantity: 1 }], dropoff,
    });
    const a = await create(seller.accessToken);
    const b = await create(seller.accessToken, { recipientName: 'Bintou' });
    const other = await createBusiness(t, P.zogona);
    await create(other.business.accessToken);
    const list = (await call(t.app, 'GET', '/business/deliveries', seller.accessToken)).json<Paginated<OrderDto>>();
    expect(list.items.map((o) => o.id).sort()).toEqual([a.id, b.id].sort());
    expect(list.total).toBe(2);
    expect(list.items.every((o) => o.route === null && o.trackingUrl !== null)).toBe(true);
    expect((await call(t.app, 'GET', '/orders', seller.accessToken)).json<Paginated<OrderDto>>().total).toBe(3);

    const cursor = list.items.map((o) => o.updatedAt!).sort().at(-1)!;
    expect((await call(t.app, 'POST', `/orders/${a.id}/cancel`, seller.accessToken, { reason: 'Client absent' })).statusCode).toBe(200);
    const filtered = (await call(t.app, 'GET', '/business/deliveries?status=SEARCHING_DRIVER', seller.accessToken)).json<Paginated<OrderDto>>();
    expect(filtered.items.map((o) => o.id)).toEqual([b.id]);
    const changed = (
      await call(t.app, 'GET', `/business/deliveries?status=SEARCHING_DRIVER&updatedSince=${encodeURIComponent(cursor)}`, seller.accessToken)
    ).json<Paginated<OrderDto>>();
    expect(changed.items.find((o) => o.id === a.id)).toMatchObject({ status: 'CANCELLED', cancelReason: 'Client absent' });
    expect((await call(t.app, 'GET', '/business/deliveries?updatedSince=hier', seller.accessToken)).statusCode).toBe(400);
    expect((await call(t.app, 'GET', '/business/deliveries', client.accessToken)).statusCode).toBe(403);
  });

  it('annulation par l’entreprise jusqu’au retrait (livreur libéré), refusée ensuite ; jamais par une autre', async () => {
    const { business } = await createBusiness(t);
    const other = await createBusiness(t, P.zogona);
    const driver = await createDriver(t, 'MOTO', near);
    const searching = await create(business.accessToken);
    expect((await call(t.app, 'POST', `/orders/${searching.id}/cancel`, other.business.accessToken, {})).statusCode).toBe(404);
    expect((await call(t.app, 'POST', `/orders/${searching.id}/cancel`, business.accessToken, {})).json<OrderDto>()).toMatchObject({
      status: 'CANCELLED',
      cancelReason: 'Annulée par l’entreprise',
    });
    expect(await t.prisma.dispatchOffer.count({ where: { orderId: searching.id, status: 'OFFERED' } })).toBe(0);

    const assigned = await create(business.accessToken);
    await assign(assigned.id, driver.accessToken);
    expect((await call(t.app, 'POST', `/orders/${assigned.id}/cancel`, business.accessToken, {})).statusCode).toBe(200);
    expect((await t.prisma.driverProfile.findUniqueOrThrow({ where: { userId: driver.user.id } })).isBusy).toBe(false);

    const picked = await create(business.accessToken);
    await assign(picked.id, driver.accessToken);
    await call(t.app, 'POST', `/orders/${picked.id}/pickup`, driver.accessToken, {});
    const late = await call(t.app, 'POST', `/orders/${picked.id}/cancel`, business.accessToken, {});
    expect(late.statusCode).toBe(409);
    expect(late.json<ApiErrorBody>().error.code).toBe('INVALID_TRANSITION');
  });
});

describe('espèces : frais (expéditeur ou destinataire) et marchandise encaissée pour l’entreprise', () => {
  it('SENDER : frais encaissés au retrait ; RECIPIENT : frais + marchandise à la livraison ; dû par entreprise', async () => {
    const { business, storeId } = await createBusiness(t, P.centre, { name: 'Kaya Market' });
    const driver = await createDriver(t, 'MOTO', near);
    const staff = await loginStaff(t);
    await call(t.app, 'POST', '/me/push-tokens', business.accessToken, { token: 'ExponentPushToken[kaya-1]' });
    // Encaissements uniquement : le solde croît, ordre chronologique = ordre des soldes.
    const ledger = async () =>
      (await call(t.app, 'GET', `/controller/cash/ledger?driverId=${driver.user.id}`, staff.accessToken))
        .json<Paginated<CashLedgerEntryDto>>()
        .items.sort((x, y) => x.balanceAfter - y.balanceAfter);
    const deliverWithCode = async (id: string) => {
      const code = (await t.prisma.order.findUniqueOrThrow({ where: { id } })).deliveryCode;
      const r = await call(t.app, 'POST', `/orders/${id}/deliver`, driver.accessToken, { code });
      expect(r.statusCode).toBe(200);
      return r.json<OrderDto>();
    };

    // 1. Frais payés par l'entreprise au retrait, 12 000 FCFA de marchandise à encaisser.
    const a = await create(business.accessToken, { feePaidBy: 'SENDER', cashToCollect: 12_000 });
    await assign(a.id, driver.accessToken);
    expect(await ledger()).toHaveLength(0);
    await call(t.app, 'POST', `/orders/${a.id}/pickup`, driver.accessToken, {});
    await t.ctx.work.settled();
    expect(await ledger()).toMatchObject([{ type: 'COLLECTION', amount: fee(), balanceAfter: fee(), orderId: a.id }]);
    // Message au destinataire au retrait.
    expect(t.recipients.sent.at(-1)!.message).toMatch(/est en route avec Livreur/);
    const doneA = await deliverWithCode(a.id);
    expect(doneA).toMatchObject({ status: 'DELIVERED', cashCollected: 12_000 + fee(), paymentStatus: 'PAID' });
    expect((await ledger()).at(-1)).toMatchObject({ amount: 12_000, balanceAfter: 12_000 + fee() });
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: a.id } })).owedToBusiness).toBe(12_000);

    // 2. Le destinataire paie les frais et 5 000 FCFA de marchandise à la livraison.
    const b = await create(business.accessToken, { feePaidBy: 'RECIPIENT', cashToCollect: 5_000 });
    await assign(b.id, driver.accessToken);
    await call(t.app, 'POST', `/orders/${b.id}/pickup`, driver.accessToken, {});
    expect(await ledger()).toHaveLength(2); // rien au retrait
    await deliverWithCode(b.id);
    expect((await ledger()).at(-1)).toMatchObject({ amount: 5_000 + fee(), balanceAfter: 17_000 + 2 * fee() });

    // 3. Rien à encaisser du tout (frais payés au retrait, pas de marchandise) : aucune écriture à la livraison.
    const c = await create(business.accessToken, { cashToCollect: 0 });
    await assign(c.id, driver.accessToken);
    await call(t.app, 'POST', `/orders/${c.id}/pickup`, driver.accessToken, {});
    await deliverWithCode(c.id);
    const entries = await ledger();
    expect(entries).toHaveLength(4);
    expect(entries.at(-1)).toMatchObject({ orderId: c.id, amount: fee() });

    const earnings = (await call(t.app, 'GET', '/driver/earnings', driver.accessToken)).json<DriverEarningsDto>();
    expect(earnings.cashHeld).toBe(17_000 + 3 * fee());
    expect(earnings.today.cashCollected).toBe(17_000 + 3 * fee());

    // Dû à l'entreprise (console) ; montant attendu par livraison visible par l'entreprise.
    const balances = (await call(t.app, 'GET', '/controller/cash/businesses', staff.accessToken)).json<BusinessBalanceDto[]>();
    expect(balances).toEqual([
      expect.objectContaining({ storeId, storeName: 'Kaya Market', ownerId: business.user.id, owedTotal: 17_000, deliveries: 2 }),
    ]);
    expect((await call(t.app, 'GET', '/controller/cash/businesses', business.accessToken)).statusCode).toBe(403);
    expect((await call(t.app, 'GET', `/orders/${b.id}`, business.accessToken)).json<OrderDto>().sellerPayout).toBe(5_000);
    // Notifications push à l'entreprise à chaque étape.
    const titles = t.push.sent.filter((p) => p.tokens.includes('ExponentPushToken[kaya-1]')).map((p) => p.message.title);
    expect(titles).toEqual(expect.arrayContaining(['Livreur en route', 'Colis récupéré', 'Livrée']));
    // Export CSV : qui paie les frais, marchandise et montant dû.
    const csv = await call(t.app, 'GET', '/controller/exports/orders.csv', staff.accessToken);
    expect(csv.body.split('\r\n')[0]).toContain('frais_payes_par;marchandise_a_encaisser;du_entreprise');
    expect(csv.body).toContain(';SENDER;12000;12000');
  });
});
