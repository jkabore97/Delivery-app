/**
 * Vérifie la configuration d'exécution (mêmes règles que le démarrage de l'API) avec les variables
 * d'environnement courantes. Utilisé par le build Vercel de production : une configuration invalide
 * (ex. DEMO_MODE=true sans DEMO_STAFF_CODE) fait échouer le build au lieu de publier une API qui
 * répondrait « Démarrage de l'API impossible » à chaque requête. N'affiche aucune valeur secrète.
 *   npx tsx scripts/check-config.ts
 */
import { loadConfig } from '../src/config';

try {
  // Valide aussi ROUTING_PROVIDER / ROUTING_OSRM_URL / ROUTING_TIMEOUT_MS, PUBLIC_APP_URL (https en production),
  // RECIPIENT_NOTIFIER (console exigé avec DEMO_MODE=true) et TRACK_RATE_LIMIT.
  const c = loadConfig();
  const routing =
    c.routingProvider === 'osrm'
      ? `itinéraires OSRM ${new URL(c.routingOsrmUrl).host} (${c.routingTimeoutMs} ms, ligne droite de secours)`
      : 'itinéraires en ligne droite (aucun service externe)';
  console.info(
    `Configuration valide : NODE_ENV=${c.nodeEnv}, temps réel ${c.realtimeMode}, stockage ${c.storageDriver}, ` +
      `démo ${c.demoMode ? 'ACTIVÉE' : 'désactivée'}, OTP ${c.otpProvider}, CORS ${c.corsOrigins === '*' ? '*' : c.corsOrigins.join(', ')}, ` +
      `${routing}, liens de suivi ${c.publicAppUrl}/suivi/…, messages aux destinataires ${c.recipientNotifier}, ` +
      `suivi public limité à ${c.trackRateLimit || '∞'} requêtes/min/IP.`,
  );
} catch (err) {
  console.error(`\n✖ ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
