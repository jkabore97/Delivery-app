# Yaar Livraison: API contract (Lot 1)

This is the single source of truth for the console (`apps/console`) and the mobile app (`apps/mobile`).
Every request/response type named here is exported by `@yaar/shared` (`packages/shared/src/types.ts`),
and every request body is validated by the zod schema of the same name in `packages/shared/src/schemas.ts`.
Clients should import those types and, ideally, validate forms with the same schemas.

- Base URL (dev): `http://localhost:3000` (no path prefix). On an Android emulator use `http://10.0.2.2:3000`.
- Socket.IO: same origin, default path `/socket.io`, **only when `GET /config` says `realtime: "socket"`**.
  On Vercel the API runs in polling mode (no socket): see [Mode polling (Vercel)](#mode-polling-vercel).
- Content type: `application/json; charset=utf-8` for every request body and every JSON response.
- Dates: ISO 8601 strings in UTC (`2026-11-06T19:23:16.018Z`). Ouagadougou is UTC+0 all year, so "today" = UTC day.
- Money: integers in FCFA. Distances: kilometres with one decimal. Coordinates: decimal degrees (WGS84).
- IDs: opaque strings (cuid). `number` on orders is the human-readable order number (starts at 1001, shown as `#1048`).
- Phone numbers: Burkina Faso numbers. Input accepts `70123456`, `70 12 34 56`, `+22670123456`, `0022670123456`;
  the API always returns E.164 `+22670123456`.
- UI language is French. API error `message`s are French sentences that can be shown to users as-is.

**Product model (owner decision, 8 Nov 2026): business deliveries (B2B, like Uber Direct / DoorDash Drive).**
The platform is for **businesses** (role `SELLER`, "entreprise") that request a delivery to a **recipient** (a person
or another business). The recipient has **no account**: they receive a message with a public tracking link and the
delivery code, pay the driver in cash if needed, and follow the driver on a live map. See
[Livraisons d'entreprise](#livraisons-dentreprise) and [Suivi public du destinataire](#suivi-public-du-destinataire).
The former **client ordering flow** (role `CLIENT`, store browsing, products, cart, FOOD orders, `POST /orders/quote`,
`POST /orders`, seller accept / ready / reject, saved addresses, client ↔ driver chat) is **deprecated**: it still works
and stays documented below for existing builds, but new screens must not use it; it will be removed in a later version.

## Contents

1. [Conventions](#1-conventions): auth, errors, pagination, files, empty bodies
2. [Enums](#2-enums)
3. [Auth and profile](#3-auth-and-profile)
4. [Stores and catalogue](#4-stores-and-catalogue)
5. [Seller space](#5-seller-space)
6. [Orders](#6-orders)
   - [Livraisons d'entreprise](#livraisons-dentreprise): a business requests a delivery to a recipient without an account
   - [Suivi public du destinataire](#suivi-public-du-destinataire): public tracking page `GET /track/:token`
7. [Driver space](#7-driver-space)
8. [Controller console](#8-controller-console)
9. [Realtime (Socket.IO)](#9-realtime-socketio)
   - [Mode polling (Vercel)](#mode-polling-vercel): no socket, what to poll and how often
   - [Itinéraires (carte de suivi)](#itinéraires-carte-de-suivi): road routes, driver heading, arrival time
10. [Visibility and privacy rules](#10-visibility-and-privacy-rules)
11. [Business rules reference](#11-business-rules-reference)
12. [Demo accounts (seed)](#12-demo-accounts-seed)
13. [Lot 1 scope: implemented and deferred](#13-lot-1-scope-implemented-and-deferred)
14. [Changelog](#14-changelog)

---

## 1. Conventions

### 1.1 Authentication

Login is phone number + 6-digit SMS code (OTP). The API returns a JWT access token (HS256, valid
`expiresIn` seconds, 7 days by default). There is no refresh token in Lot 1: when a request returns
`401 UNAUTHENTICATED`, send the user back to the login screen.

Send the token on every request except `/health` and `/auth/*`:

```
Authorization: Bearer <accessToken>
```

Every authenticated request reloads the user: a suspended account gets `403 ACCOUNT_SUSPENDED` immediately,
even with a valid token.

Development: when the API runs with `OTP_DEV_BYPASS=true` (never in production) the code `123456` is always
accepted and real codes are printed in the API log instead of being sent by SMS.
Public demo (`DEMO_MODE=true`, announced by `GET /config`): `123456` is accepted for `CLIENT`, `SELLER` and
`DRIVER` accounts and for new sign-ups (which can never be back-office accounts), **not** for existing
`CONTROLLER`/`ADMIN` accounts: they use the demo access code (`DEMO_STAFF_CODE`, never exposed by the API) in
place of the received code, after `POST /auth/otp/request` (§3).

### 1.2 Roles

| Role | Who | Created by |
|------|-----|------------|
| `CLIENT` | Customer ordering food or parcels | self sign-up (default) |
| `SELLER` | Restaurant / shop owner | self sign-up (`role: "SELLER"`) |
| `DRIVER` | Delivery driver (bike, moto, car) | self sign-up (`role: "DRIVER"`), then KYC approval |
| `CONTROLLER` | Back-office agent (console) | an `ADMIN` (`POST /controller/staff`) or the seed |
| `ADMIN` | Back-office administrator | the seed |

One account = one role. `ADMIN` can do everything `CONTROLLER` can, plus create staff and suspend staff.
In this document "back office" means `CONTROLLER` or `ADMIN`.

A call with a valid token but the wrong role gets `403 FORBIDDEN`. A resource that exists but does not
belong to the caller (another client's order, another seller's store...) gets `404 NOT_FOUND` so that its
existence is not revealed.

### 1.3 Error format

Every non-2xx response has this body (`ApiErrorBody`):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Données invalides (dropoff.lat) : Too big: expected number to be <=90",
    "details": {
      "dropoff.lat": ["Too big: expected number to be <=90"],
      "dropoff.lng": ["Invalid input: expected number, received undefined"],
      "dropoff.address": ["Invalid input: expected string, received undefined"]
    }
  }
}
```

`details` is only present for validation errors (key = dotted path in the body/query, `_` for the root).

| HTTP | `code` | When |
|------|--------|------|
| 400 | `VALIDATION_ERROR` | Body, query or path parameter rejected by zod; malformed JSON |
| 400 | `OTP_INVALID` | Wrong, expired or exhausted OTP code |
| 400 | `PAYMENT_METHOD_UNAVAILABLE` | `MOBILE_MONEY` requested (Lot 2) |
| 400 | `DELIVERY_CODE_INVALID` | Wrong 4-digit delivery code (message says how many attempts remain) |
| 401 | `UNAUTHENTICATED` | Missing, invalid or expired token |
| 403 | `FORBIDDEN` | Wrong role, or action not allowed for this account |
| 403 | `ACCOUNT_SUSPENDED` | Account suspended by the back office |
| 403 | `DRIVER_NOT_APPROVED` | Driver tries to go online before KYC approval (or while suspended) |
| 403 | `DRIVER_OFFLINE` | Location ping sent while offline (privacy rule) |
| 403 | `CONSENT_REQUIRED` | Driver tries to go online without having consented to GPS tracking (§7.2) |
| 403 | `STORE_NOT_APPROVED` | Business delivery or quote requested by a `SELLER` without a business profile (store) validated by the console |
| 404 | `NOT_FOUND` | Unknown route or resource, or resource not visible to the caller |
| 409 | `CONFLICT` | Generic state conflict (duplicate, concurrent update, deposit above balance...) |
| 409 | `INVALID_TRANSITION` | Order status change not allowed by the state machine |
| 409 | `DRIVER_BUSY` | Driver has an active delivery (cannot go offline, cannot be assigned, cannot be suspended) |
| 409 | `DRIVER_OFFLINE` | Manual assignment of an offline driver |
| 409 | `ORDER_NOT_ACTIVE` | Message sent outside `ASSIGNED`/`PICKED_UP` |
| 409 | `CASH_LIMIT_REACHED` | Driver holds `>= cashLimit` FCFA: cannot go online / be assigned |
| 409 | `KYC_INCOMPLETE` | Approval attempted while a required document is missing or expired |
| 409 | `STORE_CLOSED` | Ordering from a closed store |
| 409 | `PRODUCT_UNAVAILABLE` | A product in the cart is unavailable |
| 409 | `PRICING_UNAVAILABLE` | No active pricing rule for the vehicle type |
| 409 | `OFFER_EXPIRED` | Offer no longer open (expired, rejected, cancelled, order taken) |
| 409 | `ALREADY_RATED` | The caller already rated this order |
| 413 | `PAYLOAD_TOO_LARGE` | Decoded file over 5 MB (**3 MB on Vercel**), or body over 6.9 MB (**4.25 MB on Vercel**; above 4.5 MB Vercel itself answers `413` without the JSON body) |
| 415 | `UNSUPPORTED_FILE` | File content (magic bytes) does not match the declared `mimeType` |
| 423 | `DELIVERY_CODE_LOCKED` | 5 wrong delivery codes: the back office must handle it |
| 429 | `OTP_RATE_LIMITED` | More than 5 OTP requests for one phone in one hour |
| 429 | `RATE_LIMITED` | Too many `/auth/*` requests from one IP (default 20 code requests / 60 verifications per 10 min), or too many `GET /track/:token` (default 120 per minute) |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### 1.4 Pagination

List endpoints marked *paginated* accept `?page=1&pageSize=20` (`pageSize` max 100) and return `Paginated<T>`:

```json
{ "items": [ ... ], "total": 42, "page": 1, "pageSize": 20 }
```

### 1.5 Action endpoints without a body

`POST` actions that take no input (`/orders/:id/ready`, `/orders/:id/pickup`, `/driver/offers/:id/accept`, approve...)
accept no body, an empty body with `Content-Type: application/json`, or the JSON body `{}` (all read as `{}`).
Malformed JSON → `400 VALIDATION_ERROR` "JSON invalide".

### 1.6 File uploads (base64 JSON)

KYC documents and delivery proof photos are sent inside JSON (`FileUploadInput`):

```json
{ "mimeType": "image/jpeg", "dataBase64": "/9j/4AAQSkZJRgABAQAAAQABAAD..." }
```

- `mimeType`: `image/jpeg` | `image/png` | `image/webp` | `application/pdf`.
- `dataBase64`: raw base64 **without** the `data:image/jpeg;base64,` prefix. Max 5 MB once decoded, **3 MB on
  Vercel** (`VERCEL_MAX_UPLOAD_BYTES`: 4 MB in base64, under the 4.5 MB request limit of Vercel); over it,
  `413 PAYLOAD_TOO_LARGE` with a French message. The mobile app checks the encoded size (≤ `base64Length(3 MB)`)
  before sending, whatever the server.
- On mobile, compress photos (e.g. 1280 px, JPEG quality 0.6) before upload: the network is slow.
- The decoded content must match `mimeType` (JPEG/PNG/WebP/PDF signature), otherwise `415 UNSUPPORTED_FILE`.

Files are stored encrypted (AES-256-GCM) and are only downloadable through the authenticated binary
endpoints below (`GET .../documents/:documentId`, `GET /orders/:id/proof-photo`, `GET /products/:id/photo`).
Those return the raw file with its `Content-Type`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`
and `Content-Disposition: inline`; fetch them with the `Authorization` header and
display them through a blob / object URL (an `<img src>` cannot send the header).

### 1.7 Health

`GET /health` (public) → `200 {"status":"ok","time":"2026-11-06T19:26:46.679Z"}`

### 1.8 Public configuration

`GET /config` (public, no auth) → `PublicConfigDto`. Read it when the app starts, before logging in.
```json
{ "realtime": "poll", "pollIntervalMs": 4000, "demoMode": true, "otpChannel": "console" }
```
- `realtime`: `"socket"` → connect Socket.IO (§9); `"poll"` → do not open a socket, poll the REST endpoints
  listed in [Mode polling (Vercel)](#mode-polling-vercel) every `pollIntervalMs`.
- `demoMode`: `true` → public demonstration, even in production. Mobile app login: show "Mode démo : utilisez le
  code 123456" (accepted for clients, sellers, drivers and new sign-ups). Console login: say that the console demo
  accounts use the "code d'accès démo fourni par Yaar" (never pre-filled, never returned by the API: `123456` is
  refused for `CONTROLLER`/`ADMIN`). Show `DEMO_DATA_WARNING` from `@yaar/shared` on login screens and on the
  driver KYC upload screen ("Démonstration publique : n’utilisez pas de vraies pièces d’identité ni de vraies
  données personnelles."). Never `true` with real users.
- `otpChannel`: how the login code is delivered: `"console"` (written in the API log: demo/dev), `"whatsapp"`
  (planned, not implemented yet: `POST /auth/otp/request` answers `503 OTP_PROVIDER_UNAVAILABLE`),
  `"sms"` (reserved). Use it for the wording ("Code envoyé par WhatsApp" / "par SMS").

---

## 2. Enums

All enums are exported from `@yaar/shared` both as constant objects and as types (e.g. `OrderStatus.DELIVERED`
and `type OrderStatus`). French UI labels are in `LABELS` (e.g. `LABELS.orderStatus.SEARCHING_DRIVER`).

| Enum | Values |
|------|--------|
| `Role` | `CLIENT`, `SELLER`, `DRIVER`, `CONTROLLER`, `ADMIN` |
| `VehicleType` | `BIKE` (Vélo), `MOTO` (Moto), `CAR` (Voiture) |
| `DriverStatus` | `PENDING`, `APPROVED`, `REJECTED`, `SUSPENDED` |
| `DocumentType` | `CNIB`, `PERMIS`, `CARTE_GRISE`, `ASSURANCE`, `SELFIE` |
| `OrderType` | `FOOD` (from a store), `PARCEL` (A to B) |
| `OrderStatus` | `PENDING`, `ACCEPTED`, `READY`, `SEARCHING_DRIVER`, `ASSIGNED`, `PICKED_UP`, `DELIVERED`, `CANCELLED` |
| `PaymentMethod` | `CASH`, `MOBILE_MONEY` (reserved, rejected in Lot 1) |
| `PaymentStatus` | `PENDING`, `PAID`, `CANCELLED` |
| `OfferStatus` | `OFFERED`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `CANCELLED` |
| `CashEntryType` | `COLLECTION` (+, cash collected at delivery), `DEPOSIT` (-, cash handed to the company) |
| `IncidentType` | `SOS`, `DISPUTE`, `OTHER` |
| `IncidentStatus` | `OPEN`, `IN_PROGRESS`, `RESOLVED` |
| `StoreApprovalStatus` | `PENDING` (new store, hidden from clients), `APPROVED`, `SUSPENDED` |

Required KYC documents (`requiredDocuments(vehicleType)` in shared):

| Vehicle | Plate | Documents |
|---------|-------|-----------|
| `BIKE` | not required | `CNIB`, `SELFIE` |
| `MOTO` | required | `CNIB`, `PERMIS`, `CARTE_GRISE`, `ASSURANCE` (with `expiresAt`), `SELFIE` |
| `CAR` | required | `CNIB`, `PERMIS`, `CARTE_GRISE`, `ASSURANCE` (with `expiresAt`), `SELFIE` |

---

## 3. Auth and profile

### `POST /auth/otp/request` (public)

Body `RequestOtpInput`: `{ "phone": "70 11 22 33" }`

`200` → `OtpRequestResponse`
```json
{ "sent": true, "expiresInSeconds": 300 }
```
Errors: `400 VALIDATION_ERROR` (bad phone), `429 OTP_RATE_LIMITED` (max 5 per phone per hour),
`429 RATE_LIMITED` (too many requests from this IP, `AUTH_RATE_LIMIT_REQUEST`, default 20 per 10 min),
`503 OTP_PROVIDER_UNAVAILABLE` (the delivery channel is not configured, e.g. `OTP_PROVIDER=whatsapp` before a
WhatsApp provider is plugged in; in demo mode the code `123456` still works).

### `POST /auth/otp/verify` (public)

Body `VerifyOtpInput`:
```json
{ "phone": "+22672000001", "code": "123456", "role": "CLIENT", "name": "Aminata K." }
```
- `code`: 6 digits.
- `role` (optional, default `CLIENT`): one of `CLIENT`, `SELLER`, `DRIVER`. **Only used when the account is created.**
  For an existing account it is ignored and the stored role is returned. `CONTROLLER`/`ADMIN` → 400.
- `name` (optional): only used at creation (can be set later with `PATCH /me`).

`200` → `AuthResponse`
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenType": "Bearer",
  "expiresIn": 604800,
  "isNewUser": false,
  "user": {
    "id": "cmw5d3yzl001e7d3b0dnx4mx2",
    "phone": "+22672000003",
    "name": "Mariam O.",
    "role": "CLIENT",
    "isSuspended": false,
    "suspensionReason": null,
    "createdAt": "2026-11-06T19:23:16.065Z"
  }
}
```
Errors: `400 OTP_INVALID` ("Code incorrect" / "Code invalide ou expiré. Demandez un nouveau code."),
`403 ACCOUNT_SUSPENDED`, `429 RATE_LIMITED` (per IP, default 60 per 10 min). Each attempt is reserved
atomically before the comparison: parallel requests cannot exceed 5 attempts per code.

Demo mode (`DEMO_MODE=true`): `123456` logs in any `CLIENT`/`SELLER`/`DRIVER` account and creates new accounts
(no `otp/request` needed). An existing `CONTROLLER`/`ADMIN` account gets `400 OTP_INVALID` with `123456`; it must
call `otp/request` then send the demo access code (`DEMO_STAFF_CODE`) as `code`: it is checked like the sent
code (timing-safe comparison, same atomic 5-attempt counter, single use). The sent code also still works.

Mobile flow: phone screen → `otp/request` → code screen (+ role choice "Je suis client / vendeur / livreur"
for first-time users) → `otp/verify` → route by `user.role` (CLIENT, SELLER, DRIVER modes). A back-office
account logging into the mobile app should get a message "Utilisez la console web".
Console flow: same two calls; reject any role other than `CONTROLLER`/`ADMIN` client-side.

### `GET /me` (any role) → `UserDto`

### `PATCH /me` (any role)

Body: `{ "name": "Aminata Kaboré" }` → `200 UserDto`

### Saved addresses (`CLIENT`)

`SavedAddressDto`: `{ id, label, lat, lng, address, landmark, createdAt }`

| Method & path | Body | Response |
|---|---|---|
| `GET /me/addresses` | | `200 SavedAddressDto[]` (newest first) |
| `POST /me/addresses` | `{ "label": "Maison", "lat": 12.3395, "lng": -1.517, "address": "Patte d'Oie, secteur 15", "landmark": "Derrière la station Total, portail bleu" }` | `201 SavedAddressDto` |
| `DELETE /me/addresses/:id` | | `204` |

### Push notifications (any role)

| Method & path | Body | Response |
|---|---|---|
| `POST /me/push-tokens` | `PushTokenInput` `{ "token": "ExponentPushToken[xxxx]", "platform": "expo" }` (`platform`: `expo` (default) \| `fcm` \| `apns`) | `204`. Call after login and when the token changes. A token belongs to the last account that registered it. |
| `DELETE /me/push-tokens` | `{ "token": "ExponentPushToken[xxxx]" }` | `204`. Call on logout. |

The API sends a push (through the `PushProvider` interface; Lot 1 dev implementation logs it) when:
a driver receives an offer ("Nouvelle course"), is assigned or un-assigned by the console; a seller receives a
new order or a cancellation; the client's order is accepted, assigned, picked up, delivered or cancelled; a
chat message arrives (§6.7). The push `data` always carries `orderId` (and `offerId` for offers).

---

## 4. Stores and catalogue

> **Deprecated (client ordering flow).** Store browsing, products and photos are only used by the former client
> ordering flow. In the B2B model a store is the **business profile** of a `SELLER` (§5).

### `GET /stores` (any role, *paginated*)

Only stores validated by the console (`approvalStatus: "APPROVED"`) are listed. Query: `lat`, `lng` (optional, the client's map position: adds `distanceKm` and sorts open stores first then by distance),
`q` (name search), `openOnly=true|false`, `page`, `pageSize`.

`200` → `Paginated<StoreDto>`
```json
{
  "items": [
    {
      "id": "cmw5d3yyo00047d3btdhgncnv",
      "ownerId": "cmw5d3yym00027d3b3ll7ibce",
      "name": "Le Verdoyant",
      "description": "Cuisine burkinabè et grillades",
      "phone": "+22671000001",
      "address": "Avenue Kwame Nkrumah, centre-ville",
      "landmark": "En face de la BCEAO",
      "lat": 12.3686,
      "lng": -1.5275,
      "isOpen": true,
      "prepTimeMinutes": 15,
      "openingHours": "Lun-Dim 10h-23h",
      "commissionPercent": null,
      "distanceKm": 3.4,
      "approvalStatus": "APPROVED",
      "approvalNote": null,
      "createdAt": "2026-11-06T19:23:16.032Z"
    }
  ],
  "total": 4, "page": 1, "pageSize": 20
}
```
`distanceKm` is straight-line distance (null when `lat`/`lng` are not given).
`commissionPercent` and `approvalNote` are internal: they are filled only for the store owner (`/seller/*`,
`GET /stores/:id` by the owner) and the back office, and are `null` for clients and drivers.

### `GET /stores/:storeId` (any role) → `StoreDetailDto`

`StoreDto` + `products: ProductDto[]` sorted by category then name. Clients only receive products with
`isAvailable: true`; other roles receive all (non-deleted) products. A store that is not `APPROVED` → `404`,
except for its owner and the back office.

```json
{
  "...": "StoreDto fields",
  "products": [
    { "id": "cmw5d3yyx000c7d3bmg7x1yyn", "storeId": "cmw5d3yyo00047d3btdhgncnv", "name": "Bissap 50 cl",
      "description": "", "category": "Boissons", "price": 500, "isAvailable": true,
      "photoUrl": "/products/cmw5d3yyx000c7d3bmg7x1yyn/photo" }
  ]
}
```
`photoUrl` (null without photo) is a path on the API: `GET /products/:productId/photo` (any authenticated
role, `Authorization` header required, see §1.6) returns the image.

---

## 5. Seller space (`SELLER`)

In the B2B model a `SELLER` account is a **business** ("entreprise"). Its store, validated by the console (§8.5), is
the business profile: name and phone shown to recipients, default pickup address of its deliveries
([Livraisons d'entreprise](#livraisons-dentreprise)). Products, stats and the accept / reject / ready actions below
belong to the **deprecated** client ordering flow.

A seller can own several stores. All routes check ownership (`404` otherwise).

| Method & path | Body | Response |
|---|---|---|
| `GET /seller/stores` | | `200 StoreDto[]` |
| `POST /seller/stores` | `StoreCreateInput` | `201 StoreDto` (created **closed** and `approvalStatus: "PENDING"`: invisible to clients until the console approves it, §8.5) |
| `PATCH /seller/stores/:storeId` | `StoreUpdateInput` (any subset) | `200 StoreDto` |
| `GET /seller/stores/:storeId/products` | | `200 ProductDto[]` (includes unavailable) |
| `POST /seller/stores/:storeId/products` | `ProductCreateInput` | `201 ProductDto` |
| `PATCH /seller/products/:productId` | `ProductUpdateInput` (any subset) | `200 ProductDto` |
| `DELETE /seller/products/:productId` | | `204` (soft delete, past orders keep their lines) |
| `PUT /seller/products/:productId/photo` | `ImageUploadInput` (`FileUploadInput` with `image/jpeg`\|`image/png`\|`image/webp`) | `200 ProductDto` (replaces the previous photo) |
| `DELETE /seller/products/:productId/photo` | | `200 ProductDto` (`photoUrl: null`) |
| `GET /seller/stores/:storeId/stats` | | `200 SellerStatsDto` |
| `GET /orders?status=PENDING,ACCEPTED` | | orders of the seller's stores, see §6 |
| `POST /orders/:id/accept` | `{ "prepTimeMinutes": 15 }` (optional, default store value) | `200 OrderDto` (PENDING → ACCEPTED) |
| `POST /orders/:id/reject` | `{ "reason": "Rupture de poulet" }` | `200 OrderDto` (PENDING → CANCELLED) |
| `POST /orders/:id/ready` | | `200 OrderDto` (ACCEPTED → READY → SEARCHING_DRIVER, dispatch starts) |

`StoreCreateInput`:
```json
{
  "name": "Le Verdoyant",
  "description": "Cuisine burkinabè",
  "phone": "71000001",
  "address": "Avenue Kwame Nkrumah",
  "landmark": "En face de la BCEAO",
  "lat": 12.3686,
  "lng": -1.5275,
  "prepTimeMinutes": 15,
  "openingHours": "Lun-Dim 10h-23h"
}
```
Required: `name`, `address`, `lat`, `lng`. `StoreUpdateInput` = the same fields, all optional, plus
`isOpen: boolean` (open/close toggle) and `phone` may be `null`. `commissionPercent` is set by the back office only.

`ProductCreateInput`: `{ "name": "Riz gras poulet", "description": "", "category": "Plats", "price": 2500, "isAvailable": true }`
(required: `name`, `price` integer FCFA).

`SellerStatsDto`:
```json
{
  "storeId": "cmw...",
  "today": { "orders": 23, "delivered": 18, "cancelled": 1, "sales": 184500, "commission": 18450, "payout": 166050, "avgPrepMinutes": 12 },
  "pendingOrders": 2
}
```
`sales` = items total of today's non-cancelled orders; `commission`/`payout` are for delivered orders.
`pendingOrders` = orders in `PENDING` or `ACCEPTED`.

Seller UI hint (mockup "Commandes du jour"): new orders arrive via the `order.updated` socket event (the seller
is in the `user:<sellerId>` room) → refetch `GET /orders?status=PENDING,ACCEPTED,READY,SEARCHING_DRIVER,ASSIGNED,PICKED_UP`.

---

## 6. Orders

### 6.1 Status machine

```
FOOD   : PENDING ─accept→ ACCEPTED ─ready→ READY ─(auto)→ SEARCHING_DRIVER ─→ ASSIGNED ─pickup→ PICKED_UP ─deliver→ DELIVERED
PARCEL : PENDING ─(auto, at creation)→ SEARCHING_DRIVER ─→ ASSIGNED ─pickup→ PICKED_UP ─deliver→ DELIVERED
ASSIGNED ─→ SEARCHING_DRIVER   (back office reassignment, immediately followed by ASSIGNED to the new driver)
CANCELLED from PENDING, ACCEPTED, READY, SEARCHING_DRIVER (client or back office), ASSIGNED and PICKED_UP (back office only)
PICKED_UP ─→ DELIVERED also by the back office (`force-deliver`, audited) when the code is locked or lost
```
The machine is `ORDER_TRANSITIONS` / `canTransition()` in `@yaar/shared`; every transition is stored as an
`OrderEventDto` (returned in `events` by `GET /orders/:id`). Any other transition → `409 INVALID_TRANSITION`.

Who triggers what:

| Transition | Endpoint | Role |
|---|---|---|
| create | `POST /orders` | CLIENT |
| PENDING → ACCEPTED | `POST /orders/:id/accept` | SELLER (owner) |
| PENDING → CANCELLED | `POST /orders/:id/reject` | SELLER (owner) |
| ACCEPTED → READY → SEARCHING_DRIVER | `POST /orders/:id/ready` | SELLER (owner) |
| SEARCHING_DRIVER → ASSIGNED | `POST /driver/offers/:id/accept` or `POST /controller/orders/:id/assign` | DRIVER / back office |
| ASSIGNED → PICKED_UP | `POST /orders/:id/pickup` | assigned DRIVER |
| PICKED_UP → DELIVERED | `POST /orders/:id/deliver` (+ code) | assigned DRIVER |
| PICKED_UP → DELIVERED | `POST /controller/orders/:id/force-deliver` | back office (audited) |
| → CANCELLED | `POST /orders/:id/cancel` | CLIENT (owner, early states) or back office (up to PICKED_UP; from PICKED_UP an `OTHER` incident is opened) |

### 6.2 `POST /orders/quote` (`CLIENT`)

> **Deprecated** (client ordering flow): businesses use `POST /business/deliveries/quote`.

Price shown before ordering. Body `QuoteInput`:

```json
{
  "type": "FOOD",
  "storeId": "cmw5d3yyo00047d3btdhgncnv",
  "items": [{ "productId": "cmw5d3yyx000c7d3bmg7x1yyn", "quantity": 2 }],
  "dropoff": { "lat": 12.3395, "lng": -1.517, "address": "Patte d'Oie, secteur 15", "landmark": "Derrière la station Total" }
}
```
For `PARCEL`: omit `storeId`/`items` and give `pickup` (same shape as `dropoff`). For `FOOD`, `pickup` is
ignored (the store address is used). `landmark` (repère) is optional (max 200 chars), `address` required.

`200` → `QuoteResponse` (always one option per vehicle type, in order BIKE, MOTO, CAR):
```json
{
  "type": "FOOD",
  "distanceKm": 4.5,
  "itemsTotal": 1000,
  "pickup": { "lat": 12.3686, "lng": -1.5275, "address": "Avenue Kwame Nkrumah, centre-ville", "landmark": "En face de la BCEAO" },
  "dropoff": { "lat": 12.3395, "lng": -1.517, "address": "Patte d'Oie, secteur 15", "landmark": "Derrière la station Total" },
  "paymentMethods": ["CASH"],
  "options": [
    { "vehicleType": "BIKE", "available": true, "deliveryFee": 1200, "total": 2200, "estimatedMinutes": 23 },
    { "vehicleType": "MOTO", "available": true, "deliveryFee": 1600, "total": 2600, "estimatedMinutes": 13 },
    { "vehicleType": "CAR",  "available": true, "deliveryFee": 3100, "total": 4100, "estimatedMinutes": 14 }
  ]
}
```
`available: false` means the back office disabled that vehicle type (do not offer it). Errors:
`404 NOT_FOUND` (store/product), `409 STORE_CLOSED`, `409 PRODUCT_UNAVAILABLE`, `409 PRICING_UNAVAILABLE`.

### 6.3 `POST /orders` (`CLIENT`)

> **Deprecated** (client ordering flow): businesses use `POST /business/deliveries`.

Body `CreateOrderInput` = `QuoteInput` plus:

| Field | Type | Notes |
|---|---|---|
| `vehicleType` | `VehicleType` | required |
| `paymentMethod` | `PaymentMethod` | default `CASH`; `MOBILE_MONEY` → `400 PAYMENT_METHOD_UNAVAILABLE` "Paiement mobile money non disponible (Lot 2)" |
| `recipientName` | string ≤ 80 | optional (parcel recipient) |
| `recipientPhone` | phone | optional |
| `parcelDescription` | string ≤ 300 | optional ("Enveloppe de documents") |
| `notes` | string ≤ 300 | optional (instructions for the driver) |

```json
{
  "type": "PARCEL",
  "vehicleType": "MOTO",
  "paymentMethod": "CASH",
  "pickup":  { "lat": 12.3805, "lng": -1.4975, "address": "Zogona, près de l’université", "landmark": "Boutique Faso Dan Fani" },
  "dropoff": { "lat": 12.405,  "lng": -1.559,  "address": "Tampouy, marché", "landmark": "Près de la mosquée" },
  "recipientName": "Ali", "recipientPhone": "76 00 00 00", "parcelDescription": "Enveloppe"
}
```
`201` → `OrderDto` (as seen by the client, so it includes `deliveryCode`). FOOD orders start in `PENDING`,
PARCEL orders are returned already in `SEARCHING_DRIVER`. The price is recomputed server-side (never trust
the quote).

### 6.4 `OrderDto`

Example: `GET /orders/:id` by the client while the driver is on the way:

```json
{
  "id": "cmw5d3z2l004j7d3bvvg5bywk",
  "number": 1004,
  "type": "FOOD",
  "status": "PICKED_UP",
  "vehicleType": "MOTO",
  "paymentMethod": "CASH",
  "paymentStatus": "PENDING",
  "client": { "id": "cmw5d3yzl001e7d3b0dnx4mx2", "name": "Mariam O.", "phone": "+22672000003" },
  "store": { "id": "cmw5d3yz0000h7d3b6m816x01", "name": "Maquis Chez Tanti", "phone": "+22671000002" },
  "driver": {
    "id": "cmw5d3yzo001h7d3bbfgy6rpg",
    "name": "Issouf S.",
    "phone": "+22673000001",
    "vehicleType": "MOTO",
    "plate": "11 JJ 4521",
    "ratingAvg": 4.9,
    "lastLocation": { "lat": 12.3602, "lng": -1.5248, "at": "2026-11-06T19:22:16.018Z", "heading": 145 }
  },
  "pickup":  { "lat": 12.364,  "lng": -1.556,  "address": "Gounghin, rue de la mairie", "landmark": "Derrière la pharmacie de Gounghin" },
  "dropoff": { "lat": 12.3226, "lng": -1.4977, "address": "Ouaga 2000, avenue Mouammar Kadhafi", "landmark": "Villa 12, portail noir" },
  "recipientName": null,
  "recipientPhone": null,
  "parcelDescription": null,
  "notes": null,
  "items": [{ "productId": "cmw5d3yz2000j7d3bubexbq3s", "name": "Tô sauce feuille", "unitPrice": 1000, "quantity": 3, "lineTotal": 3000 }],
  "distanceKm": 10.2,
  "itemsTotal": 3000,
  "deliveryFee": 2750,
  "total": 5750,
  "commission": null,
  "driverEarning": null,
  "sellerPayout": null,
  "deliveryCode": "5340",
  "cashCollected": null,
  "prepTimeMinutes": 15,
  "hasProofPhoto": false,
  "cancelReason": null,
  "createdAt": "2026-11-06T18:53:16.018Z",
  "acceptedAt": "2026-11-06T18:57:16.018Z",
  "readyAt": "2026-11-06T19:01:16.018Z",
  "assignedAt": "2026-11-06T19:09:16.018Z",
  "pickedUpAt": "2026-11-06T19:13:16.018Z",
  "deliveredAt": null,
  "cancelledAt": null,
  "myRating": null,
  "canRate": false,
  "etaMinutes": 9,
  "route": {
    "target": "DROPOFF",
    "points": [[12.3602, -1.5248], [12.35271, -1.51893], [12.33102, -1.50411], [12.3226, -1.4977]],
    "distanceM": 5120, "durationS": 744, "source": "osrm", "computedAt": "2026-11-06T19:21:58.402Z"
  },
  "feePaidBy": null,
  "cashToCollect": null,
  "recipientIsBusiness": false,
  "trackingUrl": null,
  "events": [
    { "id": "cmw...", "fromStatus": null, "toStatus": "PENDING", "actorRole": "CLIENT", "note": null, "createdAt": "2026-11-06T18:53:16.018Z" },
    { "id": "cmw...", "fromStatus": "PENDING", "toStatus": "ACCEPTED", "actorRole": "SELLER", "note": "Préparation : 15 min", "createdAt": "2026-11-06T18:57:16.018Z" }
  ]
}
```
Field notes:
- `total` = `itemsTotal + deliveryFee` = amount the client pays (cash to collect by the driver).
- `commission` = platform share (delivery commission + seller commission on items), back office only.
- `driverEarning` = `deliveryFee - deliveryCommission` (assigned driver and back office).
- `sellerPayout` = `itemsTotal - seller commission` (seller and back office).
- `deliveryCode`: 4 digits, **client only**, and only until the order is delivered/cancelled.
- `cashCollected`: set when a cash order is delivered.
- `events` is only present on `GET /orders/:id` (not in lists).
- `myRating`/`canRate`: the caller's rating and whether `POST /orders/:id/rating` is allowed.
- `etaMinutes`: estimated minutes until delivery. From the cached road route when there is one (formula in
  [Itinéraires](#itinéraires-carte-de-suivi)); otherwise from the driver's last position (`ASSIGNED`: via the pickup;
  `PICKED_UP`: straight to the dropoff; haversine × 1.3 ÷ average speed of the vehicle). `null` outside
  `ASSIGNED`/`PICKED_UP` or without a driver position. Client, requesting business, seller, assigned driver and back office.
- `driver.lastLocation.heading`: heading of the driver in degrees (0 = north, clockwise, integer), sent by the phone or
  computed from the last two positions (§7.2); `null` if unknown. Use it to rotate the vehicle marker.
- `route` (`RouteDto`): road route of the current leg, see [Itinéraires](#itinéraires-carte-de-suivi). Client, requesting
  business, assigned driver and back office, only while `ASSIGNED`/`PICKED_UP`; `null` otherwise, for the seller, and
  **always `null` in lists** (`GET /orders`, `GET /business/deliveries`: payload size). Filled by `GET /orders/:id`,
  `GET /driver/current-order` and the action responses (accept, assign, pickup).
- `feePaidBy` (`SENDER` | `RECIPIENT`), `cashToCollect` (FCFA), `recipientIsBusiness`: business deliveries
  ([Livraisons d'entreprise](#livraisons-dentreprise)); `null`, `null`, `false` for former client orders. Visible to
  everyone who can see the order (the driver needs them to know what to collect, and when).
- `trackingUrl`: public tracking link sent to the recipient (`PUBLIC_APP_URL/suivi/<token>`); requesting business and
  back office only, `null` otherwise. Anyone holding the link sees the tracking page, delivery code included.
- `updatedAt`: last change of the order row (status, assignment, payment…). It does **not** move when only the
  driver's position changes: poll `GET /orders/:id` for live tracking.
- Fields hidden by the privacy rules (§10) are `null`, never absent.

### 6.5 Listing and reading

`GET /orders` (any role, *paginated*, newest first). Query: `status` (comma-separated list, e.g.
`status=ASSIGNED,PICKED_UP`), `type` (`FOOD`|`PARCEL`), `q` (back office only: order number `1048`/`#1048`,
client phone or name), `updatedSince` (ISO 8601, for incremental polling: pass the largest `updatedAt`
already received; see [Mode polling](#mode-polling-vercel)), `page`, `pageSize`. Scope by role: client = own
orders, seller = orders of own stores, driver = orders assigned to him (current and past), back office = all.

With `updatedSince`, the response holds **every order of the caller's scope updated at or after
`updatedSince − 2 s`**, **whatever `status`** (the `status` filter is ignored, `type` and `q` still apply), sorted
by `updatedAt` ascending (oldest change first). Merge the items into what you display **by `id`**: replace the
order, and remove it from your view when its new status is outside the statuses you show (e.g. `DELIVERED`,
`CANCELLED` on the seller's "en cours" screen). Orders already received may come back (2 s overlap, against
commits that land just after a response and clock differences between instances): merging by `id` makes that
harmless. `total` is the number of changed orders: poll with `pageSize=100`, and when `total > items.length`
(rare: more changes than one page) reload your list once without `updatedSince`, then resume from its largest
`updatedAt`.

`GET /orders/:id` (any role with access) → `OrderDto` with `events`. Lists never carry `route` (always `null`);
`GET /orders/:id` does.

### 6.6 Other order endpoints

| Method & path | Role | Body | Response |
|---|---|---|---|
| `POST /orders/:id/cancel` | CLIENT (owner), requesting business (`SELLER`, its business deliveries, before pickup: `SEARCHING_DRIVER`, `ASSIGNED`; the driver on the way is freed) or back office | `{ "reason": "Erreur d’adresse" }` (optional) | `200 OrderDto`; `409 INVALID_TRANSITION` for the business after pickup (contact the console) |
| `POST /orders/:id/pickup` | assigned DRIVER | | `200 OrderDto` (ASSIGNED → PICKED_UP) |
| `POST /orders/:id/deliver` | assigned DRIVER | `DeliverOrderInput` | `200 OrderDto` (PICKED_UP → DELIVERED). Wrong code → `400 DELIVERY_CODE_INVALID`; after 5 attempts (counted atomically, parallel requests included) → `423 DELIVERY_CODE_LOCKED`; the console can then reset the counter or validate the delivery (§8.2). |
| `GET /orders/:id/proof-photo` | client owner, requesting business, assigned driver, back office (audited) | | `200` binary image, `404` if none |
| `POST /orders/:id/rating` | CLIENT owner (rates the driver) or assigned DRIVER (rates the client) | `{ "score": 5, "comment": "Rapide" }` | `201 RatingDto` |
| `POST /orders/:id/dispute` | anyone who can see the order | `{ "description": "Colis endommagé" }` (3..1000 chars) | `201 IncidentDto` (type `DISPUTE`) |
| `GET /orders/:id/messages` | client owner, assigned driver (while `ASSIGNED`/`PICKED_UP`), back office | | `200 OrderMessageDto[]` (oldest first, 200 max) |
| `POST /orders/:id/messages` | client owner or assigned driver | `OrderMessageInput` `{ "body": "Portail bleu" }` (1..500 chars) | `201 OrderMessageDto`; `409 ORDER_NOT_ACTIVE` outside `ASSIGNED`/`PICKED_UP` |

### 6.7 Client ↔ driver chat

`OrderMessageDto`: `{ "id", "orderId", "sender": { "id", "name", "role" }, "body", "createdAt" }`. Each new
message is pushed with the socket event `order.message` to `user:<clientId>` and `user:<driverId>` only (not to
the seller) and as a push notification to the other party. To call, use `driver.phone` (client side) or
`client.phone` (driver side), visible during the delivery (§10). Messages are deleted after 12 months.

Cancellation: client allowed in `PENDING`, `ACCEPTED`, `READY`, `SEARCHING_DRIVER`; back office also in
`ASSIGNED` (the driver is freed). Otherwise `409 INVALID_TRANSITION`.

`DeliverOrderInput`:
```json
{ "code": "4729", "proofPhoto": { "mimeType": "image/jpeg", "dataBase64": "..." } }
```
`proofPhoto` is optional. Wrong code → `400 DELIVERY_CODE_INVALID` "Code de livraison incorrect (3 essai(s) restant(s))";
after 5 wrong codes → `423 DELIVERY_CODE_LOCKED`. Delivering a `CASH` order adds `total` to the driver's
`cashHeld` and writes a `COLLECTION` ledger entry; `paymentStatus` becomes `PAID`.

Rating: only when `status = DELIVERED`, once per user per order (`409 ALREADY_RATED`). `RatingDto`:
`{ id, orderId, fromUserId, toUserId, score (1-5), comment, createdAt }`.

---

## Livraisons d'entreprise

Business deliveries (B2B model): a business (`SELLER` account whose store, validated by the console, is its business
profile) sends a parcel to a **recipient**, a person or another business, who has **no account**. Types and schemas in
`@yaar/shared`: `createDeliverySchema` (`CreateDeliveryInput`), `deliveryQuoteSchema` (`DeliveryQuoteInput`), `OrderDto`
(`feePaidBy`, `cashToCollect`, `recipientIsBusiness`, `trackingUrl`), `TrackingDto`.

| Method & path | Role | Body / query | Response |
|---|---|---|---|
| `POST /business/deliveries/quote` | SELLER | `DeliveryQuoteInput` `{ "pickup"?: AddressInput, "dropoff": AddressInput }` | `200 QuoteResponse` (`type: "PARCEL"`, `itemsTotal: 0`, one option per vehicle as in §6.2) |
| `POST /business/deliveries` | SELLER | `CreateDeliveryInput` | `201 OrderDto` (status `SEARCHING_DRIVER`) ⚙ |
| `GET /business/deliveries` | SELLER | `status`, `updatedSince`, `page`, `pageSize` (same semantics as `GET /orders`, §6.5) | `200 Paginated<OrderDto>`: the deliveries requested by this business only (not the former food orders of its store) ⚙ |
| `GET /orders/:id` | SELLER (requesting business) | | `200 OrderDto` with `events` |
| `POST /orders/:id/cancel` | SELLER (requesting business) | `{ "reason"?: string }` | `200 OrderDto` in `SEARCHING_DRIVER` or `ASSIGNED` (the driver on the way is freed); `409 INVALID_TRANSITION` after pickup |
| `GET /orders/:id/proof-photo` | SELLER (requesting business) | | binary proof-of-delivery photo |

`/business/deliveries*` need a business profile validated by the console: without any store, or before approval
(`PENDING` / `SUSPENDED`), `403 STORE_NOT_APPROVED` ("Votre entreprise doit être validée par Yaar avant de demander une
livraison"). With several stores, the oldest approved one is the business profile.

`CreateDeliveryInput`:
```json
{
  "pickup": { "lat": 12.364, "lng": -1.556, "address": "Entrepôt de Gounghin", "landmark": "Portail rouge" },
  "dropoff": { "lat": 12.3395, "lng": -1.517, "address": "Patte d'Oie, secteur 15", "landmark": "Derrière la station Total, portail bleu" },
  "recipientName": "Ali Ouédraogo",
  "recipientPhone": "76 00 00 00",
  "recipientIsBusiness": false,
  "packageDescription": "2 boîtes de médicaments",
  "vehicleType": "MOTO",
  "feePaidBy": "SENDER",
  "cashToCollect": 12000,
  "notes": "Appeler en arrivant"
}
```
- `pickup` optional: absent = the business (store) address. `dropoff`: map pin + landmark.
- `recipientName` (1..80), `recipientPhone` (Burkina Faso number, returned E.164) and `packageDescription` (1..200) are
  required; `recipientIsBusiness` (default `false`) is for display only.
- `feePaidBy` (default `SENDER`): who pays the delivery fee, in cash. `SENDER` = the business pays the driver at pickup;
  `RECIPIENT` = the recipient pays it at delivery.
- `cashToCollect` (integer FCFA, 0..2 000 000, default 0): value of the goods collected from the recipient at delivery
  and owed to the business (cash on delivery); 0 = nothing to collect.

At creation:
1. The order is a `PARCEL` linked to the business store (`store`), the business account being the requester (`client`).
   Price: same rules as §6.2 (`max(minimum, base + perKm × distance)`, distance = haversine × 1.3 from the pickup).
   Amounts: `deliveryFee`; `itemsTotal` = `sellerPayout` = `cashToCollect` (no commission on the goods: the platform
   takes its commission on the delivery fee); `total` = `deliveryFee + cashToCollect` = all the cash of the job;
   `paymentMethod: "CASH"` (mobile money later).
2. Events `null → PENDING` and `PENDING → SEARCHING_DRIVER` are recorded (no accept / prepare step) and dispatch starts at
   once (nearest driver with the vehicle type, §7.3). The offer shows the business name and address (a professional
   place) and only an approximate zone for the recipient.
3. A 4-digit delivery code and a tracking token (18 random bytes = 144 bits, base64url, unique index) are generated;
   `trackingUrl` = `${PUBLIC_APP_URL}/suivi/<token>` (default `https://yaar-livraison.vercel.app`). The business **never**
   gets the delivery code in its `OrderDto` (the code is on the recipient's tracking page).
4. The recipient gets a message (`RecipientNotifier`; `RECIPIENT_NOTIFIER=console`: written in the API log; `whatsapp`:
   placeholder, not implemented, the send fails and is logged) in French with the business name, the tracking link, the
   delivery code and the amount to pay at delivery; a second short message when the driver picks the parcel up. Sending
   runs in the background (`waitUntil` on Vercel): a failing or slow channel never blocks or fails the request.
   `DEMO_MODE=true` requires `RECIPIENT_NOTIFIER=console` (no real message from the public demo).

The requesting business then sees, like the client did: the driver (name, phone, vehicle, plate), his live position and
heading, the road `route` and `etaMinutes` during `ASSIGNED`/`PICKED_UP`; its own addresses and recipient (also after
delivery); `sellerPayout` (= `cashToCollect`) and `trackingUrl`. Never `deliveryCode`, `commission` or `driverEarning`.
Another business gets `404`. Push notifications to the business: "Livreur en route" (assigned), "Colis récupéré"
(picked up), "Livrée", "Livraison annulée".

**Cash (cash only for now)**, recorded in the driver's cash ledger (`cashHeld`, `COLLECTION` entries, §7.4, §8.7):

| `feePaidBy` | At pickup (`POST /orders/:id/pickup`) | At delivery (`POST /orders/:id/deliver`, or console `force-deliver`) |
|---|---|---|
| `SENDER` | `deliveryFee` from the business | `cashToCollect` from the recipient (no entry when 0) |
| `RECIPIENT` | nothing | `cashToCollect + deliveryFee` from the recipient |

At delivery the order gets `cashCollected` = `deliveryFee + cashToCollect` (all the cash of the job) and `owedToBusiness`
= `cashToCollect`: what the platform owes the business once the driver has deposited the cash. The tracking page shows
the recipient `amountToPay` = `cashToCollect` + (`deliveryFee` if `RECIPIENT`). If the console cancels after pickup, a fee
collected at pickup stays in the driver's ledger: settle it with the business by hand (an incident is opened, §8.2).

`GET /controller/cash/businesses` (back office) → `BusinessBalanceDto[]`, highest amount first (type defined in
`apps/api/src/services/deliveries.ts`, not yet in `@yaar/shared`):
```json
[{ "storeId": "cmw…", "storeName": "Kaya Market", "ownerId": "cmw…", "ownerName": "Salimata Traoré", "phone": "+22671000005",
   "owedTotal": 17000, "deliveries": 2, "lastDeliveredAt": "2026-11-08T14:03:00.000Z" }]
```
`owedTotal` = sum of `owedToBusiness` of the business's delivered deliveries. **No payout workflow yet**: paying the
business back (and marking amounts as paid) is not recorded by the API; the orders CSV export (§8.9) has
`frais_payes_par`, `marchandise_a_encaisser` and `du_entreprise` columns for the accounting.

Known gaps: no payout workflow; the cash limit is checked before an offer as before (`cashHeld < CASH_LIMIT`), not
against what the job will collect (a large `cashToCollect` takes the driver above the limit: he is blocked once the job
is done, until he deposits); no cancellation fee; the WhatsApp channel for recipients is a placeholder; the business
cannot rate the driver or chat with him (it calls `driver.phone`); pricing still uses haversine × 1.3, not the road route.

---

## Suivi public du destinataire

`GET /track/:token` (**public, no authentication**) → `TrackingDto`: the page the recipient opens from the link
`${PUBLIC_APP_URL}/suivi/<token>` (mobile web app). Poll it every `pollIntervalMs` (4 s) while the page is visible; it
triggers the background dispatch cycle like the other polling endpoints (⚙, [Mode polling](#mode-polling-vercel)).

```json
{
  "number": 1004,
  "status": "ASSIGNED",
  "vehicleType": "CAR",
  "sender": { "name": "Tech Plus Électronique", "phone": "+22671000004" },
  "recipientName": "Bureau Faso Conseil",
  "packageDescription": "Téléphone Tecno Camon (boîte scellée)",
  "pickup": { "lat": 12.405, "lng": -1.559, "address": "Tampouy, marché" },
  "dropoff": { "lat": 12.375, "lng": -1.47, "address": "Dassasgho, route de Fada", "landmark": "Immeuble bleu, 2e étage" },
  "amountToPay": 0,
  "driver": {
    "firstName": "Abdoul", "vehicleType": "CAR", "plate": "11 HH 0917", "phone": "+22673000004", "ratingAvg": null,
    "lastLocation": { "lat": 12.392, "lng": -1.545, "at": "2026-11-08T21:50:00.000Z", "heading": 314 }
  },
  "route": { "target": "PICKUP", "points": [[12.392, -1.545], [12.3982, -1.5517], [12.405, -1.559]], "distanceM": 2620, "durationS": 429, "source": "osrm", "computedAt": "2026-11-08T21:50:01.000Z" },
  "etaMinutes": 49,
  "deliveryCode": "4729",
  "createdAt": "2026-11-08T21:40:00.000Z",
  "assignedAt": "2026-11-08T21:48:00.000Z",
  "pickedUpAt": null,
  "deliveredAt": null,
  "cancelledAt": null,
  "updatedAt": "2026-11-08T21:48:00.000Z"
}
```
- Constant shape: every field is always present (`null` when hidden). No other personal data: never the recipient's
  phone, the business account or its internal amounts (commission, earnings, payouts), nothing about other deliveries.
  `sender` = the business name and its store phone.
- `driver` (first name only, vehicle, plate, phone, rating, last position and heading), `route` and `etaMinutes`: only
  while `ASSIGNED`/`PICKED_UP`, `null` otherwise.
- `amountToPay`: cash to hand to the driver (goods + fee if the recipient pays it); 0 = nothing.
- `deliveryCode`: until the delivery is delivered or cancelled, then `null`. Anyone holding the link sees it: the link
  goes to the recipient (the business also gets it as `trackingUrl`, to forward it).
- `404 NOT_FOUND` ("Lien de suivi introuvable ou expiré") for an unknown or malformed token and **24 h after**
  `deliveredAt` / `cancelledAt`.
- Per-IP limit: `TRACK_RATE_LIMIT` requests per minute (default 120 = several tabs polling every 4 s behind one IP;
  `0` = off; in memory, per instance) → `429 RATE_LIMITED`. The token has 144 random bits: it cannot be guessed.
- `Cache-Control: no-store`, `Referrer-Policy: no-referrer`. The tracking page should keep the browser default referrer
  policy (or `no-referrer`) so that map tile servers never get the token in a `Referer`.
- CORS: the origin of `PUBLIC_APP_URL` is always allowed (in addition to `CORS_ORIGINS`). Like `/config` and `/health`
  the call needs no `Authorization` header: a poll is a simple request, without preflight.

---

## 7. Driver space (`DRIVER`)

### 7.1 Onboarding (KYC)

1. Log in with `role: "DRIVER"`.
2. `PUT /driver/profile` with the vehicle → creates the profile in `PENDING`.
3. `PUT /driver/documents/:type` for each `missingDocuments` entry.
4. Wait for a controller: `status` becomes `APPROVED` (or `REJECTED` with `rejectionReason`). Poll
   `GET /driver/profile` (e.g. on app focus); there is no socket event for KYC decisions in Lot 1.

#### `GET /driver/profile` → `DriverProfileDto` (`404` before step 2)

```json
{
  "userId": "cmw5d3yzo001h7d3bbfgy6rpg",
  "name": "Issouf S.",
  "phone": "+22673000001",
  "vehicleType": "MOTO",
  "plate": "11 JJ 4521",
  "status": "APPROVED",
  "isOnline": true,
  "isBusy": true,
  "isSuspendedUser": false,
  "cashHeld": 38500,
  "cashLimit": 50000,
  "cashBlocked": false,
  "rejectionReason": null,
  "suspensionReason": null,
  "ratingAvg": 5,
  "ratingCount": 1,
  "documents": [
    { "id": "cmw5d3yzt001j7d3b33syz6jn", "type": "CNIB", "mimeType": "image/png", "sizeBytes": 70, "expiresAt": null, "isExpired": false, "uploadedAt": "2026-11-06T19:23:16.073Z" },
    { "id": "cmw5d3yzy001p7d3bti9pyn9f", "type": "ASSURANCE", "mimeType": "image/png", "sizeBytes": 70, "expiresAt": "2027-03-31T00:00:00.000Z", "isExpired": false, "uploadedAt": "2026-11-06T19:23:16.078Z" }
  ],
  "requiredDocuments": ["CNIB", "PERMIS", "CARTE_GRISE", "ASSURANCE", "SELFIE"],
  "missingDocuments": [],
  "kycComplete": true,
  "lastLocation": { "lat": 12.3602, "lng": -1.5248, "at": "2026-11-06T19:22:16.018Z" },
  "approvedAt": "2026-10-07T19:23:16.018Z",
  "createdAt": "2026-11-06T19:23:16.070Z"
}
```
`missingDocuments` lists required documents not uploaded **or expired**. `cashBlocked` = `cashHeld >= cashLimit`.

#### `PUT /driver/profile`

Body `DriverProfileInput`: `{ "vehicleType": "MOTO", "plate": "11 KM 2280", "trackingConsent": true }` (`plate`
required for MOTO/CAR, uppercased by the API; `trackingConsent: true` records the GPS tracking consent, see §7.2). `200 DriverProfileDto`. Changing vehicle or plate of an approved/rejected driver puts
the file back to `PENDING`; it is refused while online (`409 CONFLICT`) and for a suspended driver (`403`).

#### `PUT /driver/documents/:type`

`:type` = a `DocumentType`. Body `DocumentUploadInput` = `FileUploadInput` + `expiresAt` (ISO date, **required for
`ASSURANCE`**, e.g. `"2027-03-31"`). Replaces any previous file of that type. `200 DriverProfileDto`.
Errors: `400` if the document is not required for this vehicle (e.g. `PERMIS` for a bike) or `expiresAt` missing,
`413 PAYLOAD_TOO_LARGE`, `415 UNSUPPORTED_FILE`. Uploading to a `REJECTED` file puts it back to `PENDING`.

### 7.2 Availability and GPS

#### Tracking consent

Informed consent to GPS tracking is required (brief §2, Annexe 3) and is recorded with its date in
`DriverProfileDto.trackingConsentAt` (`null` = no consent). Show the explanation ("Votre position est suivie
uniquement lorsque vous êtes en ligne, pour attribuer et suivre les courses ; elle est conservée 12 mois")
and record the consent with any of:
- `POST /driver/consent` → `200 DriverProfileDto` (idempotent);
- `trackingConsent: true` in `PUT /driver/profile` or in `PATCH /driver/availability`.

`DELETE /driver/consent` withdraws it: the driver goes offline, his last position is erased and pending offers
are withdrawn (`409 DRIVER_BUSY` during a delivery).

#### `PATCH /driver/availability`

Body `AvailabilityInput`: `{ "online": true, "lat": 12.3602, "lng": -1.5248, "trackingConsent": true }`
(`lat`/`lng` optional but recommended when going online so that dispatch can find the driver immediately;
`trackingConsent` optional, see above).

`200 DriverProfileDto`. Going online requires `status = APPROVED` (`403 DRIVER_NOT_APPROVED`),
a recorded consent (`403 CONSENT_REQUIRED`) and `cashHeld < cashLimit` (`409 CASH_LIMIT_REACHED`). Going offline is refused during a delivery
(`409 DRIVER_BUSY`); it erases the last known position and withdraws pending offers.

UI: show a permanent "En ligne : suivi GPS actif" indicator while online (legal requirement); stop the GPS
watcher when offline.

A driver who stays online without sending any position for `DRIVER_STALE_MINUTES` (default 10; app killed,
network lost) is set offline automatically by the dispatch cycle (position erased, `driver.status` emitted)
and is not offered orders in the meantime. A driver on a delivery is never set offline this way.

#### `POST /driver/location`

Body `LocationPingInput`: `{ "lat": 12.3602, "lng": -1.5248, "accuracy": 12, "heading": 90, "speed": 6.5 }`
(`accuracy` m, `heading` 0-360°, `speed` m/s, all optional). `204` no content.
**Rejected with `403 DRIVER_OFFLINE` when the driver is offline.** Recommended rate: every 5-10 s while on a
delivery, every 30-60 s while online and idle.

Heading: the API keeps one heading with the last position (erased with it when the driver goes offline, withdraws his
consent, is suspended or set offline as stale) and exposes it as `heading` (degrees, 0 = north, clockwise, integer) in
`OrderDto.driver.lastLocation`, `MapDriverDto`, `TrackingDto` and the `driver.location` event. Rule: the phone's
`heading` when it is sent and `speed`, if sent, shows movement (≥ 1 m/s: a stopped phone's course is meaningless);
otherwise the bearing from the previous position when the driver moved at least 15 m; otherwise the previous heading
(a stopped driver's marker does not spin). Send `heading`/`speed` only when the phone has them (omit them rather than
sending negative values, which are refused). During a job a ping can also trigger a recomputation of the route
([Itinéraires](#itinéraires-carte-de-suivi)); the `204` never waits for it.

### 7.3 Offers and deliveries

When a driver is chosen by dispatch he receives the socket event `offer.new` (payload `OfferDto`). He has
**30 seconds** (`expiresAt`) to accept, otherwise the next driver is asked.

`OfferDto`: before acceptance **no client address** is disclosed (no coordinates, free-text address, landmark,
recipient or phone). `pickup.address` is the store address for a FOOD order or a business delivery (public business
place, with `pickup.name`) or an approximate zone for a parcel of the former client flow; `dropoff.address` is always an approximate zone ("Secteur Zogona": nearest known
Ouagadougou neighbourhood, `approximateZone()` in shared). `zone` repeats the zone. Exact addresses are in the
`OrderDto` returned by `accept`.
```json
{
  "id": "cmw8k1...",
  "orderId": "cmw5d3z2l004j7d3bvvg5bywk",
  "orderNumber": 1048,
  "orderType": "FOOD",
  "status": "OFFERED",
  "vehicleType": "MOTO",
  "offeredAt": "2026-11-06T09:43:00.000Z",
  "expiresAt": "2026-11-06T09:43:30.000Z",
  "pickup": { "address": "Avenue Kwame Nkrumah, centre-ville", "name": "Le Verdoyant", "distanceFromDriverKm": 1.1, "zone": "Secteur Centre-ville" },
  "dropoff": { "address": "Secteur Patte d’Oie", "zone": "Secteur Patte d’Oie" },
  "distanceKm": 6.2,
  "cashToCollect": 6500,
  "driverEarning": 1200
}
```

| Method & path | Body | Response |
|---|---|---|
| `GET /driver/offers` | | `200 OfferDto[]` (open, unexpired offers; use it on app start/resume) |
| `POST /driver/offers/:id/accept` | | `200 OrderDto` (full details, status `ASSIGNED`); `409 OFFER_EXPIRED` / `409 DRIVER_BUSY` |
| `POST /driver/offers/:id/reject` | | `204` (next driver is asked) |
| `POST /driver/consent` / `DELETE /driver/consent` | | `200 DriverProfileDto` (§7.2) |
| `GET /driver/current-order` | | `200 { "order": OrderDto \| null }` (ASSIGNED or PICKED_UP) |
| `POST /orders/:id/pickup` | | see §6.6 |
| `POST /orders/:id/deliver` | `DeliverOrderInput` | see §6.6 |
| `GET /orders?status=DELIVERED` | | history (addresses hidden, see §10) |

### 7.4 Earnings and cash

`GET /driver/earnings` → `DriverEarningsDto`
```json
{
  "today": { "deliveries": 9, "earnings": 10800, "cashCollected": 58500 },
  "allTime": { "deliveries": 120, "earnings": 151200 },
  "cashHeld": 38500,
  "cashLimit": 50000,
  "cashBlocked": false,
  "recentLedger": [
    {
      "id": "cmw5d3z2500407d3b1b8dfzjd",
      "driverId": "cmw5d3yzo001h7d3bbfgy6rpg",
      "driverName": "Issouf S.",
      "type": "COLLECTION",
      "amount": 7100,
      "balanceAfter": 38500,
      "orderId": "cmw5d3z1n003h7d3bkwhlez8h",
      "orderNumber": 1001,
      "note": "Encaissement commande #1001",
      "recordedBy": null,
      "createdAt": "2026-11-05T23:47:16.018Z"
    }
  ]
}
```
`recentLedger` = last 20 entries, newest first. Deposits have a negative `amount` and `recordedBy` = the controller.

### 7.5 SOS

`POST /driver/sos` body `SosInput`: `{ "lat": 12.3985, "lng": -1.519, "message": "Accident", "orderId": "cmw..." }`
(`message`, `orderId` optional; when `orderId` is omitted the driver's active order is attached automatically).
`201 IncidentDto` (type `SOS`). Controllers receive the `sos` socket event instantly. Allowed online or offline.

---

## 8. Controller console (`CONTROLLER`, `ADMIN`)

All routes below require a back-office token. Actions marked **audited** write an `AuditLogDto`.

### 8.1 Dashboard and map

`GET /controller/dashboard` → `DashboardDto`
```json
{
  "onlineDrivers": { "total": 4, "byVehicle": { "BIKE": 1, "MOTO": 2, "CAR": 1 }, "busy": 1 },
  "activeOrders": 5,
  "waitingForDriver": 2,
  "waitingOver5Min": 1,
  "deliveredToday": 318,
  "cancelledToday": 3,
  "avgDeliveryMinutesToday": 27,
  "cashHeldTotal": 90500,
  "driversAtCashLimit": 1,
  "pendingKyc": 2,
  "openIncidents": 2,
  "generatedAt": "2026-11-06T19:26:46.740Z"
}
```
`activeOrders` = all non-terminal statuses; `avgDeliveryMinutesToday` = creation → delivery (null if none);
`openIncidents` = status not `RESOLVED`. Refresh every 30 s and on socket events.

`GET /controller/map` → `MapDataDto` (initial snapshot; then apply `driver.location`, `driver.status`,
`order.updated`, `sos` events):
```json
{
  "center": { "lat": 12.3714, "lng": -1.5197 },
  "drivers": [
    { "id": "cmw5d3z03001u7d3bcvmuvb8j", "name": "Karim D.", "vehicleType": "MOTO", "isBusy": false,
      "lat": 12.3985, "lng": -1.519, "lastLocationAt": "2026-11-06T19:22:16.018Z", "activeOrderId": null, "heading": 270 }
  ],
  "orders": [
    { "id": "cmw5d3z32004z7d3bvpr2en11", "number": 1005, "type": "PARCEL", "status": "SEARCHING_DRIVER", "vehicleType": "BIKE",
      "pickup": { "lat": 12.3805, "lng": -1.4975, "address": "Zogona, près de l’université" },
      "dropoff": { "lat": 12.405, "lng": -1.559, "address": "Tampouy, marché" },
      "driverId": null, "createdAt": "2026-11-06T19:17:16.018Z", "route": null }
  ],
  "stores": [{ "id": "cmw5d3yyo00047d3btdhgncnv", "name": "Le Verdoyant", "lat": 12.3686, "lng": -1.5275, "isOpen": true }],
  "openSos": [ "IncidentDto, type SOS, not resolved" ]
}
```
`drivers` = online drivers only (offline drivers have no stored position); `heading` = last heading (§7.2), `null` if
unknown. `orders` = all active orders; `route` = the cached route of the current leg (`ASSIGNED`/`PICKED_UP`, see
[Itinéraires](#itinéraires-carte-de-suivi)), `null` otherwise: this call never asks the routing service for a route.
Mockup legend: green = free driver (`isBusy: false`), blue = busy driver, orange = store, red = order waiting
(`status: SEARCHING_DRIVER`).

### 8.2 Orders and manual dispatch

| Method & path | Body | Response |
|---|---|---|
| `GET /orders?status=...&q=...` | | `Paginated<OrderDto>` (all orders, see §6.5) |
| `GET /orders/:id` | | `OrderDto` with `events` |
| `GET /controller/orders/pending` | | `PendingOrderDto[]` (status `SEARCHING_DRIVER`, longest waiting first) |
| `GET /controller/orders/:id/candidates` | | `DriverCandidateDto[]` (approved, same vehicle type, nearest first; offline ones last) |
| `POST /controller/orders/:id/assign` | `{ "driverId": "cmw..." }` | `200 OrderDto`, **audited** `ORDER_MANUALLY_ASSIGNED` |
| `POST /orders/:id/cancel` | `{ "reason": "..." }` | `200 OrderDto`, **audited** `ORDER_CANCELLED_BY_CONTROLLER`. Allowed up to `PICKED_UP`; from `PICKED_UP` an `OTHER` incident "récupérer la marchandise auprès du livreur" is opened. The driver is freed. |
| `POST /controller/orders/:id/force-deliver` | `{ "reason": "Client joint par téléphone" }` (required) | `200 OrderDto`; `PICKED_UP` → `DELIVERED` with the same cash ledger effect as a normal delivery; **audited** `ORDER_FORCE_DELIVERED` |
| `POST /controller/orders/:id/reset-delivery-code` | `{ "reason": "..." }` (optional) | `200 OrderDto`; resets the attempt counter of a `PICKED_UP` order after `423 DELIVERY_CODE_LOCKED`; **audited** `ORDER_DELIVERY_CODE_RESET` |
| `GET /orders/:id/messages` | | `OrderMessageDto[]` (read only) |
| `GET /orders/:id/proof-photo` | | binary, **audited** `ORDER_PROOF_VIEWED` |

`PendingOrderDto`:
```json
{
  "id": "cmw5d3z32004z7d3bvpr2en11", "number": 1005, "type": "PARCEL", "status": "SEARCHING_DRIVER", "vehicleType": "BIKE",
  "pickupAddress": "Zogona, près de l’université", "dropoffAddress": "Tampouy, marché", "total": 1950,
  "waitingSeconds": 331,
  "currentOffer": { "driverId": "cmw...", "driverName": "Fatimata Z.", "expiresAt": "2026-11-06T19:27:16.000Z" },
  "createdAt": "2026-11-06T19:17:16.018Z"
}
```
`currentOffer` null = nobody is being asked (no eligible driver in the radius): show "Affecter".

`DriverCandidateDto`: `{ id, name, phone, vehicleType, isOnline, isBusy, cashBlocked, distanceKm (null if offline) }`.
Offline candidates are listed (last) so the controller can call them, but cannot be assigned: disable
"Affecter" when `!isOnline || isBusy || cashBlocked`.

Assign works for orders in `SEARCHING_DRIVER` (assign) or `ASSIGNED` (reassign: the previous driver is
freed, leaves the `order:<id>` socket room and gets a push). The driver must be `APPROVED`, not suspended,
same `vehicleType`, **online** (`409 DRIVER_OFFLINE`: an offline driver sends no position and does not see the
job), not busy (`409 DRIVER_BUSY`) and under the cash limit (`409 CASH_LIMIT_REACHED`).

### 8.3 Drivers and KYC

| Method & path | Body | Response |
|---|---|---|
| `GET /controller/drivers` | query `status`, `vehicleType`, `online=true\|false`, `q` (name/phone/plate), paginated | `Paginated<DriverProfileDto>` (oldest first, i.e. FIFO KYC queue with `status=PENDING`) |
| `GET /controller/drivers/:id` | | `DriverProfileDto` (`:id` = driver user id) |
| `GET /controller/drivers/:id/documents/:documentId` | | binary file, **audited** `DRIVER_DOCUMENT_VIEWED` (every view) |
| `POST /controller/drivers/:id/approve` | | `DriverProfileDto`; from `PENDING`/`REJECTED`; `409 KYC_INCOMPLETE` if a required document is missing/expired or plate missing; **audited** |
| `POST /controller/drivers/:id/reject` | `{ "reason": "Assurance expirée" }` | from `PENDING` only; **audited** |
| `POST /controller/drivers/:id/suspend` | `{ "reason": "..." }` | from `APPROVED`; forces offline; `409 DRIVER_BUSY` during a delivery (reassign, force-deliver or cancel it first); **audited** |
| `POST /controller/drivers/:id/reinstate` | | `SUSPENDED` → `APPROVED`; **audited** |

KYC card (mockup "Dossiers livreurs à valider"): show `documents[].type` chips with ✓, red chip when
`isExpired`, and enable "Valider" only when `kycComplete`.

### 8.4 Users and staff

| Method & path | Body | Response |
|---|---|---|
| `GET /controller/users` | query `role`, `q` (name/phone), `suspended=true\|false`, paginated | `Paginated<UserDto>` (newest first) |
| `POST /controller/users/:id/suspend` | `{ "reason": "Fraude" }` | `UserDto`; **audited** `USER_SUSPENDED`. A CONTROLLER cannot suspend staff; nobody can suspend himself (`403`); a driver on a delivery → `409 DRIVER_BUSY`. The user's open sockets are disconnected. |
| `POST /controller/users/:id/unsuspend` | | `UserDto`; **audited** |
| `POST /controller/staff` (**ADMIN only**) | `{ "phone": "70998877", "name": "Salif K.", "role": "CONTROLLER" }` | `201 UserDto`; **audited** `STAFF_CREATED` |

A suspended user (any role) gets `403 ACCOUNT_SUSPENDED` on every request. `DriverProfile.status = SUSPENDED`
(8.3) only blocks driving; `User.isSuspended` (8.4) blocks the whole account.

### 8.5 Stores (back office)

| Method & path | Body | Response |
|---|---|---|
| `GET /controller/stores` | query `approvalStatus=PENDING\|APPROVED\|SUSPENDED`, paginated | `Paginated<StoreDto>` (internal fields included) |
| `POST /controller/stores/:id/approve` | | `StoreDto` (`approvalStatus: APPROVED`, now visible to clients); **audited** `STORE_APPROVED` |
| `POST /controller/stores/:id/suspend` | `{ "reason": "Hygiène" }` | `StoreDto` (`SUSPENDED`, closed, hidden from clients; orders in progress continue); **audited** `STORE_SUSPENDED` |
| `PATCH /controller/stores/:id` | `{ "commissionPercent": 12, "isOpen": false }` (any subset) | `StoreDto`; **audited** |

Seller onboarding = store validation: a new store is `PENDING` until a controller approves it (queue:
`GET /controller/stores?approvalStatus=PENDING`).

### 8.6 Pricing

`GET /controller/pricing-rules` → `PricingRuleDto[]` (BIKE, MOTO, CAR):
```json
[
  { "vehicleType": "BIKE", "baseFare": 500,  "perKm": 150, "minimumFare": 1000, "commissionPercent": 20, "isActive": true, "updatedAt": "..." },
  { "vehicleType": "MOTO", "baseFare": 700,  "perKm": 200, "minimumFare": 1500, "commissionPercent": 20, "isActive": true, "updatedAt": "..." },
  { "vehicleType": "CAR",  "baseFare": 1500, "perKm": 350, "minimumFare": 3000, "commissionPercent": 20, "isActive": true, "updatedAt": "..." }
]
```
`PUT /controller/pricing-rules/:vehicleType` body `PricingRuleUpdateInput`
`{ "baseFare": 700, "perKm": 200, "minimumFare": 1500, "commissionPercent": 20, "isActive": true }` → `PricingRuleDto`;
**audited** `PRICING_RULE_UPDATED` (metadata `before`/`after`). Applies to new quotes/orders only.
Use `computeDeliveryFee()` from shared to show a live preview ("6 km en moto = 1 950 FCFA").

### 8.7 Cash ledger

| Method & path | Body | Response |
|---|---|---|
| `GET /controller/cash` | | `CashOverviewDto` |
| `GET /controller/cash/ledger` | query `driverId`, paginated | `Paginated<CashLedgerEntryDto>` (newest first) |
| `GET /controller/cash/businesses` | | `BusinessBalanceDto[]`: goods cash collected for each business and owed to it ([Livraisons d'entreprise](#livraisons-dentreprise)) |
| `POST /controller/drivers/:id/cash-deposits` | `{ "amount": 30000, "note": "Versement agence Zogona" }` | `201 CashLedgerEntryDto` (`type: DEPOSIT`, `amount: -30000`, `balanceAfter`); `409 CONFLICT` if `amount > cashHeld` (checked atomically: concurrent deposits never make the balance negative); **audited** |

`CashOverviewDto`:
```json
{
  "cashLimit": 50000,
  "totalHeld": 90500,
  "drivers": [
    { "driverId": "cmw...", "name": "Adama N.", "phone": "+22673000005", "vehicleType": "MOTO", "cashHeld": 52000, "cashBlocked": true, "lastDepositAt": null }
  ]
}
```
(drivers holding cash or approved, highest balance first).

### 8.8 Incidents (SOS, disputes)

`GET /controller/incidents` (query `status`: one status or a comma-separated list such as `OPEN,IN_PROGRESS`;
`type`; paginated, newest first) → `Paginated<IncidentDto>`

```json
{
  "id": "cmw5d3z3q005l7d3bxqnk8v0r",
  "type": "SOS",
  "status": "OPEN",
  "description": "Crevaison, besoin d’assistance",
  "lat": 12.3985,
  "lng": -1.519,
  "orderId": null,
  "orderNumber": null,
  "reporter": { "id": "cmw5d3z03001u7d3bcvmuvb8j", "name": "Karim D.", "phone": "+22673000002", "role": "DRIVER" },
  "resolutionNote": null,
  "resolvedBy": null,
  "createdAt": "2026-11-06T19:23:16.215Z",
  "resolvedAt": null
}
```
`PATCH /controller/incidents/:id` body `{ "status": "RESOLVED", "resolutionNote": "Livreur dépanné" }` →
`IncidentDto`; **audited**; emits `incident.updated`. The reporter's phone is there for the "Appeler" button.

### 8.9 CSV exports

| Method & path | Query | Response |
|---|---|---|
| `GET /controller/exports/orders.csv` | `from`, `to` (ISO dates, optional; `from` inclusive, `to` exclusive) | `text/csv` (`;` separator, UTF-8 with BOM, 10 000 rows max): number, date, type, status, vehicle, store, driver, distance, amounts, commission, driver earning, seller payout, payment, cash collected, delivered/cancelled dates, who pays the fee, goods to collect, amount owed to the business. **No address and no phone.** |
| `GET /controller/exports/cash-ledger.csv` | `from`, `to` | `text/csv`: date, driver, phone, type, amount, balance after, order number, note, recorded by |

Every export is **audited** `DATA_EXPORTED` (metadata: period and row count). Download with the
`Authorization` header (blob), not a plain link.

### 8.10 Audit log

`GET /controller/audit-logs` (query `action`, `actorId`, `entityType`, `entityId`, paginated, newest first) → `Paginated<AuditLogDto>`
```json
{
  "id": "cmw...",
  "actor": { "id": "cmw...", "name": "Salif K.", "role": "CONTROLLER" },
  "action": "DRIVER_DOCUMENT_VIEWED",
  "entityType": "DriverDocument",
  "entityId": "cmw5d3yzt001j7d3b33syz6jn",
  "metadata": { "driverId": "cmw5d3yzo001h7d3bbfgy6rpg", "documentType": "CNIB" },
  "ip": "127.0.0.1",
  "createdAt": "2026-11-06T19:30:00.000Z"
}
```
Actions: `DRIVER_DOCUMENT_VIEWED`, `DRIVER_APPROVED`, `DRIVER_REJECTED`, `DRIVER_SUSPENDED`, `DRIVER_REINSTATED`,
`USER_SUSPENDED`, `USER_UNSUSPENDED`, `STAFF_CREATED`, `PRICING_RULE_UPDATED`, `STORE_UPDATED_BY_CONTROLLER`,
`CASH_DEPOSIT_RECORDED`, `ORDER_MANUALLY_ASSIGNED`, `ORDER_CANCELLED_BY_CONTROLLER`, `ORDER_PROOF_VIEWED`, `INCIDENT_UPDATED`,
`ORDER_FORCE_DELIVERED`, `ORDER_DELIVERY_CODE_RESET`, `STORE_APPROVED`, `STORE_SUSPENDED`, `DATA_EXPORTED`.

The `ip` is the socket address of the caller. Behind a reverse proxy set `TRUST_PROXY` (`true` or the proxy
IPs/CIDRs); by default `X-Forwarded-For` is ignored so that the audited IP cannot be forged.

---

## 9. Realtime (Socket.IO)

Server: Socket.IO v4 on the API origin. Client: `socket.io-client@4`. Typed with `ServerToClientEvents` /
`ClientToServerEvents` from `@yaar/shared`.

```ts
import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@yaar/shared';

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(API_URL, {
  auth: { token: accessToken },          // JWT, with or without "Bearer "
  transports: ['websocket'],             // recommended on React Native
});
socket.on('connect_error', (err) => { /* err.message: "UNAUTHENTICATED" | "ACCOUNT_SUSPENDED" */ });
```

### 9.1 Rooms (joined automatically on connect)

| Room | Members |
|------|---------|
| `user:<userId>` | every socket of that user |
| `driver:<driverUserId>` | the driver's sockets |
| `controllers` | every CONTROLLER/ADMIN socket |
| `order:<orderId>` | joined explicitly with `order.subscribe` (client owner, store owner, assigned driver while ASSIGNED/PICKED_UP, back office). The server **removes** the driver from the room when he is reassigned, when the order is delivered or cancelled; he then no longer receives its events nor the new driver's position. A suspended account's sockets are disconnected. |

### 9.2 Client → server

| Event | Payload | Ack |
|---|---|---|
| `order.subscribe` | `{ "orderId": "cmw..." }` | `{ "ok": true }` or `{ "ok": false, "error": { "code": "NOT_FOUND", "message": "Commande introuvable" } }` |
| `order.unsubscribe` | `{ "orderId": "cmw..." }` | `{ "ok": true }` (ack optional) |

Re-emit `order.subscribe` after every reconnect (rooms are per connection).

### 9.3 Server → client

| Event | Payload type | Sent to | When |
|---|---|---|---|
| `order.updated` | `OrderUpdatedEvent` | `order:<id>`, `user:<clientId>`, `user:<sellerId>`, `user:<driverId>`, `controllers` | any status change (creation, accept, ready, assignment, pickup, delivery, cancel); also when a new route is cached for the current leg (same `status`, refetch `GET /orders/:id`) |
| `driver.location` | `DriverLocationEvent` | `controllers` always; `order:<orderId>` only when the driver has an active order (ASSIGNED/PICKED_UP) | each accepted `POST /driver/location`; `heading` = the heading kept by the API (§7.2), not necessarily the raw value sent |
| `driver.status` | `DriverStatusEvent` | `controllers`, `driver:<id>` | online/offline/busy changes |
| `offer.new` | `OfferDto` | `driver:<id>` | dispatch offers an order to this driver |
| `offer.closed` | `OfferClosedEvent` | `driver:<id>` | the offer expired (`EXPIRED`) or was withdrawn (`CANCELLED`: order cancelled, manually assigned, driver went offline) |
| `sos` | `SosEvent` = `{ incident: IncidentDto }` | `controllers` | driver SOS |
| `incident.updated` | `IncidentEvent` = `{ incident: IncidentDto }` | `controllers` | dispute created, incident status changed, order cancelled after pickup |
| `order.message` | `OrderMessageDto` | `user:<clientId>`, `user:<driverId>` | chat message (§6.7) |

Payloads:
```json
// order.updated (minimal on purpose: refetch GET /orders/:id to get the role-filtered OrderDto)
{ "orderId": "cmw...", "number": 1048, "status": "ASSIGNED", "driverId": "cmw...", "updatedAt": "2026-11-06T09:43:12.000Z" }

// driver.location
{ "driverId": "cmw...", "lat": 12.3602, "lng": -1.5248, "heading": 90, "speed": 6.5, "orderId": "cmw...", "at": "2026-11-06T09:44:00.000Z" }

// driver.status
{ "driverId": "cmw...", "isOnline": true, "isBusy": false }

// offer.closed
{ "offerId": "cmw...", "orderId": "cmw...", "status": "EXPIRED" }
```

Sockets are a convenience: always be able to recover state with REST (`GET /orders/:id`,
`GET /driver/offers`, `GET /controller/map`) after reconnecting or resuming the app.

---

## Mode polling (Vercel)

When the API runs on Vercel (serverless functions: ephemeral instances, several at once, no persistent
connection), `GET /config` returns `realtime: "poll"`. Then:

- **Do not open a Socket.IO connection** (`/socket.io` answers `404`). No socket event is ever sent.
- Poll the REST endpoints below every `pollIntervalMs` (default **4000 ms**) or slower, while the screen that needs
  them is visible; stop when the app is in the background or the browser tab hidden (resume = one immediate
  refresh). Back off (×2, max 30 s) on network errors.
- Every piece of information the socket events carried is available by REST, with the same privacy rules (§10).
- Background work (30 s offer timeout, next driver, re-offering waiting orders, stale drivers set offline) has no
  timer in this mode: it runs **lazily**, triggered by the polling requests marked ⚙ below (at most once every
  `WORK_THROTTLE_MS` = 4 s across all instances; the triggering request waits for it at most `WORK_BUDGET_MS`,
  then the cycle finishes in the background through `waitUntil`). So an offer is closed 30-35 s after it was made
  as long as someone is polling. The 12-month retention purge runs daily from Vercel Cron (`GET /cron/daily`, below).
- **Quota** (Vercel Hobby: 1 M function invocations per month ≈ 0.38 request/s on average, all apps together):
  every request is an invocation, CORS preflights included. The API answers preflights with
  `Access-Control-Max-Age: 7200`, and browsers cache a preflight per URL: poll **constant URLs** (same query
  string) so that a screen costs one request per interval, not two.

### What to poll

| Who / screen | Endpoint | Interval | Replaces socket event |
|---|---|---|---|
| Driver online, idle | ⚙ `GET /driver/offers` | `pollIntervalMs` (4 s), **never paused for inactivity** (an offer lasts 30 s); only while the app is in the foreground / the tab visible | `offer.new`, `offer.closed` (an offer that disappears from the list was taken, expired or withdrawn; accepting it then gives `409 OFFER_EXPIRED`) |
| Driver online, idle | ⚙ `POST /driver/location` | 30-60 s (unchanged; never while the app is in the background / the tab hidden) | |
| Driver online, idle | ⚙ `GET /driver/current-order` | 30 s (manual assignment by the console) | `order.updated` |
| Driver (any screen) | ⚙ `GET /driver/profile` | 30 s and on resume | `driver.status` (`isOnline`/`isBusy`, e.g. set offline as stale, suspended) |
| Driver on a delivery | ⚙ `POST /driver/location` | 5-10 s (unchanged) | |
| Driver on a delivery | ⚙ `GET /driver/current-order` (or `GET /orders/:id`) | 10 s | `order.updated` (cancelled, reassigned: `order` becomes `null` / `404`) |
| Client, order `SEARCHING_DRIVER` / `ASSIGNED` / `PICKED_UP` | ⚙ `GET /orders/:id` | `pollIntervalMs` (4 s) | `order.updated`, `driver.location` (`driver.lastLocation` + `etaMinutes`, only while ASSIGNED/PICKED_UP) |
| Client, order `PENDING` / `ACCEPTED` / `READY` | ⚙ `GET /orders/:id` | 10 s | `order.updated` |
| Client, order list | `GET /orders?status=…` (constant URL) or `GET /orders?updatedSince=<max updatedAt>` | 30 s | `order.updated` |
| Seller, orders screen | `GET /orders?status=PENDING,ACCEPTED,READY,SEARCHING_DRIVER,ASSIGNED,PICKED_UP` (full list), or incremental `GET /orders?updatedSince=<max updatedAt>` (changes whatever the status: merge by `id`, drop the orders that left the list) | 5-10 s | `order.updated` (new order = `PENDING`) |
| Seller, one order | `GET /orders/:id` | 10 s | `order.updated`, `driver.location` |
| Chat open (client / driver) | `GET /orders/:id/messages` | 5 s | `order.message` |
| Console, map | ⚙ `GET /controller/map` | 10 s | `driver.location`, `driver.status`, `sos` (`openSos`), `order.updated` (active orders) |
| Console, dispatch queue | ⚙ `GET /controller/orders/pending` | 10 s | `order.updated`, `offer.*` (`currentOffer`) |
| Console, indicators (menu badges, KPIs) | ⚙ `GET /controller/dashboard` | 30 s | |
| Console, stores to validate (badge) | `GET /controller/stores?approvalStatus=PENDING&pageSize=1` | 60 s | |
| Console, alerts (header SOS toasts + live map panel, one shared request) | `GET /controller/incidents?status=OPEN,IN_PROGRESS&pageSize=50` | 15 s | `sos`, `incident.updated` |
| Console, incidents screen | `GET /controller/incidents?status=…` | 15 s | `sos`, `incident.updated` |
| Console, one order | `GET /orders/:id` | 10 s | `order.updated`, `driver.location` |
| Business, deliveries screen | ⚙ `GET /business/deliveries?updatedSince=<max updatedAt>&pageSize=100` (merge by `id`) or a constant `?status=…` URL | 10 s | `order.updated` |
| Business, one delivery on the map | ⚙ `GET /orders/:id` | `pollIntervalMs` (4 s) while `SEARCHING_DRIVER`/`ASSIGNED`/`PICKED_UP`, else 30 s | `order.updated`, `driver.location` (`driver.lastLocation` + `heading`, `route`, `etaMinutes`) |
| Recipient, public tracking page | ⚙ `GET /track/:token` (no auth) | `pollIntervalMs` (4 s) while visible; stop when delivered/cancelled | |

⚙ = also triggers the dispatch cycle (`runDueWork`). `POST /orders`, `POST /business/deliveries`,
`POST /orders/:id/ready` and `PATCH /driver/availability` trigger it too.

The reference console idles on the live map at about **0.32 request/s** (map 0.1 + queue 0.1 + alerts 0.067 +
indicators 0.033 + stores 0.017; the KYC queue is reloaded only when its badge changes). After **15 minutes
without interaction** (pointer, keyboard, touch, tab visibility) it stops polling and shows
"Actualisation en pause (inactivité) — cliquez pour reprendre"; any interaction resumes with an immediate refresh.
The mobile app never pauses an online driver's offer polling for inactivity.

`updatedSince` (§6.5) keeps list polling cheap: keep the largest `updatedAt` you received (server clock, so no
skew), send it back, and **merge the returned items by `id`**. With `updatedSince` the server ignores `status` and
returns every order of your scope changed since `updatedSince − 2 s` (oldest change first): an order that leaves
the statuses you display (delivered, cancelled, rejected) is returned once with its new status, so remove it
then. Items already received can come back because of the 2 s overlap; merging by `id` makes that harmless.
An empty `items` means nothing changed. `total` is the count of changed orders, not of all orders (if
`total > items.length`, reload the list once without `updatedSince`).

A suspended account gets `403 ACCOUNT_SUSPENDED` on its next request (instead of a socket disconnection);
a reassigned driver gets `404` on the order (instead of being removed from the room).

### Daily job: `GET /cron/daily`

Called by Vercel Cron once a day (Hobby plan limit) with `Authorization: Bearer <CRON_SECRET>`; `401` otherwise
(and always `401` when `CRON_SECRET` is not set). Runs the 12-month retention purge (§11) and one dispatch cycle.
`200 CronDailyResultDto`:
```json
{
  "retention": { "locationPingsDeleted": 0, "otpCodesDeleted": 3, "orderLocationsPurged": 0, "incidentLocationsPurged": 0, "orderMessagesDeleted": 0, "cutoff": "2025-11-08T02:30:00.000Z" },
  "dispatch": { "ran": true, "expired": 0, "offered": 0, "staleOffline": 1 },
  "ranAt": "2026-11-08T02:30:00.000Z"
}
```
Self-hosted (`npm start`) servers keep their in-process timers: dispatch every `DISPATCH_TICK_MS` in socket mode,
retention every 24 h in both modes.

---

## Itinéraires (carte de suivi)

Road route of the current leg of a job, for Uber Eats–style tracking maps: `RouteDto` in `OrderDto.route`,
`MapOrderDto.route` and `TrackingDto.route`.

```json
{ "target": "PICKUP", "points": [[12.38, -1.53], [12.3751, -1.5293], [12.3686, -1.5275]], "distanceM": 1480,
  "durationS": 371, "source": "osrm", "computedAt": "2026-11-08T21:50:01.000Z" }
```
- `target`: `PICKUP` while `ASSIGNED` (driver → pickup), `DROPOFF` while `PICKED_UP` (driver → recipient).
- `points`: `[lat, lng]` from the driver's position when the route was computed to the target; at most 300 points
  (Douglas–Peucker, starting at 5 m of tolerance, first and last points kept; 5 decimals). To draw what is left, project
  `driver.lastLocation` on the line and draw from there.
- `distanceM`, `durationS`: the whole line; the duration is already adjusted to the vehicle (below).
- `source`: `osrm` = real road route; `straight` = straight line (routing service unavailable or disabled): draw it
  dashed, the ETA is rougher.

**Who sees it.** `OrderDto.route`: the client of the order (former flow), the requesting business, the assigned driver
and the back office, only while `ASSIGNED`/`PICKED_UP` and only when the cached route is for the current leg; `null` for
the seller of a former food order, for other users, in other statuses and **in lists** (payload size). `GET /controller/map`
returns the cached route of each active order (`MapOrderDto.route`) and never calls the routing service. The public
tracking page returns it to the recipient ([Suivi public du destinataire](#suivi-public-du-destinataire)).

**When it is computed** (cached on the order; `updatedAt` does not move):
- at assignment (offer accepted, console assignment): `PICKUP` route from the driver's last known position (if none is
  known, at his first position ping); and once per order, the duration pickup → dropoff (used by the ETA);
- at pickup: `DROPOFF` route from the driver's position if it is less than 2 min old, otherwise from the pickup point;
- on a location ping (`POST /driver/location`), when the cached route is not for the current leg, or the driver is more
  than **120 m** from the line, or the route is older than **3 min**; never more than **once per 30 s per order**, across
  all API instances (conditional `UPDATE` of a per-order attempt timestamp: losing instances do not call the service);
- any status change erases the cached route (the next leg's is computed right after; a finished job keeps neither a
  line nor the driver's start position).

The ping response never waits for the routing service (`204` at once; the computation runs in the background, kept alive
by `waitUntil` on Vercel). Assignment and pickup responses wait for it at most `WORK_BUDGET_MS` (1.5 s), so they
usually already carry the new route. In socket mode an `order.updated` event announces a newly cached route.

**Arrival time** (`etaMinutes`, also on the tracking page), when a route is cached for the current leg:
- `remaining = (1 − progress) × durationS`, where `progress` is the share of the line already covered at the point of
  the line nearest to the driver's last position (when two passes of the line are almost equally near, the earlier one:
  the estimate is never too optimistic);
- `PICKED_UP`: `eta = remaining`;
- `ASSIGNED`: `eta = remaining + 120 s (handover at the pickup) + duration pickup → dropoff` (computed at assignment;
  straight-line estimate when missing);
- `etaMinutes = max(1, ceil(eta / 60))`. Without a cached route: the previous estimate (haversine × 1.3 ÷ average speed:
  bike 12, moto 22, car 20 km/h; via the pickup while `ASSIGNED`).

**Routing providers** (`ROUTING_PROVIDER`):
- `osrm` (default): `GET ${ROUTING_OSRM_URL}/${profile}/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=polyline`,
  header `User-Agent: YaarLivraison/0.1 (demo)`, timeout `ROUTING_TIMEOUT_MS` (2 500 ms). Default URL
  `https://routing.openstreetmap.de` (FOSSGIS servers); profile `routed-bike` for bikes, `routed-car` for motorbikes and
  cars. The polyline (precision 5) is decoded and simplified by the API. OSRM durations are free-flow (speed limits, no
  traffic): they are multiplied by **1.25 (bike), 1.6 (moto), 1.9 (car)** to reach the average city speeds of the quotes
  (≈ 12, 25 and 21 km/h); to recalibrate with the pilot's real delivery times. Failure (timeout, HTTP error, invalid
  JSON, no route) → straight line (`source: "straight"`) and a warning in the logs (without coordinates), never an error.
- `straight`: straight line, distance = haversine × 1.3, duration at the average speed of the vehicle (bike 12, moto 22,
  car 20 km/h). No external call (tests, smoke test, or to send no coordinates to a third party).

**Privacy and legal.** The routing service receives **two coordinates per request and nothing else** (the driver's
position and the pickup or recipient point; no name, phone, address or identifier). With the default URL these requests
go to the **FOSSGIS** public servers in **Germany**: a sub-processor (and a transfer outside Burkina Faso) to declare to
the CIL (law n° 001-2021/AN) along with the hosting. The public FOSSGIS servers are for **demo / pilot use only** (usage
policy: low volume, no guarantee); production must self-host OSRM or Valhalla (OpenStreetMap extract of Burkina Faso) or
use a paid routing API (Google Routes, Mapbox Directions) under a data processing agreement.
`ROUTING_PROVIDER=straight` disables every external call.

---

## 10. Visibility and privacy rules

Implemented by the API (`toOrderDto` in `apps/api/src/services/serializers.ts`); clients must not try to work around them.

| Field of `OrderDto` | Client (owner, former flow) | Business (requester) | Seller (store owner, former flow) | Driver (assigned) | Back office |
|---|---|---|---|---|---|
| `deliveryCode` | yes, until delivered/cancelled | **no** | no | **no** | **no** |
| `pickup`, `dropoff`, `notes`, `recipientName` | yes | yes | while the order is active (not after delivery/cancellation) | only while `ASSIGNED`/`PICKED_UP` | yes |
| `client.phone`, `recipientPhone` | yes | yes | while the order is active | only while `ASSIGNED`/`PICKED_UP` | yes |
| `driver.phone` | while `ASSIGNED`/`PICKED_UP` | while `ASSIGNED`/`PICKED_UP` | while `ASSIGNED`/`PICKED_UP` | own | yes |
| `driver.lastLocation` (with `heading`), `etaMinutes` | while `ASSIGNED`/`PICKED_UP` | while `ASSIGNED`/`PICKED_UP` | while `ASSIGNED`/`PICKED_UP` | no position (ETA yes) | while `ASSIGNED`/`PICKED_UP` |
| `route` (not in lists) | while `ASSIGNED`/`PICKED_UP` | while `ASSIGNED`/`PICKED_UP` | **no** | while `ASSIGNED`/`PICKED_UP` | while `ASSIGNED`/`PICKED_UP` |
| `trackingUrl` | n/a | yes | no | no | yes |
| `commission` | no | no | no | no | yes |
| `driverEarning` | no | no | no | yes | yes |
| `sellerPayout` | no | yes (= `cashToCollect`) | yes | no | yes |

For a business delivery the requester is also the owner of the store: the "Business (requester)" column applies. The
recipient (no account) sees only the public tracking page ([Suivi public du destinataire](#suivi-public-du-destinataire)).

- A driver never sees an order that is not assigned to him (`404`); an offer shows no client address, only the
  store address (FOOD) and approximate zones (§7.3). After delivery, his history keeps amounts and store name
  but `pickup`/`dropoff`/phones become `null`. The same applies to the seller once the order is delivered or
  cancelled (no history of customers' addresses).
- GPS tracking requires the driver's recorded consent (§7.2). Location pings are accepted only while online
  (`403 DRIVER_OFFLINE` otherwise); going offline erases the last position; a silent online driver is set
  offline after `DRIVER_STALE_MINUTES`.
- The client's position is never tracked: it only exists as the order's `dropoff` (or `pickup`). Same for recipients
  of business deliveries: their name, phone and address are entered by the business for that delivery only, shown to
  the driver during the job, never on the tracking page (no phone), and purged after 12 months like client addresses.
- Road routes: the routing service receives only two coordinates per request (default: FOSSGIS servers in Germany, a
  sub-processor to declare to the CIL; `ROUTING_PROVIDER=straight` sends nothing). The cached line and its start
  position are erased at every status change ([Itinéraires](#itinéraires-carte-de-suivi)).
- Retention job (`runRetention`, daily, 12 months): deletes driver location pings and chat messages; on
  delivered/cancelled orders older than 12 months, sets the client's coordinates to `0`, replaces the address
  by "Adresse supprimée (conservation 12 mois)" and erases landmark, recipient and notes (`locationPurgedAt` set;
  a FOOD pickup = store address is kept); erases incident (SOS) positions; deletes OTPs expired for 24 h.
  Amounts, statuses and dates are kept for accounting.
- KYC documents are encrypted at rest, only back office can download them, every download is in the audit log.

---

## 11. Business rules reference

| Rule | Value | Where |
|---|---|---|
| Delivery fee | `max(minimumFare, baseFare + perKm × distanceKm)` rounded **up** to 50 FCFA | `computeDeliveryFee` |
| Distance | haversine × 1.3, rounded to 0.1 km | `roadDistanceKm` |
| Delivery commission | `floor(deliveryFee × commissionPercent / 100)` (pricing rule, 20 % by default) | `computeDeliveryPrice` |
| Seller commission | `floor(itemsTotal × store.commissionPercent / 100)` (10 % by default) | `computeOrderTotals` |
| Driver earning | `deliveryFee − delivery commission` | |
| Client pays | `itemsTotal + deliveryFee` (cash on delivery) | |
| Dispatch radius | 5 km straight line from pickup (`DISPATCH_RADIUS_KM`) | |
| Offer timeout | 30 s (`OFFER_TIMEOUT_SECONDS`), then next nearest driver; a driver who refused/let expire is not re-asked for 5 min | |
| Eligible driver | `APPROVED`, account not suspended, online, not busy, same vehicle type, `cashHeld < CASH_LIMIT`, has a position | |
| Cash limit | 50 000 FCFA (`CASH_LIMIT`); at or above: cannot go online, receives no offers, cannot be assigned | |
| Delivery code | 4 random digits, 5 attempts (atomic counter), then console reset or force-deliver | |
| OTP | 6 digits, valid 5 min, 5 attempts (atomic), 5 requests/hour/phone, per-IP limits on `/auth/*` | |
| Stale online driver | set offline after 10 min without position (`DRIVER_STALE_MINUTES`) | `DispatchService.tick` |
| Location retention | 12 months (pings, order client positions, SOS positions, chat) | `runRetention` |
| Upload size | 5 MB per file decoded; 3 MB on Vercel (and in the mobile app) | `MAX_UPLOAD_BYTES`, `VERCEL_MAX_UPLOAD_BYTES` |
| Business delivery cash | `feePaidBy` `SENDER`: fee collected at pickup; `RECIPIENT`: fee collected at delivery; `cashToCollect` collected at delivery, owed to the business (`owedToBusiness`) | `OrderService.pickup` / `completeDelivery` |
| Business delivery amounts | `itemsTotal` = `sellerPayout` = `cashToCollect`; `total` = `deliveryFee + cashToCollect`; commission on the fee only | `DeliveryService.create` |
| Tracking link | 144-bit token, `${PUBLIC_APP_URL}/suivi/<token>`, `404` 24 h after delivered/cancelled, 120 requests/min/IP | `TRACK_RATE_LIMIT` |
| Route recomputation | leg changed, driver > 120 m from the line, or route > 3 min old; ≥ 30 s between attempts per order (all instances) | `services/routes.ts` |
| ETA from the route | `(1 − progress) × durationS` (+ 120 s handover + pickup → dropoff while `ASSIGNED`), rounded up to the minute | `routeEtaSeconds` |
| OSRM durations | × 1.25 bike, × 1.6 moto, × 1.9 car (free-flow → city average) | `OSRM_DURATION_FACTOR` |
| Driver heading | phone heading when speed ≥ 1 m/s (or not sent), else bearing after ≥ 15 m, else unchanged | `services/heading.ts` |

Map default center: Ouagadougou `12.3714, -1.5197` (`OUAGADOUGOU_CENTER`). Format amounts with
`formatFcfa(6500)` → `"6 500 FCFA"`.

---

## 12. Demo accounts (seed)

`npm run db:seed` (wipes the dev database). With `OTP_DEV_BYPASS=true` (or `DEMO_MODE=true`), log in with code
`123456`; with `DEMO_MODE=true`, the `ADMIN` and `CONTROLLER` accounts use the demo access code (`DEMO_STAFF_CODE`)
instead, after "Recevoir le code". On Vercel, the production build seeds the same accounts once, only when the
database has no user yet (`SEED_DEMO=true` and `DEMO_MODE=true`, `npm run db:seed:if-empty`, never wipes).
The demo is public: the seeded KYC documents are blank images, never upload real ID documents.
The demo follows the B2B model: businesses request deliveries to recipients (fictitious names and numbers, no
accounts); the seed prints the public tracking links of the active deliveries. Routes of the jobs in progress are
computed with `ROUTING_PROVIDER` (OSRM by default, straight line if it does not answer).

| Phone | Role | Notes |
|---|---|---|
| `+22670000001` | ADMIN | Admin Yaar |
| `+22670000002` | CONTROLLER | Salif K. |
| `+22671000001` | SELLER (business) | Le Verdoyant, restaurant (centre-ville): delivery in progress (Issouf) to Ouaga 2000, recipient pays the meal and the fee |
| `+22671000002` | SELLER (business) | Pharmacie du Progrès (Gounghin): one delivery waiting for a moto (no driver nearby: manual assignment), one delivered to a clinic (business recipient) |
| `+22671000003` | SELLER (business) | Faso Mode Boutique (Zogona): one bike delivery searching (offered to Fatimata), 25 000 FCFA to collect |
| `+22671000004` | SELLER (business) | Tech Plus Électronique (Tampouy): car delivery assigned to Abdoul, 85 000 FCFA to collect for a business recipient |
| `+22671000005` | SELLER (business) | Kaya Market, online shop (Ouaga 2000): one delivered yesterday (12 000 FCFA owed, dispute open), one cancelled |
| `+22671000009` | SELLER (business) | Grillades de Pissy, **pending approval** (store validation queue; cannot request deliveries) |
| `+22672000001` / `+22672000002` / `+22672000003` | CLIENT | Aminata K. / Paul T. / Mariam O.: accounts of the deprecated client flow, no orders |
| `+22673000001` | DRIVER | Issouf S., moto, approved, online, on a delivery (picked up), 38 500 FCFA held |
| `+22673000002` | DRIVER | Karim D., moto, approved, online (has an open SOS) |
| `+22673000003` | DRIVER | Fatimata Z., bike, approved, online, 9 700 FCFA held |
| `+22673000004` | DRIVER | Abdoul T., car, approved, online, on a delivery (assigned, on the way to the pickup) |
| `+22673000005` | DRIVER | Adama N., moto, approved, offline, above the cash limit |
| `+22673000006` | DRIVER | Ousmane B., moto, PENDING, complete file |
| `+22673000007` | DRIVER | Rasmané P., bike, PENDING, selfie missing |

Seeded approved drivers have already given their tracking consent. Online seeded drivers that send no
position are set offline after 10 minutes (stale driver rule).

---

## 13. Lot 1 scope: implemented and deferred

Against Annexe 1 of the contract. API side:

| Annexe 1 item | API status |
|---|---|
| Client: order food / parcel, quote, tracking, delivery code, ratings, disputes | implemented |
| Client: call and chat with the driver | chat: §6.7; call: phone numbers exposed during the delivery (§10) |
| Notifications (push and SMS) | push: token registration + `PushProvider` (§3); the production Expo/FCM sender is to be plugged into `PushProvider`. SMS: OTP only (`SmsProvider`) |
| Client ETA ("Votre livreur arrive dans 8 min") | `OrderDto.etaMinutes` (§6.4) |
| Seller: catalogue with prices, availability and photos | implemented (photos: §5) |
| Back office: validation of driver **and seller** files | drivers: §8.3; sellers = store validation, §8.5 |
| Back office: exports | CSV exports of orders and cash ledger (§8.9) |
| Back office: zone management | **deferred**: Lot 1 uses one dispatch radius (`DISPATCH_RADIUS_KM`) and the Ouagadougou neighbourhood list of `approximateZone()`; zones with their own pricing are not implemented |
| Refunds | **deferred**: cash only in Lot 1, a dispute is resolved by the back office with a resolution note; no refund ledger |
| Receipts | **deferred**: the `OrderDto` of a delivered order holds every receipt field; no PDF receipt |
| Mobile money | reserved (`MOBILE_MONEY` → `400 PAYMENT_METHOD_UNAVAILABLE`, Lot 2) |
| Business deliveries (B2B model, 8 Nov 2026) | implemented: quote, request, list, cancel before pickup, cash at pickup/delivery, amounts owed per business ([Livraisons d'entreprise](#livraisons-dentreprise)); **deferred**: payouts to businesses, cancellation fees, WhatsApp messages to recipients (placeholder) |
| Recipient tracking without an account | implemented: public link, live driver position, road route, ETA, delivery code ([Suivi public du destinataire](#suivi-public-du-destinataire)) |
| Road routes and ETA for the tracking maps | implemented with OSRM (public FOSSGIS servers: demo / pilot only) and a straight-line fallback ([Itinéraires](#itinéraires-carte-de-suivi)) |
| Client ordering flow (stores, products, cart, FOOD orders) | **deprecated**, still served for existing builds |

Deployment note: several API instances (Vercel) are supported for dispatch: Postgres partial unique indexes
allow at most one open offer per order and per driver, and the dispatch cycle is guarded by a lease row
(`JobLease`). The per-IP limits on `/auth/*` are still in memory (per instance); the per-phone OTP limit
(5 per hour) is in the database. Files can be stored in Postgres (`STORAGE_DRIVER=db`).

---

## 14. Changelog

Business deliveries, public tracking and road routes (8 Nov 2026, backward compatible; migration
`20261108220000_routes_business_deliveries`, nullable or defaulted columns only):

- **Product model**: businesses (`SELLER`) request deliveries to recipients without an account. New
  `POST /business/deliveries/quote`, `POST /business/deliveries`, `GET /business/deliveries`; `GET /orders/:id`,
  `POST /orders/:id/cancel` (before pickup) and `GET /orders/:id/proof-photo` work for the requesting business;
  `403 STORE_NOT_APPROVED` without a validated business profile ([Livraisons d'entreprise](#livraisons-dentreprise)).
- Cash: fee paid by the business at pickup (`SENDER`) or by the recipient at delivery (`RECIPIENT`), goods
  (`cashToCollect`) collected at delivery and owed to the business; `GET /controller/cash/businesses`; three new columns
  in the orders CSV export.
- Public tracking page `GET /track/:token` (`TrackingDto`, no auth, 24 h after the end, per-IP limit, origin of
  `PUBLIC_APP_URL` allowed by CORS); messages to recipients through `RecipientNotifier` (`RECIPIENT_NOTIFIER`).
- `OrderDto.route`, `MapOrderDto.route`: cached road route of the current leg (OSRM, straight-line fallback), recomputed
  on pings when needed; `etaMinutes` from the route; `heading` in `OrderDto.driver.lastLocation` and `MapDriverDto`
  (and the effective heading in `driver.location`) ([Itinéraires](#itinéraires-carte-de-suivi)).
- `OrderDto.feePaidBy`, `cashToCollect`, `recipientIsBusiness`, `trackingUrl`. Lists (`GET /orders`,
  `GET /business/deliveries`) return `route: null`.
- **Deprecated**: the client ordering flow (§4, §6.2, §6.3, seller accept/ready, chat); it still works.
- New environment variables: `ROUTING_PROVIDER`, `ROUTING_OSRM_URL`, `ROUTING_TIMEOUT_MS`, `PUBLIC_APP_URL`,
  `RECIPIENT_NOTIFIER`, `TRACK_RATE_LIMIT` (see `apps/api/README.md`).
- Demo seed: B2B data (five businesses, deliveries in every status, recipients without accounts).

Public demo safety and Vercel quota (8 Nov 2026):

- **Breaking for demo console logins**: with `DEMO_MODE=true`, existing `CONTROLLER`/`ADMIN` accounts no longer
  accept `123456`; they use the demo access code `DEMO_STAFF_CODE` after `POST /auth/otp/request` (§3). Clients,
  sellers, drivers and sign-ups keep `123456`. `GET /config` never exposes the staff code.
- The API refuses to start with `DEMO_MODE=true` and `OTP_PROVIDER≠console`, and in production or on Vercel with
  `DEMO_MODE=true` without a 6-digit `DEMO_STAFF_CODE` different from `123456`.
- **Behaviour change**: `GET /orders?updatedSince=` ignores `status`, applies a 2 s overlap and sorts by
  `updatedAt` ascending, so that orders leaving a status set (delivered, cancelled) are seen (§6.5).
- `GET /controller/incidents?status=` accepts a comma-separated list (`OPEN,IN_PROGRESS`).
- CORS: preflights cached 2 h (`Access-Control-Max-Age: 7200`); `CORS_ORIGINS` entries may contain a `*` matching
  part of one hostname label (Vercel preview URLs); `*` alone and whole-label patterns are refused in production.
- Uploads on Vercel: 3 MB decoded per file, 4.25 MB per request body, `413 PAYLOAD_TOO_LARGE` in the API's JSON
  format with a French message (Vercel's own limit stays 4.5 MB).
- When the function cannot start, the `500 INTERNAL_ERROR` response carries the CORS headers of allowed origins.
- Polling guidance: console intervals (10 s map and queue, one shared alerts request every 15 s, 60 s for the
  stores badge) and 15-minute idle pause; constant URLs so that preflights stay cached.

Vercel deployment (backward compatible):

- New `GET /config` (`PublicConfigDto`: `realtime`, `pollIntervalMs`, `demoMode`, `otpChannel`) and polling mode
  without Socket.IO ([Mode polling (Vercel)](#mode-polling-vercel)).
- `OrderDto.updatedAt` and `GET /orders?updatedSince=`.
- `GET /cron/daily` (Vercel Cron, `CRON_SECRET`).
- `503 OTP_PROVIDER_UNAVAILABLE` on `POST /auth/otp/request` when the OTP channel is not configured
  (`OTP_PROVIDER=whatsapp` placeholder).
- `DEMO_MODE=true` accepts the code `123456` even in production (announced by `GET /config`; since 8 Nov 2026 not
  for existing console accounts, see above).
- Request bodies are limited to **4.5 MB on Vercel** (platform limit), below the API's own 8 MB: on Vercel keep
  uploaded files under ~3.3 MB (base64 adds a third) and compress photos before upload; a larger request is
  refused by Vercel itself with `413` (not the API's JSON error format).

Earlier corrections after the acceptance review (backward compatible unless marked **breaking**):


- **Breaking for the driver app**: going online now needs the tracking consent (`403 CONSENT_REQUIRED`); send
  `trackingConsent: true` once (§7.2).
- **Breaking for seller onboarding**: new stores are `PENDING` and hidden until approved (§8.5). Existing stores
  were migrated as `APPROVED`.
- **Breaking for the console**: manual assignment refuses offline drivers (`409 DRIVER_OFFLINE`); suspending a
  driver on a delivery is refused (`409 DRIVER_BUSY`).
- `OfferDto` no longer contains the client's free-text addresses (zones instead, `zone` field added).
- `StoreDto.commissionPercent` is `null` for clients and drivers; `approvalStatus`/`approvalNote` added.
- Sellers no longer see the client's address after delivery/cancellation.
- New: `force-deliver`, `reset-delivery-code`, PICKED_UP cancellation by the back office, store approval,
  product photos, push tokens, chat, `etaMinutes`, CSV exports, driver consent endpoints, `order.message` event.
- Delivery code and OTP attempts are counted atomically; cash deposits are atomic; offers cannot be duplicated.
- zod validation messages are in French (`z.config(fr())` in `@yaar/shared`).
- Files: content checked against `mimeType` (`415 UNSUPPORTED_FILE`), `nosniff` on downloads.
- Config: `TRUST_PROXY` (default off), `CORS_ORIGINS=*` refused in production, `AUTH_RATE_LIMIT_*`,
  `DRIVER_STALE_MINUTES`.
