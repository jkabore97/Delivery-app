// Vérification de bout en bout de la démo EN LIGNE (Vercel) avec un vrai navigateur (Playwright/Chromium).
//
//   E2E_STAFF_CODE=<code d'accès démo des comptes de console> node tools/e2e/live-demo.cjs
//
// Variables (facultatives sauf E2E_STAFF_CODE) :
//   APP_URL      application web (client / vendeur / livreur)   défaut https://yaar-livraison.vercel.app
//   CONSOLE_URL  console de contrôle                             défaut https://yaar-console.vercel.app
//   API_URL      API                                             défaut https://yaar-api.vercel.app
//   E2E_OUT      dossier des captures d'écran                    défaut ./e2e-out
//
// Ce que le script vérifie, dans l'ordre :
//   1. API : /health et /config (mode poll, démo active, canal OTP « console »).
//   2. Console : avis de démo + avertissement « données réelles », le code 123456 est REFUSÉ pour un
//      contrôleur, le code d'accès démo est accepté, carte en direct avec marqueurs et tuiles OpenStreetMap.
//   3. Application : client → commande → vendeur accepte et prépare → livreur (consentement GPS, en ligne)
//      reçoit l'offre par polling, l'accepte, récupère, saisit le code de livraison → livré ; puis la console
//      voit la course « Livrée » et la caisse du livreur. Aucune requête Socket.IO (mode poll).
//   4. Avertissement « démonstration publique » sur l'écran des pièces KYC d'un livreur.
//
// Effets sur la base de démonstration : une commande de test est créée et livrée ; Karim D. (livreur
// moto de démo) est remis hors ligne et sans consentement GPS au début, puis hors ligne à la fin.
// Les appels directs à l'API passent par le navigateur (proxy et certificats du navigateur, CORS réel).
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const APP = (process.env.APP_URL || 'https://yaar-livraison.vercel.app').replace(/\/+$/, '');
const CONSOLE = (process.env.CONSOLE_URL || 'https://yaar-console.vercel.app').replace(/\/+$/, '');
const API = (process.env.API_URL || 'https://yaar-api.vercel.app').replace(/\/+$/, '');
const STAFF = process.env.E2E_STAFF_CODE;
const OUT = path.resolve(process.env.E2E_OUT || 'e2e-out');
const WARNING = 'Démonstration publique : n’utilisez pas de vraies pièces d’identité ni de vraies données personnelles.';
const KARIM = '+22673000002';

if (!STAFF || !/^\d{6}$/.test(STAFF)) {
  console.error('E2E_STAFF_CODE (6 chiffres) est obligatoire : code d’accès démo des comptes de console.');
  process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });

const results = { app: APP, console: CONSOLE, api: API, steps: [], checks: {}, pageErrors: [], consoleErrors: [] };
const t00 = Date.now();
const step = (m) => {
  const line = `[${((Date.now() - t00) / 1000).toFixed(0).padStart(4)} s] ${m}`;
  results.steps.push(line);
  console.log(line);
};
const V = (loc) => loc.locator('visible=true').first();
const pages = [];
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) }).catch(() => undefined);

async function newPage(browser, name, opts = {}) {
  const ctx = await browser.newContext({ deviceScaleFactor: 1, locale: 'fr-FR', ...opts });
  const page = await ctx.newPage();
  pages.push([name, page]);
  page.on('pageerror', (e) => results.pageErrors.push(`[${name}] ${String(e).slice(0, 300)}`));
  page.on('console', (m) => {
    if (m.type() === 'error') results.consoleErrors.push(`[${name}] ${m.text().slice(0, 300)}`);
  });
  page.on('dialog', (d) => void d.accept());
  let socket = 0;
  page.on('request', (r) => {
    if (r.url().includes('socket.io')) socket++;
  });
  page.socketCount = () => socket;
  return { ctx, page };
}
const phone = (browser, name, extra = {}) => newPage(browser, name, { viewport: { width: 390, height: 844 }, ...extra });

/** Appel de l'API depuis une page de l'application (origine autorisée par CORS). */
async function api(page, method, p, body, token) {
  return page.evaluate(
    async ({ url, method, body, token }) => {
      const headers = {};
      if (body !== undefined) headers['content-type'] = 'application/json';
      if (token) headers.authorization = `Bearer ${token}`;
      const r = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      let json = null;
      try {
        json = await r.json();
      } catch {
        /* corps vide */
      }
      return { status: r.status, json };
    },
    { url: `${API}${p}`, method, body, token },
  );
}

async function demoLogin(page, label) {
  await page.goto(`${APP}/login`);
  await V(page.getByText('Mode démo : utilisez le code 123456')).waitFor({ timeout: 45000 });
  await V(page.getByText(WARNING, { exact: false })).waitFor({ timeout: 10000 });
  results.checks.appLoginWarning = true;
  await V(page.getByText(label, { exact: false })).click();
  await V(page.getByText('Recevoir le code', { exact: true })).click();
  await V(page.getByText('Mode démo : le code 123456 est accepté')).waitFor({ timeout: 30000 });
  await V(page.getByText('Valider', { exact: true })).click();
}

async function tilesLoaded(page) {
  await page.waitForTimeout(3000);
  return page.evaluate(() => document.querySelectorAll('img.leaflet-tile-loaded').length);
}

async function karimToken(page) {
  await api(page, 'POST', '/auth/otp/request', { phone: KARIM });
  const r = await api(page, 'POST', '/auth/otp/verify', { phone: KARIM, code: '123456' });
  if (r.status !== 200) throw new Error(`connexion API de Karim impossible (${r.status} ${JSON.stringify(r.json)})`);
  return r.json.accessToken;
}

(async () => {
  const browser = await chromium.launch();
  let helper;
  try {
    // ---------- 1. API ----------
    helper = await phone(browser, 'helper');
    await helper.page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded' });
    const health = await api(helper.page, 'GET', '/health');
    const config = await api(helper.page, 'GET', '/config');
    results.checks.health = health;
    results.checks.config = config;
    if (health.status !== 200) throw new Error(`/health → ${health.status}`);
    if (config.status !== 200 || config.json.realtime !== 'poll' || config.json.demoMode !== true)
      throw new Error(`/config inattendu : ${JSON.stringify(config)}`);
    step(`API : /health ${health.status}, /config ${JSON.stringify(config.json)}`);

    // Karim (livreur démo) : hors ligne et sans consentement, comme un livreur « neuf ».
    const kt = await karimToken(helper.page);
    const off = await api(helper.page, 'PATCH', '/driver/availability', { online: false }, kt);
    if (off.status >= 400) throw new Error(`Karim ne peut pas passer hors ligne (${off.status} ${JSON.stringify(off.json)})`);
    await api(helper.page, 'DELETE', '/driver/consent', undefined, kt);
    step('préparation : Karim D. hors ligne, consentement GPS retiré');

    // ---------- 2. Console ----------
    const c = await newPage(browser, 'console', { viewport: { width: 1366, height: 820 } });
    const kp = c.page;
    await kp.goto(`${CONSOLE}/connexion`);
    await kp.getByText('code d’accès démo fourni par Yaar', { exact: false }).first().waitFor({ timeout: 45000 });
    await kp.getByText(WARNING).first().waitFor({ timeout: 10000 });
    results.checks.consoleLoginMentions123456 = (await kp.textContent('body')).includes('123456');
    await shot(kp, 'c01-console-login');
    await kp.getByRole('button', { name: /Contrôleur · Salif K\./ }).click();
    await kp.getByRole('button', { name: 'Recevoir le code' }).click();
    const codeInput = kp.getByLabel('Code d’accès démo (fourni par Yaar)');
    await codeInput.waitFor({ timeout: 30000 });
    await codeInput.fill('123456');
    await kp.getByRole('button', { name: 'Se connecter' }).click();
    await kp.getByText('Code incorrect').waitFor({ timeout: 30000 });
    results.checks.controllerWith123456 = 'refusé';
    step('console : contrôleur avec 123456 → refusé (« Code incorrect »)');
    await codeInput.fill(STAFF);
    await kp.getByRole('button', { name: 'Se connecter' }).click();
    await kp.getByText(/Actualisation automatique toutes les \d+ s/).waitFor({ timeout: 45000 });
    await kp.waitForSelector('.leaflet-marker-icon, .leaflet-interactive', { timeout: 45000 });
    results.checks.consoleMarkers = await kp.locator('.leaflet-marker-icon, .leaflet-interactive').count();
    results.checks.consoleTilesLoaded = await tilesLoaded(kp);
    await shot(kp, 'c02-console-live-map');
    step(
      `console : connecté avec le code d’accès démo, carte en direct (${results.checks.consoleMarkers} marqueurs, ${results.checks.consoleTilesLoaded} tuiles OSM chargées)`,
    );

    // ---------- 3. Application : client ----------
    const client = await phone(browser, 'client');
    const cp = client.page;
    await demoLogin(cp, 'Client · Aminata K.');
    await V(cp.getByText('Commander un repas', { exact: false })).waitFor({ timeout: 45000 });
    const map = cp.getByTestId('address-map');
    await map.waitFor({ timeout: 30000 });
    results.checks.appTilesLoaded = await tilesLoaded(cp);
    step(`client : connecté (Aminata), carte d’adresse (${results.checks.appTilesLoaded} tuiles OSM chargées)`);
    await shot(cp, 'a10-client-home');
    const box = await map.boundingBox();
    await cp.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await cp.mouse.down();
    await cp.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2 - 30, { steps: 8 });
    await cp.mouse.up();
    await cp.waitForTimeout(500);
    await cp.getByPlaceholder('Quartier, rue (ex. Patte d’Oie, secteur 15)').fill('Koulouba, avenue Kwame Nkrumah');
    await cp.getByPlaceholder('Ex. derrière la station Total, portail bleu').fill('Portail vert en face de la pharmacie');
    await V(cp.getByText('🍲 Commander un repas ou des courses')).click();
    await V(cp.getByText('Le Verdoyant', { exact: true })).click();
    await cp.waitForTimeout(2500);
    await V(cp.getByLabel('Ajouter un')).click();
    await V(cp.getByText(/Voir le panier/)).click();
    await cp.waitForTimeout(2000);
    await V(cp.getByText('Moto', { exact: false })).click();
    await cp.waitForTimeout(1500);
    await shot(cp, 'a11-client-checkout');
    await cp.getByTestId('order-button').click();
    await V(cp.getByText(/^Commande #\d+$/)).waitFor({ timeout: 45000 });
    const orderNo = (await V(cp.getByText(/^Commande #\d+$/)).textContent()).replace(/\D/g, '');
    const total = (await V(cp.getByText(/^💵 /)).textContent()).replace(/\D/g, '');
    results.checks.orderNo = orderNo;
    step(`client : commande #${orderNo} passée (${total} FCFA, moto)`);

    // ---------- vendeur ----------
    const seller = await phone(browser, 'seller');
    const sp = seller.page;
    await demoLogin(sp, 'Vendeur · Le Verdoyant');
    await V(sp.getByText('Commandes du jour')).waitFor({ timeout: 45000 });
    const card = (re) =>
      sp
        .locator('div')
        .filter({ hasText: `#${orderNo}` })
        .filter({ hasNotText: new RegExp(`#(?!${orderNo})\\d{4}`) })
        .filter({ has: sp.getByText(re) })
        .last();
    await card(/^Accepter · \d+ min$/).waitFor({ timeout: 45000 });
    await card(/^Accepter · \d+ min$/).getByText(/^Accepter · \d+ min$/).click();
    await card(/^Prête → appeler un livreur$/).waitFor({ timeout: 30000 });
    step(`vendeur : commande #${orderNo} reçue par polling et acceptée`);
    {
      const t = Date.now();
      await V(cp.getByText('Votre commande est en préparation')).waitFor({ timeout: 45000 });
      step(`client : « en préparation » affiché en ${((Date.now() - t) / 1000).toFixed(1)} s`);
    }
    await card(/^Prête → appeler un livreur$/).getByText('Prête → appeler un livreur').click();
    await sp.waitForTimeout(2000);
    step('vendeur : commande prête');
    {
      const t = Date.now();
      await V(cp.getByText('Recherche d’un livreur')).waitFor({ timeout: 45000 });
      step(`client : « Recherche d’un livreur » affiché en ${((Date.now() - t) / 1000).toFixed(1)} s`);
    }

    // ---------- livreur ----------
    const driver = await phone(browser, 'driver', {
      geolocation: { latitude: 12.3714, longitude: -1.5197 },
      permissions: ['geolocation'],
    });
    const dp = driver.page;
    await demoLogin(dp, 'Livreur · Karim D.');
    await dp.getByTestId('online-switch').waitFor({ timeout: 45000 });
    await dp.getByTestId('online-switch').click();
    await dp.getByTestId('tracking-consent').waitFor({ timeout: 30000 });
    await shot(dp, 'a30-driver-consent');
    await dp.getByTestId('accept-tracking-consent').click();
    await V(dp.getByText(/En ligne/)).waitFor({ timeout: 45000 });
    step('livreur : consentement GPS donné, en ligne');
    for (let i = 0; ; i++) {
      await dp.getByTestId('accept-offer').waitFor({ timeout: 120000 });
      await dp.waitForTimeout(500);
      const sheet = await dp.getByText(/Espèces à encaisser/).locator('visible=true').first().textContent();
      const cash = (/Espèces à encaisser : ([^·]+)/.exec(sheet)?.[1] ?? '').replace(/\D/g, '');
      if (cash === total) break;
      step(`livreur : offre d’une autre commande de démo (espèces ${cash}) → refusée`);
      await V(dp.getByText('Refuser', { exact: true })).click();
      await dp.waitForTimeout(1500);
      if (i > 5) throw new Error('offre de la commande de test jamais reçue');
    }
    step(`livreur : offre de la commande #${orderNo} reçue par polling`);
    await shot(dp, 'a31-driver-offer');
    await dp.getByTestId('accept-offer').click();
    await dp.waitForTimeout(2000);
    if (await dp.getByText('Ouvrir la course').locator('visible=true').count()) await V(dp.getByText('Ouvrir la course')).click();
    await V(dp.getByText(/J’ai récupéré la commande/)).waitFor({ timeout: 45000 });
    {
      const t = Date.now();
      await V(cp.getByText('Votre livreur arrive')).waitFor({ timeout: 45000 });
      step(`client : « Votre livreur arrive » affiché en ${((Date.now() - t) / 1000).toFixed(1)} s`);
    }
    await V(dp.getByText(/J’ai récupéré la commande/)).click();
    await V(dp.getByText('Confirmer la livraison')).waitFor({ timeout: 45000 });
    step('livreur : commande récupérée');
    await V(cp.getByText('Code à donner au livreur à la réception')).waitFor({ timeout: 60000 });
    const code = (await V(cp.locator('[aria-label^="Code de livraison"]')).getAttribute('aria-label')).replace(/\D/g, '');
    await shot(cp, 'a15-client-tracking-code');
    step('client : code de livraison et position du livreur affichés');
    await V(dp.getByText('Confirmer la livraison')).click();
    await dp.getByTestId('delivery-code-input').fill(code);
    await dp.getByTestId('deliver-button').click();
    await V(dp.getByText('Livraison confirmée ✅')).waitFor({ timeout: 45000 });
    step('livreur : livraison validée avec le code');
    {
      const t = Date.now();
      await V(cp.getByText('Commande livrée', { exact: true })).waitFor({ timeout: 60000 });
      step(`client : « Commande livrée » affiché en ${((Date.now() - t) / 1000).toFixed(1)} s`);
    }
    await shot(cp, 'a16-client-delivered');

    // ---------- console : course livrée + caisse ----------
    await kp.goto(`${CONSOLE}/courses?q=${orderNo}`);
    await kp.locator('tr', { hasText: orderNo }).filter({ hasText: 'Livrée' }).first().waitFor({ timeout: 45000 });
    step(`console : course #${orderNo} « Livrée »`);
    await kp.goto(`${CONSOLE}/caisse`);
    await kp.getByText('Karim D.').first().waitFor({ timeout: 45000 });
    await shot(kp, 'c03-console-cash');
    step('console : caisse des livreurs chargée (Karim D.)');

    // ---------- 4. avertissement sur l'écran des pièces KYC ----------
    const kyc = await phone(browser, 'kyc');
    const kg = kyc.page;
    await kg.goto(`${APP}/login`);
    await V(kg.getByText('Mode démo : utilisez le code 123456')).waitFor({ timeout: 45000 });
    await kg.getByTestId('phone-input').fill('73000007');
    await V(kg.getByText('Recevoir le code', { exact: true })).click();
    await V(kg.getByText('Mode démo : le code 123456 est accepté')).waitFor({ timeout: 30000 });
    await V(kg.getByText('Valider', { exact: true })).click();
    await kg.waitForTimeout(3000);
    await kg.goto(`${APP}/driver/documents`);
    await V(kg.getByText('Mes documents')).waitFor({ timeout: 45000 });
    await V(kg.getByText(WARNING, { exact: false })).waitFor({ timeout: 15000 });
    results.checks.kycScreenWarning = true;
    step('livreur en attente : avertissement « démonstration publique » sur « Mes documents »');

    results.checks.socketRequests = Object.fromEntries(pages.map(([n, p]) => [n, p.socketCount()]));
    results.ok = true;
  } catch (e) {
    results.ok = false;
    results.error = String(e && e.message ? e.message : e).split('\n').slice(0, 8).join('\n');
    for (const [n, p] of pages) await shot(p, `fail-${n}`);
  } finally {
    // Nettoyage : Karim hors ligne (la démo reste propre pour les visiteurs).
    try {
      if (helper) {
        const kt = await karimToken(helper.page);
        const r = await api(helper.page, 'PATCH', '/driver/availability', { online: false }, kt);
        results.checks.cleanupKarimOffline = r.status;
      }
    } catch (e) {
      results.checks.cleanupKarimOffline = `échec : ${e.message}`;
    }
    results.seconds = Math.round((Date.now() - t00) / 1000);
    await browser.close();
    console.log('\n=== RÉSULTAT ===');
    console.log(JSON.stringify(results, null, 1));
    process.exit(results.ok ? 0 : 1);
  }
})();
