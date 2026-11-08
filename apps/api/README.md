# Yaar Livraison: API

Node 22 + TypeScript + Fastify 5 + Prisma 6 (PostgreSQL 16) + Socket.IO 4 + zod 4 + JWT.
Complete REST and Socket.IO contract: [`docs/API.md`](../../docs/API.md).

## Run it

```bash
# from the repository root
npm install                          # installs every workspace and runs `prisma generate`
cp apps/api/.env.example apps/api/.env   # then adjust DATABASE_URL / JWT_SECRET
npm run db:deploy -w apps/api        # apply migrations (or `npm run db:migrate -w apps/api` while developing)
npm run db:seed -w apps/api          # demo data (WIPES the database in DATABASE_URL)
npm run dev -w apps/api              # http://localhost:3000, hot reload
```

Log in from any client with a seeded phone number (see `docs/API.md` §12) and the code `123456`
(`OTP_DEV_BYPASS=true`, or `DEMO_MODE=true` which also works in production). With `DEMO_MODE=true`, existing console
accounts (`CONTROLLER`, `ADMIN`) do **not** accept `123456`: they use `DEMO_STAFF_CODE` (6 digits, typed after
"Recevoir le code"; defaults to `123456` in dev/test only). Real OTP codes are printed in the API log by `ConsoleSmsProvider`.

| Script | What it does |
|---|---|
| `npm run dev` / `npm start` | start the API (tsx) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | integration tests (vitest) against `TEST_DATABASE_URL` |
| `npm run db:migrate` | create/apply a migration in dev (`prisma migrate dev`) |
| `npm run db:deploy` | apply migrations (CI / production) |
| `npm run db:seed` | wipe + demo data around Ouagadougou |
| `npm run retention` | 12-month purge: GPS pings, client positions/addresses on finished orders, SOS positions, chat messages; expired OTP codes (also runs daily inside the server, and from `GET /cron/daily` on Vercel) |
| `npm run db:seed:if-empty` | demo data only if the database has no user yet (never wipes; used by the Vercel build) |
| `npm run build:vercel` | Vercel build (not named `vercel-build`, which Vercel would run a second time on its own): `prisma generate`, esbuild bundle `dist/vercel.mjs`; **production deployments only** (`VERCEL_ENV=production`): runtime config check (`scripts/check-config.ts`), `prisma migrate deploy`, demo seed if `SEED_DEMO=true` and `DEMO_MODE=true` |
| `npm run build:bundle` | the same without database steps (local check of the bundle) |
| `npm run smoke:vercel` | starts the bundled Vercel handler as an HTTP server (`VERCEL=1`, production, poll, db storage, demo with a test `DEMO_STAFF_CODE`, `ROUTING_PROVIDER=straight`: no call to OSRM) against `DATABASE_URL` and checks `/health`, `/config`, CORS (cached preflight, preview pattern), OTP login (`123456` for client/driver, refused for a controller, staff code accepted), `/me`, `/driver/offers`, a business delivery (quote, creation, public `/track/:token` with the CORS origin of `PUBLIC_APP_URL`, unknown token `404`, cancellation; needs the seeded business `+22671000001`), upload limits (`413` JSON), `/cron/daily`, and the CORS headers of the start-up failure response |

## Local PostgreSQL used during development

No Docker was needed. PostgreSQL 16 binaries are in `/usr/lib/postgresql/16/bin`. A throw-away cluster
was created in `/tmp/yaar-pg` on port **5433**, owned by the `postgres` system user:

```bash
mkdir -p /tmp/yaar-pg && chown postgres:postgres /tmp/yaar-pg
runuser -u postgres -- /usr/lib/postgresql/16/bin/initdb -D /tmp/yaar-pg/data -U postgres --auth=trust
runuser -u postgres -- /usr/lib/postgresql/16/bin/pg_ctl -D /tmp/yaar-pg/data \
  -o "-p 5433 -k /tmp/yaar-pg" -l /tmp/yaar-pg/log.txt start
psql -h localhost -p 5433 -U postgres -c "ALTER USER postgres PASSWORD 'postgres';" \
  -c "CREATE DATABASE yaar_dev;" -c "CREATE DATABASE yaar_test;"
```

(`/tmp` is wiped on reboot: rerun the `pg_ctl ... start` line, or the whole block.)
Migrations after `init` were generated without resetting `yaar_dev`, with a temporary shadow database:
`createdb yaar_shadow`, then `npx prisma migrate diff --from-migrations prisma/migrations
--to-schema-datamodel prisma/schema.prisma --shadow-database-url …/yaar_shadow --script > prisma/migrations/<name>/migration.sql`,
`npx prisma migrate deploy`, then `dropdb yaar_shadow`. With Docker instead:

```bash
docker run -d --name yaar-pg -p 5433:5432 -e POSTGRES_PASSWORD=postgres postgres:16
docker exec yaar-pg psql -U postgres -c "CREATE DATABASE yaar_dev;" -c "CREATE DATABASE yaar_test;"
```

Connection strings (already in `.env.example`):

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/yaar_dev?schema=public
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/yaar_test?schema=public
```

## Tests

`npm test` applies the migrations to `TEST_DATABASE_URL` (`test/globalSetup.ts`), then runs the files one by
one (they share the database and truncate it before each test). Time is controlled with a `ManualClock`,
SMS with a `MemorySmsProvider`, recipient messages with a `MemoryRecipientNotifier`, files go to a temporary encrypted
directory. **No test touches the network**: `ROUTING_PROVIDER=straight` by default, route tests inject a
`FakeRoutingProvider`, OSRM tests inject a fake `fetch`, and `test/setupEnv.ts` makes `fetch` refuse any host other than
`127.0.0.1`/`localhost`.

| File | Covers |
|---|---|
| `auth.test.ts` | OTP request/verify, single-use code, rate limit, role at sign-up, suspended accounts, error format |
| `guards.test.ts` | role guards on console/driver/seller routes, ownership (404), validation errors, empty JSON bodies |
| `orderLifecycle.test.ts` | quote → order → seller → nearest-driver dispatch → pickup → delivery code → cash ledger → ratings; parcels; mobile money refused; cancellation; 30 s offer timeout and next driver; manual (re)assignment; cash limit + deposits |
| `privacy.test.ts` | location pings refused offline, position cleared offline, location broadcast only to the order room during the job, 12-month retention |
| `kyc.test.ts` | driver profile + documents, incomplete/expired file refused, approval, document view audit log, rejection/resubmission, suspension |
| `realtime.test.ts` | Socket.IO JWT auth, `order.subscribe` access control, `order.updated`, `driver.location`, `sos`, room eviction of a reassigned driver, sockets closed on suspension |
| `security.test.ts` | 20 parallel wrong delivery codes (5 evaluated, then 423), parallel wrong OTPs, per-IP rate limit, magic-byte check, console reset/force-deliver/cancel after pickup, busy driver suspension refused, offer without client addresses, seller view after delivery, retention of order/SOS positions, consent, stale drivers, no duplicate offers |
| `pollMode.test.ts` | `REALTIME_MODE=poll`: no Socket.IO, `GET /config`, `runDueWork` (30 s offer timeout → next driver, throttling, shared lease between two instances, lease row created by an atomic upsert and recreated after a `TRUNCATE`), `kick()` budget + `waitUntil` (`@vercel/functions`, no-op outside Vercel), lazy trigger by polling requests, live position + ETA by REST, partial unique indexes on open offers, `updatedSince` (2 s overlap, status filter ignored, oldest change first), `/cron/daily` + `CRON_SECRET`, production/Vercel config rules, WhatsApp OTP placeholder (503) |
| `demo.test.ts` | `DEMO_MODE` as in production: `123456` refused for existing `CONTROLLER`/`ADMIN`, `DEMO_STAFF_CODE` accepted after a code request (same atomic 5-attempt counter, single use), `123456` for clients/sellers/drivers and sign-ups, `/config` never reveals the staff code, config refusals (`OTP_PROVIDER≠console`, missing/123456/malformed staff code in production or on Vercel) |
| `cors.test.ts` | `CORS_ORIGINS` exact origins and one-label wildcard patterns, production refusals (`*`, whole-label `*`), `Access-Control-Max-Age: 7200` on preflights, CORS on error responses, Vercel start-up failure response (500 JSON + CORS, preflight accepted), Vercel upload caps (3 MB decoded, 4.25 MB body → `413 PAYLOAD_TOO_LARGE`) |
| `storage.test.ts` | `STORAGE_DRIVER=db`: encrypted bytes in `StoredFile`, read/replace/delete, wrong key, invalid keys, KYC upload + audited console view, proof photo + audited view |
| `admin.test.ts` | pricing update (audited, used by quotes), store approval/suspension and public view, product photos, users list/suspend/unsuspend, reinstate, concurrent cash deposits, disputes → incidents, seller reject + stats, CSV exports, push notifications, chat, ETA, French zod messages |
| `geo.test.ts` | polyline decoding (Google reference example, round trip, truncated/invalid input), Douglas–Peucker downsampling to ≤ 300 points (first/last kept), projection on the line and remaining share, U-turn ambiguity, bearings, driver heading rule (phone heading vs computed bearing, stationary, ≥ 15 m) |
| `routing.test.ts` | OSRM request (profile per vehicle, `lng,lat`, `overview=full&geometries=polyline`, `User-Agent`, no other data), decoding + downsampling + duration factors, straight-line fallback on timeout (also when `fetch` ignores the abort), HTTP 500, invalid JSON, no route, unexpected shape, invalid polyline, network error (warnings without coordinates); straight provider; `ROUTING_*` env and provider choice; no network in tests |
| `routes.test.ts` | route cache with the injected clock: assignment (pickup leg from the driver + pickup → dropoff duration), pickup (fresh driver position or pickup point), erased on delivery, on-route / off-route (> 120 m) / older than 3 min / wrong leg, 30 s throttle, ping response not waiting for the routing service, two instances = one call (conditional `routeAttemptAt`), `updatedAt` unchanged; visibility (client, driver, console vs seller, other client, before/after, lists); ETA from the route (+ handover + pickup → dropoff) and fallback; heading persisted, exposed and erased offline; `/controller/map` route + heading without calling the provider |
| `business.test.ts` | business deliveries: approved business profile required (`STORE_NOT_APPROVED`), quote (store or custom pickup), validation, creation straight to `SEARCHING_DRIVER` with events, offer to the nearest driver (business address, zone only), tracking token (144 bits, unique), delivery code never shown to the business, recipient messages (link, code, amount; failing/slow/placeholder channel never blocks), visibility (driver, position, route, ETA; other business `404`), `GET /business/deliveries` (scope, `status`, `updatedSince`), cancel before pickup only, cash ledger (`SENDER` at pickup, `RECIPIENT` at delivery, goods owed to the business), `/controller/cash/businesses`, push, CSV columns |
| `tracking.test.ts` | `GET /track/:token`: constant shape, no recipient phone or internal amounts, `amountToPay`, driver/route/ETA only while `ASSIGNED`/`PICKED_UP`, code until delivered/cancelled, `404` unknown/malformed/24 h after the end, per-IP limit (`429`), poll mode dispatch trigger, `PUBLIC_APP_URL` link and CORS origin, configuration rules |
| `seed.test.ts` | `prisma/seed.ts --if-empty` on the empty test database (no network): businesses, B2B deliveries in every status, kept staff/driver phones, cash ledger consistent with `cashHeld`, cached routes of jobs in progress; second run does nothing |

## Code map

```
prisma/schema.prisma         data model (+ migrations/, seed.ts)
src/server.ts                self-host entry point: HTTP (+ Socket.IO in socket mode), dispatch tick (5 s, socket mode), daily retention job
src/vercel.ts                Vercel entry point (bundled to dist/vercel.mjs, imported by api/index.js)
src/app.ts                   buildApp(): dependency wiring, error format, routes (used by tests)
src/config.ts                environment variables (validated with zod)
src/context.ts               AppContext injected in routes/services
src/lib/                     auth (JWT, guards), errors, zod parsing helper, injectable clock, per-IP rate limiter, file checks,
                             CORS origins (exact + one-label `*` patterns)
src/providers/               SmsProvider/OtpProvider (console; WhatsApp placeholder), PushProvider + Notifier, StorageProvider (local disk or Postgres, AES-256-GCM), PaymentProvider (cash; mobile money stub),
                             RoutingProvider (routing.ts: OSRM with straight-line fallback, straight), RecipientNotifier (recipients.ts: console; WhatsApp placeholder)
src/realtime/                Socket.IO gateway (auth, rooms) and RealtimeHub (typed emitters)
src/services/                OrderService, DispatchService, status transitions, serializers (privacy rules, TrackingDto), audit,
                             DeliveryService (deliveries.ts: business deliveries, public tracking, amounts owed),
                             RouteService (routes.ts: cached route per leg, recompute rules, ETA), heading.ts (driver heading)
src/lib/geo.ts               polyline decoding, Douglas–Peucker, projection on a line, bearings
src/routes/                  auth, me, stores+seller, orders, driver, controller, business (/business/deliveries), tracking (public /track/:token)
src/services/work.ts         runDueWork(): dispatch cycle without a long-running process (poll mode), lease in JobLease;
                             defer(): request-triggered background tasks (routes, recipient messages), budget + waitUntil
src/routes/system.ts         GET /config, GET /cron/daily
src/jobs/                    retention job
api/index.js, vercel.json    Vercel function and project configuration; scripts/ = build, runtime config check, smoke test
```

Design notes:
- Every request body/query/param is parsed with a zod schema from `@yaar/shared`; errors are always
  `{ "error": { "code", "message", "details?" } }`.
- Every order status change goes through `transitionOrder()` which checks the shared state machine,
  uses an optimistic lock on the current status and writes an `OrderEvent`.
- `DispatchService` takes a `Clock`; `tick()` expires offers and re-offers waiting orders. In production the
  server calls it every `DISPATCH_TICK_MS`; it also sets offline the drivers silent for `DRIVER_STALE_MINUTES`.
  Offer creation is serialised in-process and `tick()` is single-flight; across instances, partial unique
  indexes (one `OFFERED` offer per order and per driver) make duplicates impossible.
- `REALTIME_MODE=poll` (Vercel): no Socket.IO, no interval. `BackgroundWork.runDueWork()` takes a lease row
  (`JobLease`, one atomic `INSERT … ON CONFLICT DO UPDATE … WHERE` that creates the row on first use and only
  updates it when due: no failing insert) so that one instance runs `dispatch.tick()` at most every `WORK_THROTTLE_MS`;
  it is triggered by polling requests (`WORK_TRIGGER_ROUTES` in `app.ts`) and by `GET /cron/daily`. A request waits
  for it at most `WORK_BUDGET_MS`; past that, the cycle is handed to `waitUntil` (`@vercel/functions`, a no-op
  outside Vercel) so the function is not frozen with the cycle half done and the lease held.
  The in-memory `/auth/*` per-IP rate limits stay per instance.
- Anti-fraud counters (delivery code, OTP) reserve the attempt with a conditional `UPDATE … WHERE attempts < 5`
  before comparing, so parallel requests cannot bypass the limit. Cash deposits use a conditional decrement.
- Back-office recovery of a stuck `PICKED_UP` order: `force-deliver`, `reset-delivery-code`, or cancel (opens
  an incident). A driver on a delivery cannot be suspended.
- Business deliveries (B2B, `docs/API.md` "Livraisons d'entreprise"): a `PARCEL` order linked to the business store,
  the business account as `clientId` (requester), straight to `SEARCHING_DRIVER`; `feePaidBy`/`cashToCollect` drive the
  cash ledger (fee at pickup or at delivery, goods at delivery, `owedToBusiness`); the recipient gets a public tracking
  link (`trackingToken`, 144 bits) and messages through `RecipientNotifier`, in the background (`work.defer()`).
- Road routes (`docs/API.md` "Itinéraires (carte de suivi)"): the route of the current leg is cached on the order
  (`route*` columns) at assignment and pickup and recomputed on pings when the driver is off the line (> 120 m), the
  route is older than 3 min or the leg changed; at most one attempt per order every 30 s across instances (conditional
  `UPDATE` of `routeAttemptAt`), written in raw SQL so that `updatedAt` stays the business-change cursor. Computations
  go through `BackgroundWork.defer()` (same budget + `waitUntil` mechanism as `kick()`): a ping never waits for OSRM.
  `transitionOrder()` erases the cached route at every status change.
- KYC documents and proof photos are encrypted at rest when `STORAGE_ENCRYPTION_KEY` is set (mandatory in
  production) and are only served through audited, authenticated endpoints.

## Déploiement Vercel

Hobby plan, single region `fra1`, Node functions with Fluid compute, Postgres from the **Neon** integration of the
Vercel Marketplace. The whole API is one function (`api/index.js` → `dist/vercel.mjs`) behind a catch-all rewrite.

**Project settings** (Vercel dashboard → New Project → import the repository):

| Setting | Value |
|---|---|
| Root Directory | `apps/api` (keep "Include files outside the root directory" **enabled**: `packages/shared` and the hoisted `node_modules` are outside) |
| Framework Preset | Other (`vercel.json` sets `"framework": null`) |
| Install Command | default (npm installs the workspaces from the repository root, `postinstall` runs `prisma generate`) |
| Build Command | `npm run build:vercel` (from `vercel.json`) |
| Output Directory | `public` (from `vercel.json`, intentionally empty: no source file is served statically) |
| Node.js version | 22.x |
| Function | `api/index.js`, `maxDuration` 30 s, region `fra1`; every path is rewritten to it |
| Cron | `GET /cron/daily` at 02:30 UTC daily (`vercel.json`; Hobby allows once a day) |

Then *Storage → Marketplace → Neon → Create* and connect it to the project (region Frankfurt, `aws-eu-central-1`, to
sit next to `fra1`). The integration adds `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct).

**Environment variables** (Settings → Environment Variables, Production and Preview):

| Variable | Value |
|---|---|
| `DATABASE_URL` | from the Neon integration (pooled; used at runtime) |
| `DATABASE_URL_UNPOOLED` | from the Neon integration (direct; used by `prisma migrate deploy` and the seed during the build) |
| `JWT_SECRET` | generate: `openssl rand -hex 32` |
| `STORAGE_ENCRYPTION_KEY` | generate: `openssl rand -hex 32` (never change it afterwards: stored files would become unreadable) |
| `REALTIME_MODE` | `poll` |
| `STORAGE_DRIVER` | `db` |
| `DEMO_MODE` | `true` for the public demo (code `123456` for clients, sellers, drivers and sign-ups, shown by the mobile app; set `false` before real users). Requires `OTP_PROVIDER=console` |
| `DEMO_STAFF_CODE` | **required with `DEMO_MODE=true`** (in every environment that has it, Preview included): 6 digits, not `123456`, e.g. `node -e "console.log(require('crypto').randomInt(1e5,1e6))"`. Login code of the console accounts (controller, admin: they see KYC documents), typed after "Recevoir le code" (5 attempts per requested code). Mark it *Sensitive*; give it to partners separately, never in a public message. Without it the production build fails at the config check |
| `SEED_DEMO` | `true` (demo accounts created on the first production build only, when the database has no user; skipped with a warning if `DEMO_MODE` is not `true`) |
| `CRON_SECRET` | generate: `openssl rand -hex 32` (Vercel Cron sends it as `Authorization: Bearer …`) |
| `CORS_ORIGINS` | console and mobile-web URLs, comma-separated: `https://yaar-console.vercel.app,https://yaar-livraison.vercel.app,https://yaar-app-mu.vercel.app`. Optional preview pattern, `*` = part of ONE hostname label: `https://yaar-console-*-wendtoin-jairus-kabore-s-projects.vercel.app`. `*` alone and whole-label patterns such as `https://*.vercel.app` are refused in production |
| `TRUST_PROXY` | `true` (client IPs from `X-Forwarded-For`, set by Vercel) |
| `OTP_PROVIDER` | optional, `console` (default; codes in the function logs). `whatsapp` is a placeholder that refuses with 503 (and is refused at start-up with `DEMO_MODE=true`) |
| `ROUTING_PROVIDER` | optional, `osrm` (default: road routes from `ROUTING_OSRM_URL`, straight-line fallback) or `straight` (no external call). The default public FOSSGIS servers (Germany) receive two coordinates per request: demo / pilot only, a sub-processor to declare to the CIL |
| `ROUTING_OSRM_URL` | optional, default `https://routing.openstreetmap.de` (profiles `routed-car`, `routed-bike`). Production: a self-hosted OSRM/Valhalla or a paid routing API |
| `ROUTING_TIMEOUT_MS` | optional, default `2500` (100..10000) |
| `PUBLIC_APP_URL` | optional, default `https://yaar-livraison.vercel.app`: recipients' tracking links `${PUBLIC_APP_URL}/suivi/<token>`; https in production; its origin is always allowed by CORS |
| `RECIPIENT_NOTIFIER` | optional, `console` (default; messages to recipients in the function logs). `whatsapp` is a placeholder (send fails and is logged, the delivery continues); refused with `DEMO_MODE=true` |
| `TRACK_RATE_LIMIT` | optional, default `120` requests per minute and per IP on `GET /track/:token` (`0` = off) |
| `ALLOW_PREVIEW_DB_MIGRATIONS` | leave unset. Preview deployments never run migrations or the seed (they share the production database variables); `true` forces them, only with a separate preview database |

Do **not** set `NODE_ENV`: on Vercel (`VERCEL=1`) the API defaults to `production`, and `NODE_ENV=production` at
install time would skip the devDependencies needed by the build (Prisma CLI, esbuild, tsx). `VERCEL=1` also makes
`poll` and `db` the defaults and refuses `REALTIME_MODE=socket` / `STORAGE_DRIVER=local`. Optional tuning:
`POLL_INTERVAL_MS` (4000), `WORK_THROTTLE_MS` (4000), `WORK_BUDGET_MS` (1500), `LOG_LEVEL`.

What the build does (`scripts/vercel-build.mjs`): `prisma generate` (engines `native` + `rhel-openssl-3.0.x`),
esbuild bundle of `src/vercel.ts` with the TypeScript source of `@yaar/shared` inlined (npm packages, including
`@vercel/functions`, stay external and are traced by Vercel from `node_modules`). Then **only when
`VERCEL_ENV=production`** (or `ALLOW_PREVIEW_DB_MIGRATIONS=true`; otherwise the log says the database steps are
skipped): `scripts/check-config.ts` validates the runtime configuration with the same rules as the API start-up
(an invalid configuration fails the build, so the previous deployment stays online), `prisma migrate deploy` on
`DATABASE_URL_UNPOOLED`, then, if `SEED_DEMO=true` **and** `DEMO_MODE=true`, `prisma/seed.ts --if-empty`
(advisory lock, skipped as soon as one user exists, never wipes; `SEED_DEMO=true` without `DEMO_MODE=true` only
logs a warning).

Clients: read `GET /config` at start-up and switch to polling (`docs/API.md`, "Mode polling (Vercel)").

Check locally before deploying:
```bash
npm run build:bundle -w apps/api     # dist/vercel.mjs
npm run smoke:vercel -w apps/api     # bundled handler as an HTTP server against DATABASE_URL (yaar_dev)
```

Limits to know: request bodies max 4.5 MB on Vercel, so on Vercel the API caps uploaded files at **3 MB decoded**
(`config.maxUploadBytes`; body limit 4.25 MB = 3 MB in base64 + margin) and answers `413 PAYLOAD_TOO_LARGE` in its
JSON format (the mobile app checks the encoded size before sending); functions are frozen between requests, so offer
timeouts are applied when someone polls (see `docs/API.md`); per-IP `/auth/*` limits are per instance; files live in
Postgres (fine for Lot 1 volumes, move to object storage later). If the API cannot start (invalid configuration,
database unreachable), every request gets `500 INTERNAL_ERROR` with the CORS headers of the allowed origins (the
browser apps can show it) and the cause is in the function logs.

Quota (Hobby: 1 M function invocations and 4 h of active CPU per month): every request, `OPTIONS` preflights
included, is an invocation. Preflights are cached 2 h by browsers (`Access-Control-Max-Age: 7200`); an idle console
on the live map makes about 0.32 request/s and stops polling after 15 min without interaction; the mobile app polls
only while the screen that needs it is visible (an online driver keeps polling offers every `POLL_INTERVAL_MS`).
If the runtime logs show `prepared statement "s0" already exists` (pooled connection), append
`&pgbouncer=true` to `DATABASE_URL`; on a cold Neon compute, `&connect_timeout=15` avoids a first-request timeout.

## Environment variables

See `.env.example` (routing: `ROUTING_PROVIDER`, `ROUTING_OSRM_URL`, `ROUTING_TIMEOUT_MS`; business deliveries:
`PUBLIC_APP_URL`, `RECIPIENT_NOTIFIER`, `TRACK_RATE_LIMIT`; all validated at start-up and by `scripts/check-config.ts`).
In production: `NODE_ENV=production`, a random `JWT_SECRET` (`openssl rand -hex 32`),
`STORAGE_ENCRYPTION_KEY` (`openssl rand -hex 32`), `OTP_DEV_BYPASS` is ignored, `CORS_ORIGINS` set to the console
origin (`*` is refused in production), `TRUST_PROXY` set when behind a reverse proxy (otherwise audited IPs are
the proxy's). A real `SmsProvider` (local operator or aggregator) and a real `PushProvider` (Expo Push / FCM)
must be plugged in `src/app.ts` before going live (OTP: `OTP_PROVIDER=whatsapp` selects the placeholder
`WhatsAppOtpProvider` in `src/providers/whatsapp.ts`, whose comment lists what a WhatsApp Business Cloud API
integration needs). `DEMO_MODE=true` re-enables the `123456` code (not for existing console accounts, which use
`DEMO_STAFF_CODE`) and the demo seed in production and logs a loud warning at start-up; it is refused with
`OTP_PROVIDER≠console`, and in production or on Vercel without a valid `DEMO_STAFF_CODE`. The seed refuses to run with `NODE_ENV=production` unless
`SEED_FORCE=true` (`db:seed:if-empty` needs `DEMO_MODE=true` instead and never wipes), and deletes the storage files of previous runs (`kyc/`, `proofs/`, `products/`).
