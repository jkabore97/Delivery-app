// Vérification de bout en bout de la démo EN LIGNE (Vercel) avec un vrai navigateur (Playwright/Chromium).
//
//   E2E_STAFF_CODE=<code d'accès démo des comptes de console> node tools/e2e/live-demo.cjs
//
// Variables (facultatives sauf E2E_STAFF_CODE) :
//   APP_URL      application web (entreprise / livreur / page de suivi)  défaut https://yaar-livraison.vercel.app
//   CONSOLE_URL  console de contrôle                                      défaut https://yaar-console.vercel.app
//   API_URL      API                                                      défaut https://yaar-api.vercel.app
//   E2E_OUT      dossier des captures d'écran                             défaut ./e2e-out
//
// Ce que le script vérifie, dans l'ordre (modèle B2B : une entreprise fait livrer un destinataire sans compte) :
//   1. API : /health et /config (mode poll, démo active, canal OTP « console »).
//   2. Console : avis de démo + avertissement « données réelles », le code 123456 est REFUSÉ pour un
//      contrôleur, le code d'accès démo est accepté, carte en direct avec marqueurs.
//   3. Entreprise (Le Verdoyant) : nouvelle livraison en 3 étapes (destination sur la carte, colis et prix, demande)
//      → écran de suivi avec le lien à envoyer au destinataire.
//   4. Destinataire : ouvre le lien de suivi SANS compte (titre de la page, « Recherche d'un livreur », code).
//   5. Livreur (Karim D.) : écran « Vous êtes prêt ! » (jamais passé en ligne), « Passer en ligne » → consentement GPS,
//      en ligne, reçoit l'offre plein écran par polling (entreprise + zone ; carte sombre sans aucun marqueur du
//      destinataire), l'accepte, récupère le colis, voit le montant à encaisser et saisit le code lu sur la page de
//      suivi → livré ; la page de suivi affiche « Colis livré », l'entreprise « Livrée », la console la course
//      « Livrée » et la caisse du livreur. Aucune requête Socket.IO (mode poll).
//   6. Avertissement « démonstration publique » sur l'écran des pièces KYC d'un livreur.
//
// Montants comparés EXACTEMENT (pas de « se termine par ») : ce que le destinataire paiera (récapitulatif de la
// demande) = montant affiché sur sa page de suivi = espèces de l'offre du livreur = montant à encaisser à la livraison.
// Cartes : marqueurs MapLibre du livreur et du destinataire présents sur la page de suivi.
// Connexions de démonstration sans demande de code (le code 123456 est accepté en mode démo) : le script peut être
// relancé plusieurs fois par heure sans buter sur la limite de 5 codes par numéro.
//
// Effets sur la base de démonstration : une livraison de test est créée et livrée ; Karim D. (livreur moto de démo)
// est remis hors ligne et sans consentement GPS au début, puis hors ligne à la fin.
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

/** Bouton de l'écran de connexion : « Continuer » en démo (aucun code demandé), « Recevoir le code » sinon. */
async function submitPhone(page) {
  const byId = page.getByTestId('login-submit');
  if (await byId.count()) await V(byId).click();
  else await V(page.getByText(/^(Continuer|Recevoir le code)$/)).click();
}

async function demoLogin(page, label) {
  await page.goto(`${APP}/login`);
  await V(page.getByText('Mode démo : utilisez le code 123456')).waitFor({ timeout: 45000 });
  await V(page.getByText(WARNING, { exact: false })).waitFor({ timeout: 10000 });
  results.checks.appLoginWarning = true;
  await V(page.getByText(label, { exact: false })).click();
  await submitPhone(page);
  await V(page.getByText('Mode démo : le code 123456 est accepté')).waitFor({ timeout: 30000 });
  await V(page.getByText('Valider', { exact: true })).click();
}

async function tilesLoaded(page) {
  await page.waitForTimeout(3000);
  // Leaflet : tuiles <img> ; MapLibre : canevas WebGL (pas de tuile <img> à compter, on compte les canevas).
  return page.evaluate(
    () => document.querySelectorAll('img.leaflet-tile-loaded').length || document.querySelectorAll('canvas.maplibregl-canvas').length,
  );
}

const digits = (t) => (t ?? '').replace(/\D/g, '');

/** Montant exact (chiffres) d'un élément de valeur (`<testID>-value`), sinon de l'élément lui-même. */
async function amountOf(page, testID) {
  const value = page.getByTestId(`${testID}-value`);
  if (await value.count()) return digits(await V(value).textContent());
  const el = page.getByTestId(testID);
  return (await el.count()) ? digits(await V(el).textContent()) : '0';
}

function sameAmount(what, a, b) {
  if (a !== b) throw new Error(`montant ${what} : ${a} ≠ ${b}`);
}

/** Marqueurs MapLibre (marqueurs HTML de l'application) présents sur la carte de suivi. */
async function mapMarkers(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="live-map"] .maplibregl-marker')].map((e) => e.getAttribute('data-kind') ?? '?'),
  );
}

async function karimToken(page) {
  // Démonstration : le code 123456 est accepté sans demande préalable (aucun code consommé sur la limite horaire).
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
    const markerSel = '.leaflet-marker-icon, .leaflet-interactive, .maplibregl-marker';
    await kp.waitForSelector(markerSel, { timeout: 45000 });
    results.checks.consoleMarkers = await kp.locator(markerSel).count();
    results.checks.consoleTilesLoaded = await tilesLoaded(kp);
    await shot(kp, 'c02-console-live-map');
    step(
      `console : connecté avec le code d’accès démo, carte en direct (${results.checks.consoleMarkers} marqueurs, ${results.checks.consoleTilesLoaded} tuiles OSM chargées)`,
    );

    // ---------- 3. Entreprise : nouvelle livraison ----------
    const biz = await phone(browser, 'business');
    const bp = biz.page;
    await demoLogin(bp, 'Entreprise · Le Verdoyant');
    await V(bp.getByText('Livraisons en cours')).waitFor({ timeout: 45000 });
    await bp.getByTestId('live-map').first().waitFor({ timeout: 30000 });
    await shot(bp, 'b10-business-deliveries');
    step('entreprise : connectée (Le Verdoyant), livraisons en cours et carte d’ensemble');
    await V(bp.getByTestId('new-delivery')).click();
    await bp.getByTestId('address-map').waitFor({ timeout: 30000 });
    await bp.waitForSelector('[data-testid="address-map"] canvas', { timeout: 30000 });
    await V(bp.getByText('Patte d’Oie', { exact: true })).click(); // suggestion de quartier : la carte s'y déplace
    await bp.waitForTimeout(1500);
    await bp.getByTestId('dropoff-address').fill('Patte d’Oie, rue 15.23 (test e2e)');
    await bp.getByTestId('dropoff-landmark').fill('Derrière la station Total, portail bleu');
    await bp.getByTestId('recipient-name').fill('Destinataire Test e2e');
    await bp.getByTestId('recipient-phone').fill('76 99 00 01');
    await shot(bp, 'b11-new-delivery-destination');
    await bp.getByTestId('wizard-next').click();
    await bp.getByTestId('package-description').fill('Colis de test e2e');
    await bp.getByTestId('vehicle-MOTO').waitFor({ timeout: 30000 });
    await bp.getByTestId('vehicle-MOTO').click();
    await bp.getByTestId('payer-RECIPIENT').click();
    await bp.getByTestId('cash-to-collect').fill('5000');
    await shot(bp, 'b12-new-delivery-package-price');
    await bp.getByTestId('wizard-next').click();
    await bp.getByTestId('request-driver').waitFor({ timeout: 15000 });
    const toPay = await amountOf(bp, 'summary-recipient-pays');
    results.checks.recipientPays = toPay;
    if (!/^\d+$/.test(toPay) || Number(toPay) <= 5000) throw new Error(`montant du récapitulatif inattendu : ${toPay}`);
    await bp.getByTestId('request-driver').click();
    await bp.getByTestId('share-tracking').waitFor({ timeout: 45000 });
    const orderNo = digits(await bp.getByTestId('order-chip').textContent());
    const trackingText = (await bp.getByTestId('tracking-url').textContent()).trim();
    const trackingPath = new URL(/^https?:/.test(trackingText) ? trackingText : `https://${trackingText}`).pathname;
    results.checks.orderNo = orderNo;
    results.checks.trackingPath = trackingPath;
    await shot(bp, 'b13-business-tracking-share-link');
    step(`entreprise : livraison #${orderNo} demandée (moto, le destinataire paie ${toPay} FCFA), lien ${trackingPath}`);

    // ---------- 4. Destinataire : lien de suivi, sans compte ----------
    const rec = await phone(browser, 'recipient');
    const rp = rec.page;
    await rp.goto(`${APP}${trackingPath}`);
    await rp.getByTestId('public-tracking').waitFor({ timeout: 45000 });
    results.checks.trackingTitle = await rp.title();
    if (results.checks.trackingTitle !== 'Suivi de livraison · Yaar Livraison') throw new Error(`titre inattendu : ${results.checks.trackingTitle}`);
    await rp.getByTestId('delivery-code').waitFor({ timeout: 30000 });
    const code = digits(await rp.getByTestId('delivery-code').getAttribute('aria-label'));
    const pageAmount = await amountOf(rp, 'amount-to-pay');
    results.checks.trackingAmount = pageAmount;
    sameAmount('payé par le destinataire (récapitulatif / page de suivi)', toPay, pageAmount);
    await rp.waitForSelector('[data-testid="live-map"] .maplibregl-marker[data-kind="dropoff"]', { timeout: 30000 });
    results.checks.trackingMarkersSearching = await mapMarkers(rp);
    await shot(rp, 'r20-recipient-searching');
    step(`destinataire : page de suivi sans compte (code lu, ${pageAmount} FCFA à payer à la réception = récapitulatif)`);

    // ---------- 5. Livreur ----------
    const driver = await phone(browser, 'driver', {
      geolocation: { latitude: 12.3714, longitude: -1.5197 },
      permissions: ['geolocation'],
    });
    const dp = driver.page;
    await demoLogin(dp, 'Livreur · Karim D.');
    // Dossier validé, jamais passé en ligne (consentement retiré à la préparation) : écran « Vous êtes prêt ! ».
    await dp.getByTestId('ready-screen').waitFor({ timeout: 45000 });
    await V(dp.getByText('Vous êtes prêt !', { exact: true })).waitFor({ timeout: 10000 });
    results.checks.readyScreen = true;
    await shot(dp, 'd29-driver-ready');
    step('livreur : écran « Vous êtes prêt ! » (dossier validé, jamais passé en ligne)');
    await dp.getByTestId('ready-go-online').click();
    await dp.getByTestId('tracking-consent').waitFor({ timeout: 30000 });
    await shot(dp, 'd30-driver-consent');
    await dp.getByTestId('accept-tracking-consent').click();
    // Indicateur légal de l'accueil (« En ligne : suivi GPS actif ») ; le texte du consentement contient aussi
    // « En ligne » : on attend la pastille d'état elle-même.
    await V(dp.getByTestId('online-status').filter({ hasText: /^En ligne/ })).waitFor({ timeout: 45000 });
    results.checks.readyScreenClosedAfterOnline = !(await dp.getByTestId('ready-screen').isVisible().catch(() => false));
    if (!results.checks.readyScreenClosedAfterOnline) throw new Error('l’écran « Vous êtes prêt ! » reste affiché après le passage en ligne');
    step('livreur : consentement GPS donné, en ligne');
    for (let i = 0; ; i++) {
      await dp.getByTestId('accept-offer').waitFor({ timeout: 120000 });
      await dp.waitForTimeout(500);
      const sheet = await V(dp.getByTestId('offer-pickup')).textContent();
      const zone = await V(dp.getByTestId('offer-dropoff')).textContent();
      if (sheet.includes('Le Verdoyant') && zone.includes('Patte d’Oie')) break;
      step(`livreur : offre d’une autre livraison de démo (${sheet} → ${zone}) → refusée`);
      await V(dp.getByTestId('reject-offer')).click();
      await dp.waitForTimeout(1500);
      if (i > 5) throw new Error('offre de la livraison de test jamais reçue');
    }
    results.checks.offerCash = await amountOf(dp, 'offer-cash-total');
    // Espèces de la course : frais au retrait (payés ici par le destinataire, donc 0) + montant à la livraison.
    sameAmount('espèces de l’offre / page de suivi', results.checks.offerCash, pageAmount);
    // Avant acceptation : carte sombre, entreprise et livreur, zone de livraison en cercle, jamais le destinataire.
    await dp.waitForSelector('[data-testid="offer-screen"] canvas.maplibregl-canvas', { timeout: 30000 });
    results.checks.offerMap = await dp.evaluate(() => {
      const root = document.querySelector('[data-testid="offer-screen"]');
      return {
        theme: root?.querySelector('[data-testid="live-map"]')?.getAttribute('data-theme') ?? null,
        markers: [...(root?.querySelectorAll('.maplibregl-marker') ?? [])].map((e) => e.getAttribute('data-kind') ?? '?'),
      };
    });
    if (results.checks.offerMap.markers.includes('dropoff')) throw new Error('offre : marqueur du destinataire sur la carte avant acceptation');
    step(`livreur : offre de la livraison #${orderNo} reçue par polling (Le Verdoyant → Patte d’Oie), carte ${results.checks.offerMap.theme}`);
    await shot(dp, 'd31-driver-offer');
    await dp.getByTestId('accept-offer').click();
    await dp.getByTestId('next-step').waitFor({ timeout: 45000 });
    await shot(dp, 'd32-driver-order-map');
    {
      const t = Date.now();
      await V(rp.getByText('Le livreur récupère votre colis')).waitFor({ timeout: 45000 });
      step(`destinataire : « Le livreur récupère votre colis » affiché en ${((Date.now() - t) / 1000).toFixed(1)} s`);
      await rp.waitForSelector('[data-testid="live-map"] .maplibregl-marker[data-kind="driver"]', { timeout: 45000 });
      const kinds = await mapMarkers(rp);
      results.checks.trackingMarkersAssigned = kinds;
      if (!kinds.includes('driver') || !kinds.includes('dropoff') || !kinds.includes('pickup'))
        throw new Error(`marqueurs de la carte de suivi incomplets : ${kinds.join(', ')}`);
      step(`destinataire : carte MapLibre avec les marqueurs ${kinds.join(', ')}`);
    }
    await dp.getByTestId('pickup-button').click();
    await dp.getByTestId('go-deliver').waitFor({ timeout: 45000 });
    step('livreur : colis récupéré');
    {
      const t = Date.now();
      await V(rp.getByText('Votre colis est en route')).waitFor({ timeout: 45000 });
      step(`destinataire : « Votre colis est en route » affiché en ${((Date.now() - t) / 1000).toFixed(1)} s`);
    }
    await shot(rp, 'r21-recipient-en-route');
    await dp.getByTestId('go-deliver').click();
    await dp.getByTestId('delivery-code-input').waitFor({ timeout: 30000 });
    const collect = await amountOf(dp, 'amount-to-collect');
    results.checks.driverCollects = collect;
    sameAmount('encaissé par le livreur / page de suivi', collect, pageAmount);
    await shot(dp, 'd33-driver-amount-and-code');
    await dp.getByTestId('delivery-code-input').fill(code);
    await dp.getByTestId('deliver-button').click();
    await dp.getByTestId('delivery-success').waitFor({ timeout: 45000 });
    await V(dp.getByText('Livraison confirmée', { exact: true })).waitFor({ timeout: 10000 });
    await shot(dp, 'd34-driver-delivered');
    step('livreur : montant encaissé, code saisi → livraison validée');
    {
      const t = Date.now();
      await V(rp.getByText('Colis livré : merci !')).waitFor({ timeout: 60000 });
      step(`destinataire : « Colis livré : merci ! » affiché en ${((Date.now() - t) / 1000).toFixed(1)} s`);
    }
    await shot(rp, 'r22-recipient-delivered');
    await V(bp.getByText(/^Livrée à /)).waitFor({ timeout: 60000 });
    await shot(bp, 'b14-business-delivered');
    step('entreprise : livraison « Livrée »');

    // ---------- console : course livrée + caisse ----------
    await kp.goto(`${CONSOLE}/courses?q=${orderNo}`);
    await kp.locator('tr', { hasText: orderNo }).filter({ hasText: 'Livrée' }).first().waitFor({ timeout: 45000 });
    step(`console : course #${orderNo} « Livrée »`);
    await kp.goto(`${CONSOLE}/caisse`);
    await kp.getByText('Karim D.').first().waitFor({ timeout: 45000 });
    await shot(kp, 'c03-console-cash');
    step('console : caisse des livreurs chargée (Karim D.)');

    // ---------- 6. avertissement sur l'écran des pièces KYC ----------
    const kyc = await phone(browser, 'kyc');
    const kg = kyc.page;
    await kg.goto(`${APP}/login`);
    await V(kg.getByText('Mode démo : utilisez le code 123456')).waitFor({ timeout: 45000 });
    await kg.getByTestId('phone-input').fill('73000007');
    await submitPhone(kg);
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
