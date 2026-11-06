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
