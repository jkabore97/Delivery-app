import { describe, expect, it, vi } from 'vitest';
import { AVERAGE_SPEED_KMH, haversineKm } from '@yaar/shared';
import { loadConfig } from '../src/config';
import { encodePolyline, type LatLngTuple } from '../src/lib/geo';
import {
  MAX_ROUTE_POINTS,
  OSRM_DURATION_FACTOR,
  OsrmRoutingProvider,
  ROUTING_MAX_QUEUE_WAIT_MS,
  StraightRoutingProvider,
  TokenBucket,
  createRoutingProvider,
  routingUserAgent,
  type FetchLike,
} from '../src/providers/routing';
import { createTestApp, P } from './helpers';

const from = P.centre;
const to = P.patteDOie;

function osrmBody(points: LatLngTuple[], distance = 4321.6, duration = 600.4, code = 'Ok') {
  return JSON.stringify({ code, routes: [{ geometry: encodePolyline(points), distance, duration, legs: [] }], waypoints: [] });
}

function provider(fetchImpl: FetchLike, timeoutMs = 2500) {
  const warnings: string[] = [];
  const p = new OsrmRoutingProvider({ baseUrl: 'https://osrm.example.test/', timeoutMs, fetch: fetchImpl, onWarn: (m) => warnings.push(m) });
  return { p, warnings };
}

describe('OsrmRoutingProvider', () => {
  it('requête : profil par véhicule, lng,lat, overview=full, polyline, User-Agent, aucune autre donnée', async () => {
    const seen: Array<{ url: string; headers: Record<string, string> }> = [];
    const pts: LatLngTuple[] = [
      [12.3686, -1.5275],
      [12.36, -1.522],
      [12.3395, -1.517],
    ];
    const { p, warnings } = provider(async (url, init) => {
      seen.push({ url, headers: init.headers });
      return new Response(osrmBody(pts), { status: 200 });
    });
    const moto = await p.route(from, to, 'MOTO');
    await p.route(from, to, 'BIKE');
    await p.route(from, to, 'CAR');
    expect(seen.map((s) => s.url)).toEqual([
      'https://osrm.example.test/routed-car/route/v1/driving/-1.52750,12.36860;-1.51700,12.33950?overview=full&geometries=polyline',
      'https://osrm.example.test/routed-bike/route/v1/driving/-1.52750,12.36860;-1.51700,12.33950?overview=full&geometries=polyline',
      'https://osrm.example.test/routed-car/route/v1/driving/-1.52750,12.36860;-1.51700,12.33950?overview=full&geometries=polyline',
    ]);
    // Application identifiée avec une URL de contact (règles FOSSGIS), jamais d'adresse e-mail.
    expect(seen[0]!.headers['User-Agent']).toBe(routingUserAgent());
    expect(routingUserAgent()).toBe('YaarLivraison/0.1 (+https://yaar-livraison.vercel.app)');
    expect(routingUserAgent('https://suivi.example.test')).toBe('YaarLivraison/0.1 (+https://suivi.example.test)');
    expect(Object.keys(seen[0]!.headers).sort()).toEqual(['Accept', 'User-Agent']);
    expect(moto).toEqual({ points: pts, distanceM: 4322, durationS: Math.round(600.4 * OSRM_DURATION_FACTOR.MOTO), source: 'osrm' });
    expect(warnings).toEqual([]);
  });

  it('tracé décodé puis réduit à 300 points au plus (premier et dernier conservés), durée ajustée au véhicule', async () => {
    const long: LatLngTuple[] = Array.from({ length: 3000 }, (_, i) => [12.36 + i * 0.00001, -1.53 + Math.sin(i / 9) * 0.001] as LatLngTuple);
    const { p } = provider(async () => new Response(osrmBody(long, 9000, 1000), { status: 200 }));
    const r = await p.route(from, to, 'BIKE');
    expect(r.source).toBe('osrm');
    expect(r.points.length).toBeLessThanOrEqual(MAX_ROUTE_POINTS);
    expect(r.points[0]).toEqual(long[0]);
    expect(r.points.at(-1)).toEqual(long.at(-1)!.map((v) => Math.round(v * 1e5) / 1e5));
    expect(r.durationS).toBe(Math.round(1000 * OSRM_DURATION_FACTOR.BIKE));
  });

  it('délai dépassé : ligne droite et avertissement, sans erreur', async () => {
    const { p, warnings } = provider(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
      40,
    );
    const started = Date.now();
    const r = await p.route(from, to, 'MOTO');
    expect(Date.now() - started).toBeLessThan(1500);
    expect(r.source).toBe('straight');
    expect(r.points).toEqual([
      [from.lat, from.lng],
      [to.lat, to.lng],
    ]);
    expect(warnings[0]).toMatch(/délai de 40 ms dépassé/);
    // Même un fetch qui ignore l'annulation est interrompu par le délai.
    const deaf = provider(() => new Promise<Response>(() => undefined), 40);
    expect((await deaf.p.route(from, to, 'CAR')).source).toBe('straight');
  });

  it('HTTP 500, JSON invalide, pas d’itinéraire, réponse inattendue, réseau en panne : ligne droite', async () => {
    const cases: Array<[string, FetchLike, RegExp]> = [
      ['500', async () => new Response('oops', { status: 500 }), /HTTP 500/],
      ['json', async () => new Response('<html>', { status: 200 }), /JSON invalide/],
      ['noroute', async () => new Response(JSON.stringify({ code: 'NoRoute', routes: [] }), { status: 200 }), /pas d'itinéraire \(NoRoute\)/],
      ['shape', async () => new Response(JSON.stringify({ hello: 'world' }), { status: 200 }), /réponse inattendue/],
      ['geometry', async () => new Response(JSON.stringify({ code: 'Ok', routes: [{ geometry: '~', distance: 1, duration: 1 }] }), { status: 200 }), /tracé invalide/],
      ['network', async () => Promise.reject(new TypeError('fetch failed')), /TypeError/],
    ];
    for (const [name, f, warning] of cases) {
      const { p, warnings } = provider(f);
      const r = await p.route(from, to, 'MOTO');
      expect(r.source, name).toBe('straight');
      expect(warnings[0], name).toMatch(warning);
      // Jamais de coordonnées dans les journaux.
      expect(warnings[0], name).not.toMatch(/12\.36|1\.52/);
    }
  });
});

describe('débit maximal du service (1 requête/s par instance, règle FOSSGIS)', () => {
  /**
   * Horloge manuelle : une attente se termine au tour suivant de la boucle d'événements (comme un vrai minuteur, après
   * le code synchrone) et avance alors l'horloge jusqu'à son échéance, sans dormir.
   */
  function fakeTime() {
    let now = 0;
    const sleeps: number[] = [];
    return {
      now: () => now,
      advance: (ms: number) => {
        now += ms;
      },
      sleep: (ms: number) => {
        const until = now + ms;
        sleeps.push(ms);
        return new Promise<void>((resolve) =>
          setTimeout(() => {
            now = Math.max(now, until);
            resolve();
          }, 0),
        );
      },
      sleeps,
    };
  }

  it('seau à jetons : un appel par seconde, sans rafale ; attente d’une seconde au plus, sinon refus', () => {
    const time = fakeTime();
    const bucket = new TokenBucket(1, time.now, time.sleep);
    expect(bucket.reserve(1000)).toBe(0);
    expect(bucket.reserve(1000)).toBe(1000); // réservé : part dans 1 s
    expect(bucket.reserve(1000)).toBeNull(); // il faudrait attendre 2 s
    expect(bucket.reserve(0)).toBeNull();
    time.advance(1000);
    expect(bucket.reserve(1000)).toBe(1000); // le jeton de cette seconde est déjà réservé
    time.advance(5000);
    expect(bucket.reserve(0)).toBe(0); // jamais plus d'un jeton d'avance (pas de rafale après une pause)
    expect(bucket.reserve(0)).toBeNull();
    const fast = new TokenBucket(4, time.now, time.sleep);
    expect([fast.reserve(1000), fast.reserve(1000), fast.reserve(1000)]).toEqual([0, 250, 500]);
  });

  it('appels simultanés : un par seconde vers OSRM, au-delà d’une seconde d’attente ligne droite (avertissement)', async () => {
    const time = fakeTime();
    const at: number[] = [];
    const warnings: string[] = [];
    const p = new OsrmRoutingProvider({
      baseUrl: 'https://osrm.example.test',
      timeoutMs: 2500,
      rateLimiter: new TokenBucket(1, time.now, time.sleep),
      fetch: async () => {
        at.push(time.now());
        return new Response(osrmBody([[12.3686, -1.5275], [12.3395, -1.517]]), { status: 200 });
      },
      onWarn: (m) => warnings.push(m),
    });
    const results = await Promise.all([p.route(from, to, 'MOTO'), p.route(from, to, 'MOTO'), p.route(from, to, 'MOTO')]);
    expect(results.map((r) => r.source)).toEqual(['osrm', 'osrm', 'straight']);
    expect(at).toEqual([0, 1000]);
    expect(time.sleeps).toEqual([ROUTING_MAX_QUEUE_WAIT_MS]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/débit maximal du service atteint/);
    expect(warnings[0]).not.toMatch(/12\.36|1\.52/);
    // Une seconde plus tard, un nouvel appel part.
    time.advance(1000);
    expect((await p.route(from, to, 'BIKE')).source).toBe('osrm');
  });

  it('ROUTING_MAX_RPS : 1 par défaut, jamais plus (ni 0) avec les serveurs publics FOSSGIS ; libre avec un OSRM auto-hébergé', () => {
    const base = { ...process.env };
    delete base.ROUTING_PROVIDER;
    const c = loadConfig(base);
    expect(c.routingMaxRps).toBe(1);
    const p = createRoutingProvider(c) as OsrmRoutingProvider;
    const opts = (p as unknown as { opts: { rateLimiter: unknown; userAgent: string } }).opts;
    expect(opts.rateLimiter).toBeInstanceOf(TokenBucket);
    expect(opts.userAgent).toBe(routingUserAgent(c.publicAppUrl));
    expect(() => loadConfig({ ...base, ROUTING_MAX_RPS: '0' })).toThrow(/FOSSGIS/);
    expect(() => loadConfig({ ...base, ROUTING_MAX_RPS: '5' })).toThrow(/1 requête par seconde/);
    expect(() => loadConfig({ ...base, ROUTING_MAX_RPS: '-1' })).toThrow(/ROUTING_MAX_RPS/);
    const selfHosted = loadConfig({ ...base, ROUTING_OSRM_URL: 'https://osrm.yaar.test', ROUTING_MAX_RPS: '0' });
    const unlimited = createRoutingProvider(selfHosted) as unknown as { opts: { rateLimiter: unknown } };
    expect(unlimited.opts.rateLimiter).toBeNull();
    expect(loadConfig({ ...base, ROUTING_OSRM_URL: 'https://osrm.yaar.test', ROUTING_MAX_RPS: '20' }).routingMaxRps).toBe(20);
    // Ligne droite : la limite ne s'applique pas (aucun appel).
    expect(loadConfig({ ...base, ROUTING_PROVIDER: 'straight', ROUTING_MAX_RPS: '0' }).routingMaxRps).toBe(0);
  });
});

describe('StraightRoutingProvider', () => {
  it('distance = vol d’oiseau × 1,3 ; durée à la vitesse moyenne du véhicule ; 2 points', async () => {
    const p = new StraightRoutingProvider();
    const km = haversineKm(from, to) * 1.3;
    for (const vt of ['BIKE', 'MOTO', 'CAR'] as const) {
      const r = await p.route(from, to, vt);
      expect(r.source).toBe('straight');
      expect(r.points).toHaveLength(2);
      expect(r.distanceM).toBe(Math.round(km * 1000));
      expect(r.durationS).toBe(Math.round((km / AVERAGE_SPEED_KMH[vt]) * 3600));
    }
  });
});

describe('choix du fournisseur par l’environnement', () => {
  it('ROUTING_PROVIDER : osrm par défaut (URL FOSSGIS, 2,5 s), straight sur demande ; valeurs invalides refusées', () => {
    const base = { ...process.env };
    delete base.ROUTING_PROVIDER;
    const c = loadConfig(base);
    expect(c).toMatchObject({ routingProvider: 'osrm', routingOsrmUrl: 'https://routing.openstreetmap.de', routingTimeoutMs: 2500 });
    expect(createRoutingProvider(c)).toBeInstanceOf(OsrmRoutingProvider);
    expect(createRoutingProvider(loadConfig({ ...base, ROUTING_PROVIDER: 'straight' }))).toBeInstanceOf(StraightRoutingProvider);
    const custom = loadConfig({ ...base, ROUTING_OSRM_URL: 'https://osrm.yaar.test/', ROUTING_TIMEOUT_MS: '900' });
    expect(custom).toMatchObject({ routingOsrmUrl: 'https://osrm.yaar.test', routingTimeoutMs: 900 });
    expect(() => loadConfig({ ...base, ROUTING_PROVIDER: 'google' })).toThrow(/ROUTING_PROVIDER/);
    expect(() => loadConfig({ ...base, ROUTING_OSRM_URL: 'ftp://osrm' })).toThrow(/ROUTING_OSRM_URL/);
    expect(() => loadConfig({ ...base, ROUTING_TIMEOUT_MS: '50' })).toThrow(/ROUTING_TIMEOUT_MS/);
  });

  it('l’application de test utilise la ligne droite (aucun accès réseau) ; fetch vers l’extérieur refusé', async () => {
    const t = await createTestApp();
    try {
      expect(t.ctx.routing).toBeInstanceOf(StraightRoutingProvider);
      await expect(fetch('https://routing.openstreetmap.de/')).rejects.toThrow(/Accès réseau interdit/);
      const spy = vi.spyOn(globalThis, 'fetch');
      await t.ctx.routing.route(from, to, 'MOTO');
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    } finally {
      await t.app.close();
      await t.prisma.$disconnect();
    }
  });
});
