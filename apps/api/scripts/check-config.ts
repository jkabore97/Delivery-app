/**
 * Vérifie la configuration d'exécution (mêmes règles que le démarrage de l'API) avec les variables
 * d'environnement courantes. Utilisé par le build Vercel de production : une configuration invalide
 * (ex. DEMO_MODE=true sans DEMO_STAFF_CODE) fait échouer le build au lieu de publier une API qui
 * répondrait « Démarrage de l'API impossible » à chaque requête. N'affiche aucune valeur secrète.
 *   npx tsx scripts/check-config.ts
 */
import { loadConfig } from '../src/config';

try {
  // Valide aussi ROUTING_PROVIDER / ROUTING_OSRM_URL / ROUTING_TIMEOUT_MS / ROUTING_MAX_RPS (au plus 1 avec les serveurs
  // publics FOSSGIS), PUBLIC_APP_URL (https en production), RECIPIENT_NOTIFIER (console exigé avec DEMO_MODE=true,
  // interdit en production hors démonstration), TRACK_RATE_LIMIT et TRACKING_POLL_INTERVAL_MS.
  const c = loadConfig();
  const routing =
    c.routingProvider === 'osrm'
      ? `itinéraires OSRM ${new URL(c.routingOsrmUrl).host} (${c.routingTimeoutMs} ms, ` +
        `${c.routingMaxRps ? `${c.routingMaxRps} requête(s)/s par instance` : 'sans limite de débit'}, ligne droite de secours)`
      : 'itinéraires en ligne droite (aucun service externe)';
  console.info(
    `Configuration valide : NODE_ENV=${c.nodeEnv}, temps réel ${c.realtimeMode}, stockage ${c.storageDriver}, ` +
      `démo ${c.demoMode ? 'ACTIVÉE' : 'désactivée'}, OTP ${c.otpProvider}, CORS ${c.corsOrigins === '*' ? '*' : c.corsOrigins.join(', ')}, ` +
      `${routing}, liens de suivi ${c.publicAppUrl}/suivi/…, messages aux destinataires ${c.recipientNotifier}, ` +
      `suivi public limité à ${c.trackRateLimit || '∞'} requêtes/min/IP (rafraîchi toutes les ${c.trackingPollIntervalMs / 1000} s), ` +
      `/auth/* limité à ${c.authRateLimitRequest || '∞'} demandes et ${c.authRateLimitVerify || '∞'} vérifications par 10 min et par IP.`,
  );
} catch (err) {
  console.error(`\n✖ ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
