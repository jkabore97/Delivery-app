# Delivery platform: Ouagadougou project brief

Status: **Lot 1 MVP under construction.** Code: `packages/shared`, `apps/api`, `apps/console`, `apps/mobile` (see the root README and [`docs/API.md`](API.md)).
Signable contracts (French): full version [`Contrat_Plateforme_Livraison_Ouagadougou.pdf`](contrat/Contrat_Plateforme_Livraison_Ouagadougou.pdf) and short version [`Contrat_Court_Plateforme_Livraison_Ouagadougou.pdf`](contrat/Contrat_Court_Plateforme_Livraison_Ouagadougou.pdf)
(to regenerate them, run `python3 docs/contrat/generate_contract.py` and `python3 docs/contrat/generate_contract_short.py`)

## 1. What the owner must provide before development starts

| # | Item | Why it matters |
|---|------|----------------|
| 1 | **Business model**: who is paid what (delivery fee, commission % on sellers, driver share) | Drives the pricing engine, payouts and reports |
| 2 | **Pricing rules** per vehicle (bike / moto / car): base fare, price per km, minimum, night or rain surcharge, waiting time | Needed for the price quote shown before the order is confirmed |
| 3 | **Delivery zones**: which quarters and arrondissements of Ouagadougou are served at launch, plus any no-go zones | Needed for geofencing and dispatch |
| 4 | **Types of delivery**: restaurant food, shop goods, A-to-B parcels, documents? Weight and size limits per vehicle | Sets the order flow and which vehicle can take which job |
| 5 | **Driver model**: employees, independent contractors or a partner fleet company? (see §3) | Legal model, payouts, onboarding |
| 6 | **Driver documents** required (CNIB, licence category, registration card, insurance, criminal record?) and who validates them | KYC flow in the driver app and the controller console |
| 7 | **Cash handling**: how drivers hand over the cash they collect (daily deposit, mobile money transfer, limit before blocking) | Cash ledger and driver blocking rules |
| 8 | **Controller roles**: who uses the console (dispatcher, support agent, KYC validator, admin, finance) | Roles and permissions |
| 9 | **Brand**: name, logo, colours, domain name, tone, languages (French at launch; Mooré and Dioula for voice or support later?) | UI and store listings |
| 10 | **Accounts in the company's name**: Google Play ($25), Apple Developer ($99/yr), hosting, SMS provider, maps API key, domain | Store publishing, OTP and maps |
| 11 | **Mobile money**: which provider or aggregator you will sign with (Orange Money, Moov Money, or an aggregator such as CinetPay, PayDunya or Ligdicash) and their API docs or sandbox keys | Lot 2 integration |
| 12 | **Legal texts**: Terms of Use, privacy policy and driver charter (we can draft them, but a lawyer must validate them) | Required by the stores and by the CIL |
| 13 | **Launch targets**: number of drivers, sellers and orders per day expected in the first 3 months | Sizing of infrastructure and budget |
| 14 | **Budget and deadline** | Scope trade-offs |
| 15 | **5 to 10 pilot sellers and 10 to 20 pilot drivers** | Real-world testing |

## 2. Law and regulation (Burkina Faso). Must be checked by a local lawyer.

**Personal data, tracking and IDs**
- Law n° 001-2021/AN (30 March 2021) on the protection of personal data. Regulator: **CIL** (Commission de l'Informatique et des Libertés).
- Geolocation and ID documents are personal data. Before launch, file the declaration or authorisation request with the CIL. The company is the *data controller*; the developer is the *processor*.
- Rules built into the design:
  - Track drivers **only while online or on a job**. Show a visible "tracking on" indicator and get informed consent at sign-up.
  - Collect the client's location **only for an order**, and share it with the driver and seller only for that job.
  - Store ID documents encrypted. Only KYC validators can see them, and every view is logged.
  - Set retention periods (proposed in Annexe 3 of the contract).
  - Host the data in Burkina Faso or a country with adequate protection. A transfer abroad may need CIL authorisation, so check this before choosing a cloud region.

**Drivers and employment**
- Labour code: law n° 028-2008/AN. Social security: **CNSS**.
- If the platform controls schedules, imposes exclusivity, sets sanctions and pays a fixed salary, independent drivers risk being **requalified as employees**. Choose one of these models deliberately:
  - (a) salaried drivers, which means CNSS contributions;
  - (b) independent drivers, who are registered as entrepreneurs, are free to accept or refuse jobs and use their own vehicle;
  - (c) a partner fleet company that employs the drivers.
- Road rules: a valid licence for the vehicle category, vehicle registration, **mandatory third-party liability insurance** (CIMA code) and a helmet for motorcycles. Consider goods-in-transit insurance as well.

**Company, tax and payments**
- The company needs an RCCM and an IFU. VAT is 18% where applicable. Keep accounting records for 10 years (OHADA).
- Mobile money is regulated by the BCEAO. You do **not** hold client money yourself: integrate a licensed issuer or aggregator. Consider KYC and AML thresholds if drivers hold wallets.
- E-signature and e-commerce: law n° 045-2009/AN on electronic services and transactions.
- Disputes: OHADA law; CAMC-O arbitration or the Ouagadougou commercial court.

## 3. Recommended way to build it

**Product**
1. Start with **one MVP** of four front-ends on a single backend: Client app, Seller app, Driver app and a web Controller console.
2. **Addresses**: use a map pin plus a free-text landmark ("behind the Total station in Patte d'Oie"), saved addresses and a phone call fallback. Most Ouagadougou addresses have no street numbers, so this matters.
3. Phone number + SMS OTP login only, with no email required.
4. A **delivery code** given by the client to the driver at hand-off, plus a photo proof. This is the main anti-fraud measure.
5. Cash on delivery in Lot 1, with a **cash ledger per driver** and automatic blocking above a threshold. Mobile money comes in Lot 2.
6. Dispatch: nearest available driver with the correct vehicle type, a timeout, then the next driver. The controller can always reassign manually.
7. Pricing: base fare + distance (road distance, not straight line) per vehicle type. Show the price before the order is confirmed.
8. Driver SOS button, ratings in both directions, and suspension rules.

**Technology**
1. **React Native (Expo)** in TypeScript for the mobile app: one app with Client, Vendeur and Livreur modes, one codebase for Android and iOS. Launch on Android first (most users), iOS second. *(Changed from the original Flutter proposal so that the server, console and app share one TypeScript package for prices and order rules.)*
2. Backend: **Node.js (Fastify) + Prisma + PostgreSQL**, with **WebSockets** (Socket.IO) for live tracking. PostGIS, Redis and road routing (OSRM) are planned for scale-up.
3. Controller console: **React** web app.
4. Maps: OpenStreetMap-based maps (Mapbox or MapLibre) to control cost. Google Maps has better POI data but costs more, so compare. Use OSRM or Valhalla for routing.
5. Notifications: Firebase Cloud Messaging. OTP: a local SMS provider (Orange or an aggregator).
6. Hosting: start small (a single VPS or a managed cloud with daily backups) and choose the region with the CIL in mind.
7. Design for **weak networks**: GPS updates every 5 to 10 s only while on a job, offline queueing of status changes, small APK (under 30 MB), and low data use.

**Security and anti-fraud**
- Driver KYC: ID + selfie + licence + registration + insurance, validated manually by a controller. Check that the plate matches the vehicle photo.
- Detect GPS spoofing (mock-location flag, impossible speeds), one account per device, and limits on cancellations.
- Role-based access, audit log, encryption at rest for documents, HTTPS everywhere, and backups.

**Process**
1. Week 0: sign the contract and validate the requirements, mock-ups and price grid.
2. Sprints of 2 weeks, with a test build delivered to the partner each sprint.
3. Pilot in 1 or 2 districts with pilot sellers and drivers, then a city-wide launch.
4. Lot 2: mobile money. Lot 3: loyalty and promos, scheduled deliveries, B2B accounts, local languages.

**Rough MVP timeline**: 10 to 14 weeks for one experienced developer, or a small team. This depends on scope.
