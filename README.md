# Yaar Livraison: Ouagadougou

On-demand delivery platform (bike, motorcycle, car) for clients, sellers, drivers and controllers.

- Project brief and recommendations: [docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md)
- Signable contract (FR): [docs/contrat/Contrat_Plateforme_Livraison_Ouagadougou.pdf](docs/contrat/Contrat_Plateforme_Livraison_Ouagadougou.pdf)
- Mock-ups: [docs/mockups/](docs/mockups/)
- **API contract (REST + Socket.IO): [docs/API.md](docs/API.md)**

## Monorepo

| Path | What | Docs |
|---|---|---|
| `packages/shared` | `@yaar/shared`: types, enums, zod schemas, pricing, haversine, order state machine | [README](packages/shared/README.md) |
| `apps/api` | Fastify + Prisma (PostgreSQL) + Socket.IO API | [README](apps/api/README.md) |
| `apps/console` | React + Vite web console for controllers | [README](apps/console/README.md) |
| `apps/mobile` | Expo app (Client / Vendeur / Livreur modes), own `package.json`, not an npm workspace | `apps/mobile/README.md` |

npm workspaces: `packages/*`, `apps/api`, `apps/console`.

```bash
npm install          # Node 22+
npm run typecheck    # every workspace
npm test             # every workspace (the API tests need PostgreSQL, see apps/api/README.md)
npm run dev:api      # start the API on http://localhost:3000
npm run dev:console  # start the controller console on http://localhost:5173
```

## Déploiement (Vercel)

Three Vercel projects (Hobby plan) built from this repository, plus a Neon Postgres database in Frankfurt
(`aws-eu-central-1`, next to the `fra1` functions). Step-by-step settings: "Déploiement Vercel" in
[apps/api/README.md](apps/api/README.md).

| Project | Root directory | Production URL |
|---|---|---|
| API (Fastify, one function, polling instead of sockets) | `apps/api` | https://yaar-api.vercel.app |
| Controller console (Vite) | `apps/console` | https://yaar-console.vercel.app |
| Mobile app, web build (Expo web, Leaflet maps) | `apps/mobile` | https://yaar-livraison.vercel.app (alias) and https://yaar-app-mu.vercel.app (`yaar-app.vercel.app` belongs to someone else) |

Environment variables (names only; values in the Vercel dashboard, never in git):

- API: `DATABASE_URL`, `DATABASE_URL_UNPOOLED` (Neon integration), `JWT_SECRET`, `STORAGE_ENCRYPTION_KEY`,
  `CRON_SECRET`, `CORS_ORIGINS`, `TRUST_PROXY`, `REALTIME_MODE`, `STORAGE_DRIVER`, `DEMO_MODE`, `DEMO_STAFF_CODE`,
  `SEED_DEMO`, `OTP_PROVIDER`; optional `POLL_INTERVAL_MS`, `WORK_THROTTLE_MS`, `WORK_BUDGET_MS`, `LOG_LEVEL`,
  `ALLOW_PREVIEW_DB_MIGRATIONS` (leave unset).
- Console: `VITE_API_URL`. Mobile web: `EXPO_PUBLIC_API_URL`.

Only production deployments of the API migrate (and, for the demo, seed) the database; preview deployments never
touch it. The current deployment is a **public demo** (`DEMO_MODE=true`): code `123456` in the mobile app, a
separate demo access code (`DEMO_STAFF_CODE`) for the console accounts, fictitious data only.

### Avant le lancement réel

- [ ] `DEMO_MODE=false` and `SEED_DEMO=false` on the API project (then remove `DEMO_STAFF_CODE`).
- [ ] Remove the demo data (demo accounts, orders, KYC files) from the Neon database, or start from a new one.
- [ ] Configure the WhatsApp OTP provider (`OTP_PROVIDER=whatsapp` + a real provider in
      `apps/api/src/providers/whatsapp.ts`; the provider is not chosen yet).
- [ ] Set `CORS_ORIGINS` to the final console and web-app domains only.
- [ ] CIL formalities (Burkina Faso, law n° 001-2021/AN): declaration or authorisation, including the transfer of
      personal data hosted in Frankfurt (Vercel `fra1` + Neon `aws-eu-central-1`), outside Burkina Faso.
- [ ] Legal review of the contracts and texts (terms of use, privacy policy, driver charter) by a local lawyer.
