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
(`OTP_DEV_BYPASS=true`, or `DEMO_MODE=true` which also works in production). Real OTP codes are printed in the API log by `ConsoleSmsProvider`.

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
| `npm run vercel-build` | Vercel build: `prisma generate`, esbuild bundle `dist/vercel.mjs`, `prisma migrate deploy`, seed if `SEED_DEMO=true` |
| `npm run build:bundle` | the same without database steps (local check of the bundle) |
| `npm run smoke:vercel` | starts the bundled Vercel handler as an HTTP server (production + poll + db storage + demo) against `DATABASE_URL` and checks `/health`, `/config`, OTP login, `/me`, `/driver/offers`, `/cron/daily` |

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
SMS with a `MemorySmsProvider`, files go to a temporary encrypted directory.

| File | Covers |
|---|---|
| `auth.test.ts` | OTP request/verify, single-use code, rate limit, role at sign-up, suspended accounts, error format |
| `guards.test.ts` | role guards on console/driver/seller routes, ownership (404), validation errors, empty JSON bodies |
| `orderLifecycle.test.ts` | quote → order → seller → nearest-driver dispatch → pickup → delivery code → cash ledger → ratings; parcels; mobile money refused; cancellation; 30 s offer timeout and next driver; manual (re)assignment; cash limit + deposits |
| `privacy.test.ts` | location pings refused offline, position cleared offline, location broadcast only to the order room during the job, 12-month retention |
| `kyc.test.ts` | driver profile + documents, incomplete/expired file refused, approval, document view audit log, rejection/resubmission, suspension |
| `realtime.test.ts` | Socket.IO JWT auth, `order.subscribe` access control, `order.updated`, `driver.location`, `sos`, room eviction of a reassigned driver, sockets closed on suspension |
| `security.test.ts` | 20 parallel wrong delivery codes (5 evaluated, then 423), parallel wrong OTPs, per-IP rate limit, magic-byte check, console reset/force-deliver/cancel after pickup, busy driver suspension refused, offer without client addresses, seller view after delivery, retention of order/SOS positions, consent, stale drivers, no duplicate offers |
| `pollMode.test.ts` | `REALTIME_MODE=poll`: no Socket.IO, `GET /config`, `runDueWork` (30 s offer timeout → next driver, throttling, shared lease between two instances), lazy trigger by polling requests, live position + ETA by REST, partial unique indexes on open offers, `updatedSince`, `/cron/daily` + `CRON_SECRET`, production/Vercel config rules, `DEMO_MODE`, WhatsApp OTP placeholder (503) |
| `storage.test.ts` | `STORAGE_DRIVER=db`: encrypted bytes in `StoredFile`, read/replace/delete, wrong key, invalid keys, KYC upload + audited console view, proof photo + audited view |
| `admin.test.ts` | pricing update (audited, used by quotes), store approval/suspension and public view, product photos, users list/suspend/unsuspend, reinstate, concurrent cash deposits, disputes → incidents, seller reject + stats, CSV exports, push notifications, chat, ETA, French zod messages |

## Code map

```
prisma/schema.prisma         data model (+ migrations/, seed.ts)
src/server.ts                self-host entry point: HTTP (+ Socket.IO in socket mode), dispatch tick (5 s, socket mode), daily retention job
src/vercel.ts                Vercel entry point (bundled to dist/vercel.mjs, imported by api/index.js)
src/app.ts                   buildApp(): dependency wiring, error format, routes (used by tests)
src/config.ts                environment variables (validated with zod)
src/context.ts               AppContext injected in routes/services
src/lib/                     auth (JWT, guards), errors, zod parsing helper, injectable clock, per-IP rate limiter, file checks
src/providers/               SmsProvider/OtpProvider (console; WhatsApp placeholder), PushProvider + Notifier, StorageProvider (local disk or Postgres, AES-256-GCM), PaymentProvider (cash; mobile money stub)
src/realtime/                Socket.IO gateway (auth, rooms) and RealtimeHub (typed emitters)
src/services/                OrderService, DispatchService, status transitions, serializers (privacy rules), audit
src/routes/                  auth, me, stores+seller, orders, driver, controller
src/services/work.ts         runDueWork(): dispatch cycle without a long-running process (poll mode), lease in JobLease
src/routes/system.ts         GET /config, GET /cron/daily
src/jobs/                    retention job
api/index.js, vercel.json    Vercel function and project configuration; scripts/ = build and smoke test
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
  (`JobLease`, conditional update) so that one instance runs `dispatch.tick()` at most every `WORK_THROTTLE_MS`;
  it is triggered by polling requests (`WORK_TRIGGER_ROUTES` in `app.ts`) and by `GET /cron/daily`.
  The in-memory `/auth/*` per-IP rate limits stay per instance.
- Anti-fraud counters (delivery code, OTP) reserve the attempt with a conditional `UPDATE … WHERE attempts < 5`
  before comparing, so parallel requests cannot bypass the limit. Cash deposits use a conditional decrement.
- Back-office recovery of a stuck `PICKED_UP` order: `force-deliver`, `reset-delivery-code`, or cancel (opens
  an incident). A driver on a delivery cannot be suspended.
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
| Build Command | `npm run vercel-build` (from `vercel.json`) |
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
| `DEMO_MODE` | `true` (code `123456` accepted, shown by the apps; set `false` before real users) |
| `SEED_DEMO` | `true` (demo accounts created on the first build only, when the database has no user) |
| `CRON_SECRET` | generate: `openssl rand -hex 32` (Vercel Cron sends it as `Authorization: Bearer …`) |
| `CORS_ORIGINS` | console and mobile-web URLs, comma-separated, e.g. `https://yaar-console.vercel.app,https://yaar-mobile.vercel.app` (`*` is refused in production) |
| `TRUST_PROXY` | `true` (client IPs from `X-Forwarded-For`, set by Vercel) |
| `OTP_PROVIDER` | optional, `console` (default; codes in the function logs). `whatsapp` is a placeholder that refuses with 503 |

Do **not** set `NODE_ENV`: on Vercel (`VERCEL=1`) the API defaults to `production`, and `NODE_ENV=production` at
install time would skip the devDependencies needed by the build (Prisma CLI, esbuild, tsx). `VERCEL=1` also makes
`poll` and `db` the defaults and refuses `REALTIME_MODE=socket` / `STORAGE_DRIVER=local`. Optional tuning:
`POLL_INTERVAL_MS` (4000), `WORK_THROTTLE_MS` (4000), `WORK_BUDGET_MS` (1500), `LOG_LEVEL`.

What the build does (`scripts/vercel-build.mjs`): `prisma generate` (engines `native` + `rhel-openssl-3.0.x`),
esbuild bundle of `src/vercel.ts` with the TypeScript source of `@yaar/shared` inlined (npm packages stay external
and are traced by Vercel from `node_modules`), `prisma migrate deploy` on `DATABASE_URL_UNPOOLED`, then, if
`SEED_DEMO=true`, `prisma/seed.ts --if-empty` (advisory lock, skipped as soon as one user exists, never wipes).

Clients: read `GET /config` at start-up and switch to polling (`docs/API.md`, "Mode polling (Vercel)").

Check locally before deploying:
```bash
npm run build:bundle -w apps/api     # dist/vercel.mjs
npm run smoke:vercel -w apps/api     # bundled handler as an HTTP server against DATABASE_URL (yaar_dev)
```

Limits to know: request bodies max 4.5 MB on Vercel (keep uploads under ~3.3 MB before base64); functions are
frozen between requests, so offer timeouts are applied when someone polls (see `docs/API.md`); per-IP `/auth/*`
limits are per instance; files live in Postgres (fine for Lot 1 volumes, move to object storage later).
If the runtime logs show `prepared statement "s0" already exists` (pooled connection), append
`&pgbouncer=true` to `DATABASE_URL`; on a cold Neon compute, `&connect_timeout=15` avoids a first-request timeout.

## Environment variables

See `.env.example`. In production: `NODE_ENV=production`, a random `JWT_SECRET` (`openssl rand -hex 32`),
`STORAGE_ENCRYPTION_KEY` (`openssl rand -hex 32`), `OTP_DEV_BYPASS` is ignored, `CORS_ORIGINS` set to the console
origin (`*` is refused in production), `TRUST_PROXY` set when behind a reverse proxy (otherwise audited IPs are
the proxy's). A real `SmsProvider` (local operator or aggregator) and a real `PushProvider` (Expo Push / FCM)
must be plugged in `src/app.ts` before going live (OTP: `OTP_PROVIDER=whatsapp` selects the placeholder
`WhatsAppOtpProvider` in `src/providers/whatsapp.ts`, whose comment lists what a WhatsApp Business Cloud API
integration needs). `DEMO_MODE=true` re-enables the `123456` code and the demo seed in production and logs a loud
warning at start-up. The seed refuses to run with `NODE_ENV=production` unless
`SEED_FORCE=true` (`db:seed:if-empty` needs `DEMO_MODE=true` instead and never wipes), and deletes the storage files of previous runs (`kyc/`, `proofs/`, `products/`).
