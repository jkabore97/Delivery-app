# @yaar/shared

Pure TypeScript shared by the API, the console and the mobile app (no runtime dependency except `zod`).

| File | Content |
|---|---|
| `src/enums.ts` | Domain enums as const objects + types (`Role`, `VehicleType`, `OrderStatus`...), `ErrorCode`, French `LABELS` |
| `src/constants.ts` | `OUAGADOUGOU_CENTER`, dispatch / cash / retention defaults, `requiredDocuments(vehicleType)` |
| `src/geo.ts` | `haversineKm`, `roadDistanceKm` (haversine × 1.3) |
| `src/pricing.ts` | `computeDeliveryFee`, `computeDeliveryPrice`, `computeOrderTotals`, `roundUpTo` (50 FCFA), `formatFcfa`, `DEFAULT_PRICING_RULES` |
| `src/orderStatus.ts` | Order state machine: `ORDER_TRANSITIONS`, `canTransition`, `assertTransition`, cancellable / active status lists |
| `src/schemas.ts` | zod schemas of every request body and query (the API validates with these; reuse them in forms) |
| `src/types.ts` | Response DTOs and Socket.IO event maps (`OrderDto`, `ServerToClientEvents`...) |

The package is consumed as TypeScript source (`"main": "src/index.ts"`): the API runs it through `tsx`,
the console through Vite, the mobile app through Metro (`watchFolders` + a relative import or alias).
Imports inside the package are extension-less so every bundler resolves them.

```bash
npm run typecheck -w packages/shared
npm test -w packages/shared        # vitest: pricing, haversine, state machine, schemas
```
