# Yaar Console (contrôleurs)

Console web du back office Yaar Livraison (modèle B2B, docs/API.md « Livraisons d'entreprise ») : des entreprises
demandent des livraisons vers des destinataires sans compte, qui suivent le livreur par un lien public. La console
supervise en temps réel les livreurs et les livraisons, affecte à la main, valide les entreprises et les dossiers KYC,
tient la caisse (espèces des livreurs, montants dus aux entreprises), les tarifs, les litiges/SOS et le journal
d'audit. Interface en français, montants en FCFA. Maquette de référence : `docs/mockups/2-console-controleur.png`.
L'ancien parcours de commande client (repas, produits, panier) est abandonné : ses commandes restent lisibles
(articles affichés seulement pour elles).

Stack : React 19 + Vite 8 + TypeScript strict, react-router 7, MapLibre GL JS 5 (style OpenFreeMap « positron »,
chargé à la demande), socket.io-client 4, `@yaar/shared` (types, enums, libellés, schémas zod, calcul de prix,
géométrie des cartes `map.ts`).
Contrat d'API : [`docs/API.md`](../../docs/API.md).

## Lancer en local

Prérequis : Node 22+, l'API démarrée (voir [`apps/api/README.md`](../api/README.md)) avec `OTP_DEV_BYPASS=true`
et la base de démo (`npm run db:seed`).

```bash
# à la racine du dépôt
npm install
cp apps/console/.env.example apps/console/.env   # facultatif : VITE_API_URL (défaut http://localhost:3000)
npm run dev:api                                  # API sur :3000
npm run dev -w apps/console                      # console sur http://localhost:5173
```

Connexion : numéro `70 00 00 02` (contrôleur Salif K.) ou `70 00 00 01` (administrateur), code `123456`
(API de développement avec `OTP_DEV_BYPASS=true`). Avec une API en mode démo (`DEMO_MODE=true`, ex. la démo
publique sur Vercel), ces comptes utilisent le **code d'accès démo fourni par Yaar** (`DEMO_STAFF_CODE` de l'API),
jamais `123456` : l'écran de connexion le dit, ne pré-remplit que le numéro et affiche l'avertissement
« Démonstration publique : n’utilisez pas de vraies pièces d’identité ni de vraies données personnelles. ».
Seuls les comptes `CONTROLLER` et `ADMIN` sont acceptés ; les autres rôles sont refusés côté console.

| Script (`-w apps/console`) | Rôle |
|---|---|
| `npm run dev` | serveur de développement Vite (port 5173) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | tests vitest + Testing Library (jsdom, sans API ni réseau) |
| `npm run build` | vérification de types puis build de production dans `dist/` |
| `npm run preview` | sert le build |

Configuration (variables Vite, lues au build) : `VITE_API_URL`, URL de l'API REST et Socket.IO ; facultatif
`VITE_MAP_STYLE_URL` (style MapLibre, défaut `https://tiles.openfreemap.org/styles/positron`) et `VITE_MAP_ATTRIBUTION`
(mention des données pour un autre style). En production, mettre l'origine de la console dans `CORS_ORIGINS` côté API.

## Cartes (MapLibre)

Même apparence que l'application mobile (`apps/mobile/src/lib/map`, `components/map`) : style vectoriel gratuit
OpenFreeMap « positron » ; s'il échoue ou n'est pas chargé après 6 s, **fond de secours embarqué** (fond clair, noms
des quartiers de Ouagadougou ; marqueurs et itinéraires toujours affichés) et mention « Fond de carte indisponible ».
Mention des données toujours visible. MapLibre (≈ 1 Mo, 275 Ko gzip, + 10 Ko de CSS) est un bloc séparé chargé par la
première carte affichée (`src/lib/map/engine.ts` → `maplibreModule.ts`) : l'écran de connexion ne le télécharge pas.

- Marqueurs : entreprise = carré orange arrondi (estompé si fermée) ; destinataire d'une livraison en cours = épingle
  verte ; livreur = pastille ronde, véhicule (vélo, moto, voiture) toujours droit et petite flèche séparée orientée
  selon `heading`, anneau vert = libre, bleu = en livraison ; livraison en attente d'un livreur = anneaux rouges
  pulsés au retrait + numéro cliquable ; SOS = point rouge pulsé + nom.
- Étape en cours d'un livreur occupé : `MapOrderDto.route` en vert à liseré blanc, rogné à la position du livreur ;
  pointillés jusqu'à la cible sans itinéraire ou avec la ligne droite de secours (`source: straight`).
- Entre deux rafraîchissements (10 s), les livreurs glissent vers leur nouvelle position en 1,5 s (requestAnimationFrame,
  `src/lib/map/motion.ts`) ; la caméra ne bouge jamais d'elle-même (cadrage initial et bouton « Recentrer »). Aucune
  requête de plus : le budget de polling est inchangé.
- Fiche de livraison : petite carte (retrait, destinataire, livreur, itinéraire), recadrée à chaque changement d'étape.

## Écrans

| Route | Écran |
|---|---|
| `/connexion` | téléphone + code SMS (OTP) |
| `/` | **Carte en direct** : 6 cartes KPI, carte MapLibre (cf. « Cartes »), filtre Vélo/Moto/Voiture, légende, livraisons en attente avec compteur d'attente et bouton « Affecter », dossiers KYC à valider (lien « Vérifier » vers la fiche : aucune validation en un clic), alertes (incidents `OPEN` + `IN_PROGRESS`) |
| `/courses`, `/courses/:id` | **Livraisons** : liste filtrable (statut, type, recherche n° / nom ou téléphone du compte demandeur) avec entreprise, destinataire, statut, véhicule, montant, arrivée estimée, création ; fiche avec carte (itinéraire + livreur), entreprise expéditrice, retrait, destinataire (étiquette « entreprise »), colis, véhicule, frais et qui les paie (entreprise au retrait / destinataire à la livraison), marchandise à encaisser, dû à l'entreprise, lien de suivi du destinataire (ouvrir / copier), chronologie, affecter/réaffecter, annuler, valider sans code, réinitialiser le code, photo de livraison. Ancienne commande repas : articles, client et vendeur |
| `/entreprises` | **Entreprises** (ancienne adresse `/vendeurs` redirigée) : file de validation des profils d'entreprise (une entreprise doit être validée avant de demander des livraisons), refus / suspension avec motif, comptes des entreprises (suspendre / réactiver) |
| `/livreurs`, `/livreurs/:id` | liste (statut, véhicule, en ligne, recherche) ; fiche avec pièces, visionneuse, valider (fenêtre de confirmation qui signale les pièces non ouvertes) / refuser / suspendre / réintégrer, liens vers le journal d'audit |
| `/kyc`, `/kyc/:id` | file des dossiers `PENDING` (FIFO) avec pastilles ✓ / expirée / manquante ; même fiche de revue |
| `/clients` | anciens comptes clients du parcours de commande abandonné (suspendre avec motif / réactiver) |
| `/incidents` | SOS, litiges (filtre « Ouvert » par défaut) : prise en charge, résolution avec note, appel du déclarant |
| `/caisse` | cash détenu, livreurs au plafond, enregistrement d'un versement, grand livre par livreur ; **à reverser aux entreprises** (`GET /controller/cash/businesses`, lecture seule : pas encore de reversement dans l'API) |
| `/tarifs` | grille par véhicule (prise en charge, prix/km, minimum, commission, actif) avec aperçu `computeDeliveryPrice` |
| `/audit` | journal d'audit filtrable (action, objet, n° d'objet ; filtres repris de l'URL, libellés français) |
| `/equipe` | (ADMIN) création de comptes contrôleur/administrateur |

La recherche du bandeau ouvre `/courses?q=…` (une plaque d'immatriculation ouvre `/livreurs?q=…`, et la liste des livraisons propose « chercher parmi les livreurs »). Les filtres lus dans l'URL sont validés : une valeur inconnue est ignorée. Les pastilles du menu viennent de `GET /controller/dashboard`
(livraisons en attente, dossiers KYC, incidents ouverts, livreurs au plafond) et de `GET /controller/stores?approvalStatus=PENDING` (entreprises à valider).

## Temps réel

Une connexion Socket.IO authentifiée par le JWT (`auth: { token }`) rejoint la salle `controllers` :

- `driver.location` / `driver.status` mettent à jour la carte sans rechargement (livreur inconnu → rechargement de `GET /controller/map`) ;
- `order.updated` recharge carte, commandes en attente, listes et fiche ouverte (regroupé par anti-rebond) ;
- `sos` affiche une alerte rouge persistante (Appeler / Traiter) et le marqueur SOS ; `incident.updated` la retire une fois résolue ;
- `order.updated` vers `DELIVERED` recharge aussi la caisse ; la file KYC de la carte se recharge quand la pastille KYC change ;
- les indicateurs sont rafraîchis toutes les 30 s et à chaque événement ; la carte est rechargée toutes les 60 s par sécurité ;
- **reconnexion** : à chaque reconnexion du socket, carte, commandes en attente, dossiers KYC, alertes, indicateurs et caisse
  sont rechargés en REST (les événements manqués ne sont pas rejoués, docs/API.md §9.3) ;
- `connect_error` avec `UNAUTHENTICATED` ou `ACCOUNT_SUSPENDED` coupe le socket et renvoie à l'écran de connexion.

## Mode poll (API sur Vercel)

Quand `GET /config` répond `realtime: "poll"`, aucun socket n'est ouvert : chaque écran recharge ses données en REST
(docs/API.md, « Mode polling (Vercel) »), jamais plus vite que `pollIntervalMs`, et plus du tout quand l'onglet est
masqué. Rythmes (`src/config.ts`, `POLL_MS`) : carte et file d'attente 10 s, alertes 15 s (une seule requête
`status=OPEN,IN_PROGRESS` partagée par les toasts SOS de l'en-tête et le panneau de la carte, `IncidentsProvider`),
indicateurs 30 s, entreprises à valider 60 s, fiche de livraison 10 s, caisse 30 s ; la file KYC de la carte n'est
rechargée que quand sa pastille change, et « à reverser aux entreprises » quand le cash détenu change (ou « Actualiser »). Une console inactive sur la carte coûte ≈ 0,32 requête/s (quota Vercel Hobby : 1 M
d'appels par mois). Après **15 min sans interaction** (souris, clavier, toucher, changement d'onglet), plus aucune
requête et un bandeau « Actualisation en pause (inactivité) — cliquez pour reprendre » ; toute interaction relance
aussitôt un rafraîchissement (`src/realtime/idle.ts`). Tests de bout en bout uniquement : `window.__YAAR_IDLE_PAUSE_MS__`
(injecté avant le chargement de la page) raccourcit ce délai.

## Confidentialité et audit

- Pièces KYC et photos de preuve : téléchargées avec le jeton puis affichées via une URL objet libérée à la fermeture.
  Chaque ouverture est journalisée par l'API (`DRIVER_DOCUMENT_VIEWED`, `ORDER_PROOF_VIEWED`) : la console
  ne précharge jamais ces fichiers et n'utilise pas `<StrictMode>` (qui doublerait le téléchargement en dev).
- Le jeton est conservé dans `localStorage` (clé `yaar.console.token`) ; un `401` ou `ACCOUNT_SUSPENDED` déconnecte. Au démarrage, le profil stocké est revalidé par `GET /me` (rôle hors back office → déconnexion).
- Le code de livraison n'est jamais visible pour le back office (masqué par l'API).

## Organisation du code

```
src/
  api/client.ts          client HTTP typé (toutes les routes back office), ApiError, buildQuery
  auth/AuthContext.tsx   session (jeton + utilisateur), contrôle du rôle
  realtime/              RealtimeProvider (socket.io), useSocketEvent, bus mémoire pour les tests
  hooks/                 useAsync (chargement + anti-course), anti-rebond, DashboardProvider
  lib/                   formatage FR, état de carte, règles KYC, livraisons d'entreprise (delivery.ts)
  lib/map/               MapLibre : style et secours, scène (fonctions pures), marqueurs DOM, animation, contrôleur
  components/            Layout, KPI, LiveMap et DeliveryMap (MapLibre), panneaux, dialogues, visionneuse
  pages/                 un fichier par écran
test/                    vitest + Testing Library (fetch simulé, bus temps réel en mémoire, MapLibre simulé)
```

Les tests n'ont besoin ni de l'API ni du réseau : `fetch` est simulé (`test/helpers.tsx`) ; la carte en direct est
remplacée par un composant de substitution dans les tests de pages (jsdom n'a pas WebGL), la logique des cartes est
testée sans navigateur (`test/map.test.ts` : scènes, itinéraires, marqueurs, contrôleur avec un MapLibre simulé ;
`test/motion.test.ts` : glissement des livreurs avec des minuteries simulées).
