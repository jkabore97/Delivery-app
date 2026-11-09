/**
 * Démonstration publique (DEMO_MODE=true) : comptes créés par le seed, livreurs du seed dont le déplacement est simulé,
 * connexions qui ne se bloquent pas, réinitialisation contrôlée des données (DEMO_RESET_ID, build Vercel) et garde-fous
 * de l'effacement de la base.
 */
import { startOfDayUtc } from '../lib/time';

/** Comptes de console du seed (connexion avec DEMO_STAFF_CODE en démonstration). */
export const DEMO_STAFF_PHONES: readonly string[] = ['+22670000001', '+22670000002'];

/**
 * Numéros de TOUS les comptes créés par `prisma/seed.ts` (test/seed.test.ts vérifie que la liste est exacte).
 * Les destinataires des livraisons de démonstration n'ont pas de compte et n'y figurent pas.
 */
export const DEMO_ACCOUNT_PHONES: ReadonlySet<string> = new Set([
  ...DEMO_STAFF_PHONES,
  // Entreprises (dont +22671000009, en attente de validation)
  '+22671000001', '+22671000002', '+22671000003', '+22671000004', '+22671000005', '+22671000009',
  // Clients de l'ancien parcours
  '+22672000001', '+22672000002', '+22672000003',
  // Livreurs
  '+22673000001', '+22673000002', '+22673000003', '+22673000004', '+22673000005', '+22673000006', '+22673000007',
]);

/**
 * Livreurs du seed dont le déplacement est simulé pendant leur course en démonstration (DEMO_MODE=true), faute de
 * téléphone qui les conduise (services/demoMotion.ts) : Issouf S. (moto, livraison #1003 récupérée, vers le
 * destinataire) et Abdoul T. (voiture, #1004, vers le point de retrait). Jamais Karim D. (+22673000002), que de vrais
 * navigateurs conduisent (test de bout en bout, essais de l'application livreur), ni aucun autre compte.
 */
export const DEMO_SIMULATED_DRIVER_PHONES: readonly string[] = ['+22673000001', '+22673000004'];

/**
 * Seed : ancienneté (minutes) de la création des deux livraisons déjà livrées (course de 16 min), « hier » et
 * « aujourd'hui » au sens du jour UTC (heure de Ouagadougou), quelle que soit l'heure de la réinitialisation (souvent la
 * nuit) : celle d'hier (créée 20 h plus tôt, au plus tard la veille à 21:00 UTC) n'entre jamais dans « Livrées
 * aujourd'hui » de la console ; celle du jour (créée 3 h plus tôt, au plus tôt à 00:01 UTC, livrée au plus tard 1 min avant
 * le seed) y entre toujours, sauf pour un seed dans la toute première minute de la journée.
 */
export function seededDeliveryAges(now: Date): { yesterdayMinutesAgo: number; todayMinutesAgo: number } {
  const sinceMidnight = Math.floor((now.getTime() - startOfDayUtc(now).getTime()) / 60_000);
  return {
    yesterdayMinutesAgo: Math.max(20 * 60, sinceMidnight + 3 * 60),
    todayMinutesAgo: Math.max(17, Math.min(3 * 60, sinceMidnight - 1)),
  };
}

/** Demandes de code de connexion par numéro et par heure (cas général). */
export const OTP_REQUESTS_PER_HOUR = 5;
/**
 * Démonstration : comptes de console du seed. Plafond relevé (plusieurs partenaires partagent le compte) mais
 * conservé : chaque code demandé permet 5 essais du code d'accès démo (DEMO_STAFF_CODE), le plafond borne la force brute.
 */
export const DEMO_STAFF_OTP_REQUESTS_PER_HOUR = 30;

/**
 * Plafond horaire de demandes de code pour ce numéro. En démonstration, les comptes du seed qui se connectent avec
 * 123456 (entreprises, livreurs, clients) n'en ont pas : plusieurs partenaires testent le même compte et le code envoyé
 * ne protège rien (123456 est accepté). Les comptes de console du seed gardent un plafond (30 / h).
 */
export function otpRequestsPerHour(opts: { demoMode: boolean; phone: string; backOffice: boolean }): number {
  if (!opts.demoMode || !DEMO_ACCOUNT_PHONES.has(opts.phone)) return OTP_REQUESTS_PER_HOUR;
  if (opts.backOffice || DEMO_STAFF_PHONES.includes(opts.phone)) return DEMO_STAFF_OTP_REQUESTS_PER_HOUR;
  return Number.POSITIVE_INFINITY;
}

/* ------------------------------ Réinitialisation de la démo ------------------------------ */

/** Clé de la table AppSetting : identifiant de la dernière réinitialisation de la démo appliquée. */
export const DEMO_RESET_SETTING_KEY = 'demoResetId';

export type DemoResetDecision =
  | { action: 'reset'; resetId: string; reason: string }
  | { action: 'skip'; reason: string }
  | { action: 'refuse'; reason: string };

/**
 * Faut-il effacer la base et recréer les données de démonstration ? Oui seulement si DEMO_RESET_ID est défini,
 * DEMO_MODE=true et SEED_DEMO=true, et qu'il diffère du dernier identifiant appliqué (enregistré en base) :
 * redéployer avec le même identifiant ne fait rien (idempotent). Sans DEMO_MODE ou SEED_DEMO : refus.
 */
export function decideDemoReset(input: {
  resetId: string | undefined;
  demoMode: boolean;
  seedDemo: boolean;
  lastAppliedId: string | null;
}): DemoResetDecision {
  const id = input.resetId?.trim() ?? '';
  if (!id) return { action: 'skip', reason: 'DEMO_RESET_ID non défini' };
  if (!input.demoMode)
    return { action: 'refuse', reason: 'DEMO_RESET_ID exige DEMO_MODE=true (jamais d’effacement de la base hors démonstration)' };
  if (!input.seedDemo) return { action: 'refuse', reason: 'DEMO_RESET_ID exige SEED_DEMO=true' };
  if (input.lastAppliedId === id) return { action: 'skip', reason: `réinitialisation « ${id} » déjà appliquée` };
  return {
    action: 'reset',
    resetId: id,
    reason: input.lastAppliedId === null ? `première réinitialisation (« ${id} »)` : `nouvel identifiant « ${id} » (précédent : « ${input.lastAppliedId} »)`,
  };
}

/* ------------------------------ Garde-fou de l'effacement ------------------------------ */

/** Nom d'hôte de la base (sans identifiants), pour les messages ; '' si l'URL est illisible. */
export function databaseHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** Base locale (poste de développement, CI, socket Unix) ; toute autre base est considérée comme distante. */
export function isLocalDatabaseUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.searchParams.get('host')?.startsWith('/')) return true;
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return host === 'localhost' || host.endsWith('.localhost') || host === '::1' || /^127(\.\d{1,3}){3}$/.test(host);
}

/**
 * Le seed qui vide toutes les tables (`npm run db:seed`) est-il refusé ? Message d'erreur, ou null s'il est permis :
 * jamais en production ni sur une base distante, sauf SEED_FORCE=true. La réinitialisation de la démo
 * (DEMO_RESET_ID, `seed.ts --demo-reset`) a ses propres règles (`decideDemoReset`).
 */
export function wipeRefusal(opts: { nodeEnv: string; databaseUrl: string; seedForce: boolean }): string | null {
  if (opts.seedForce) return null;
  if (opts.nodeEnv === 'production') return 'Seed interdit en production (il vide la base). Forcer avec SEED_FORCE=true.';
  if (!isLocalDatabaseUrl(opts.databaseUrl))
    return (
      `Seed interdit sur une base distante (${databaseHost(opts.databaseUrl) || 'hôte inconnu'}) : il vide toutes les tables. ` +
      'Forcer avec SEED_FORCE=true, ou réinitialiser la démo publique avec DEMO_RESET_ID (build Vercel).'
    );
  return null;
}
