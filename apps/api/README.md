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
(`OTP_DEV_BYPASS=true`). Real OTP codes are printed in the API log by `ConsoleSmsProvider`.

| Script | What it does |
|---|---|
| `npm run dev` / `npm start` | start the API (tsx) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | integration tests (vitest) against `TEST_DATABASE_URL` |
| `npm run db:migrate` | create/apply a migration in dev (`prisma migrate dev`) |
| `npm run db:deploy` | apply migrations (CI / production) |
| `npm run db:seed` | wipe + demo data around Ouagadougou |
| `npm run retention` | 12-month purge: GPS pings, client positions/addresses on finished orders, SOS positions, chat messages; expired OTP codes (also runs daily inside the server) |

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
| `admin.test.ts` | pricing update (audited, used by quotes), store approval/suspension and public view, product photos, users list/suspend/unsuspend, reinstate, concurrent cash deposits, disputes → incidents, seller reject + stats, CSV exports, push notifications, chat, ETA, French zod messages |

## Code map

```
prisma/schema.prisma         data model (+ migrations/, seed.ts)
src/server.ts                entry point: HTTP + Socket.IO, dispatch tick (5 s), daily retention job
src/app.ts                   buildApp(): dependency wiring, error format, routes (used by tests)
src/config.ts                environment variables (validated with zod)
src/context.ts               AppContext injected in routes/services
src/lib/                     auth (JWT, guards), errors, zod parsing helper, injectable clock, per-IP rate limiter, file checks
src/providers/               SmsProvider, PushProvider + Notifier, StorageProvider (local disk, AES-256-GCM), PaymentProvider (cash; mobile money stub)
src/realtime/                Socket.IO gateway (auth, rooms) and RealtimeHub (typed emitters)
src/services/                OrderService, DispatchService, status transitions, serializers (privacy rules), audit
src/routes/                  auth, me, stores+seller, orders, driver, controller
src/jobs/                    retention job
```

Design notes:
- Every request body/query/param is parsed with a zod schema from `@yaar/shared`; errors are always
  `{ "error": { "code", "message", "details?" } }`.
- Every order status change goes through `transitionOrder()` which checks the shared state machine,
  uses an optimistic lock on the current status and writes an `OrderEvent`.
- `DispatchService` takes a `Clock`; `tick()` expires offers and re-offers waiting orders. In production the
  server calls it every `DISPATCH_TICK_MS`; it also sets offline the drivers silent for `DRIVER_STALE_MINUTES`.
  Offer creation is serialised in-process and `tick()` is single-flight, so no duplicate open offers.
  Single-instance design for Lot 1 (a second API instance would need a shared lock or a queue, and the
  in-memory `/auth/*` rate limits a shared store).
- Anti-fraud counters (delivery code, OTP) reserve the attempt with a conditional `UPDATE … WHERE attempts < 5`
  before comparing, so parallel requests cannot bypass the limit. Cash deposits use a conditional decrement.
- Back-office recovery of a stuck `PICKED_UP` order: `force-deliver`, `reset-delivery-code`, or cancel (opens
  an incident). A driver on a delivery cannot be suspended.
- KYC documents and proof photos are encrypted at rest when `STORAGE_ENCRYPTION_KEY` is set (mandatory in
  production) and are only served through audited, authenticated endpoints.

## Environment variables

See `.env.example`. In production: `NODE_ENV=production`, a random `JWT_SECRET` (`openssl rand -hex 32`),
`STORAGE_ENCRYPTION_KEY` (`openssl rand -hex 32`), `OTP_DEV_BYPASS` is ignored, `CORS_ORIGINS` set to the console
origin (`*` is refused in production), `TRUST_PROXY` set when behind a reverse proxy (otherwise audited IPs are
the proxy's). A real `SmsProvider` (local operator or aggregator) and a real `PushProvider` (Expo Push / FCM)
must be plugged in `src/app.ts` before going live. The seed refuses to run with `NODE_ENV=production` unless
`SEED_FORCE=true`, and deletes the storage files of previous runs (`kyc/`, `proofs/`, `products/`).
