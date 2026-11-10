# Yaar Console (contrôleurs)

Console web du back office Yaar Livraison (modèle B2B, docs/API.md « Livraisons d'entreprise ») : des entreprises
demandent des livraisons vers des destinataires sans compte, qui suivent le livreur par un lien public. La console
supervise en temps réel les livreurs et les livraisons, affecte à la main, valide les entreprises et les dossiers KYC,
tient la caisse (espèces des livreurs, montants dus aux entreprises), les tarifs, les litiges/SOS et le journal
d'audit. Interface en français, montants en FCFA. Apparence : système de design « Cobalt »
([`docs/DESIGN.md`](../../docs/DESIGN.md)), version bureau dense (voir « Apparence (Cobalt) » ci-dessous).
L'ancien parcours de commande client (repas, produits, panier) est abandonné : ses commandes restent lisibles
(articles affichés seulement pour elles).

Stack : React 19 + Vite 8 + TypeScript strict, react-router 7, MapLibre GL JS 5 (fond « Cobalt », OpenFreeMap
recoloré, chargé à la demande), socket.io-client 4, `@yaar/shared` (types, enums, libellés, schémas zod, calcul de prix,
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
`VITE_MAP_STYLE_URL` (style MapLibre, défaut `/map/cobalt-style.json`, le fond Cobalt servi par la console) et `VITE_MAP_ATTRIBUTION`
(mention des données pour un autre style). En production, mettre l'origine de la console dans `CORS_ORIGINS` côté API.

## Cartes (MapLibre)

Même apparence que l'application mobile (`apps/mobile/src/lib/map`, `components/map`) : fond « Cobalt », OpenFreeMap
« positron » recoloré (terre `#F3F5F8`, eau `#A9C9FF`, parcs `#D6EEDC`, rues blanches, grands axes jaunes, noms des
quartiers seulement), style statique servi par la console : `public/map/cobalt-style.json` → `/map/cobalt-style.json`
(copie de celui de l'application mobile ; tuiles et polices de `tiles.openfreemap.org`, gratuit, sans clé). S'il échoue
ou n'est pas chargé après 6 s, **fond de secours embarqué** (terre Cobalt unie, noms des quartiers de Ouagadougou ;
marqueurs et itinéraires toujours affichés) et mention « Fond de carte indisponible ». Mention des données toujours
visible. MapLibre (≈ 1 Mo, 275 Ko gzip, + 10 Ko de CSS) est un bloc séparé chargé par la première carte affichée
(`src/lib/map/engine.ts` → `maplibreModule.ts`) : l'écran de connexion ne le télécharge pas. Palette des cartes :
`src/lib/map/palette.ts` ; styles des marqueurs injectés par `src/lib/map/markers.ts` et limités aux cadres de carte
(classe `yaar-cobalt`).

- Marqueurs : entreprise = carré encre arrondi cerclé de blanc, à ses initiales (« LV »), estompé si fermée ;
  destinataire d'une livraison en cours = goutte cobalt à maison, halo pulsé ; livreur = disque blanc, véhicule (vélo,
  moto, voiture) au trait toujours droit et petite encoche séparée orientée selon `heading` — cobalt en livraison,
  encre atténuée avec une pastille menthe quand il est libre ; livraison en attente d'un livreur = radar cobalt doux
  au retrait + étiquette blanche cliquable (« #1005 ») ; SOS = point corail pulsé + étiquette corail foncé (nom).
- Étape en cours d'un livreur occupé : `MapOrderDto.route` en cobalt 6 px sur un liseré blanc de 2 px avec de petits
  chevrons blancs dans le sens de la marche, rogné à la position du livreur ; tirets cobalt jusqu'à la cible sans
  itinéraire ou avec la ligne droite de secours (`source: straight`). Livraison en attente d'un livreur : tirets
  cobalt du retrait au destinataire ; trajet à venir (ou effectué) de la fiche : pointillés encre à 30 %.
- Entre deux rafraîchissements (10 s), les livreurs glissent vers leur nouvelle position en 1,5 s (requestAnimationFrame,
  `src/lib/map/motion.ts`) ; la caméra ne bouge jamais d'elle-même (cadrage initial et bouton « Recentrer »). Aucune
  requête de plus : le budget de polling est inchangé.
- Fiche de livraison : petite carte (retrait, destinataire, livreur, itinéraire), recadrée à chaque changement d'étape.

## Écrans

| Route | Écran |
|---|---|
| `/connexion` | téléphone + code SMS (OTP) |
| `/` | **Carte en direct** : 6 tuiles d'indicateurs (une seule tuile cobalt, livraisons en cours ; espèces en tuile soleil ; attente longue en alerte corail), carte MapLibre (cf. « Cartes »), filtre Vélo/Moto/Voiture, légende, livraisons en attente avec compteur d'attente et bouton « Affecter », dossiers KYC à valider (lien « Vérifier » vers la fiche : aucune validation en un clic), alertes (incidents `OPEN` + `IN_PROGRESS`) |
| `/courses`, `/courses/:id` | **Livraisons** : liste filtrable (statut, type, recherche n° / nom ou téléphone du compte demandeur) avec entreprise, destinataire, statut, véhicule, montant, arrivée estimée, création ; fiche avec carte (itinéraire + livreur), entreprise expéditrice, retrait, destinataire (étiquette « entreprise »), colis, véhicule, frais et qui les paie (entreprise au retrait / destinataire à la livraison), marchandise à encaisser, dû à l'entreprise, lien de suivi du destinataire (ouvrir / copier), chronologie, affecter/réaffecter, annuler, valider sans code, réinitialiser le code, photo de livraison. Ancienne commande repas : articles, client et vendeur |
| `/entreprises` | **Entreprises** (ancienne adresse `/vendeurs` redirigée) : file de validation des profils d'entreprise (une entreprise doit être validée avant de demander des livraisons), refus / suspension avec motif, comptes des entreprises (suspendre / réactiver) |
| `/livreurs`, `/livreurs/:id` | liste (statut, véhicule, en ligne, recherche) ; fiche avec pièces, visionneuse, valider (fenêtre de confirmation qui signale les pièces non ouvertes) / refuser / suspendre / réintégrer, liens vers le journal d'audit |
| `/kyc`, `/kyc/:id` | file des dossiers `PENDING` (FIFO) avec barre d'avancement et pastilles fournie (coche) / expirée / manquante ; même fiche de revue |
| `/clients` | anciens comptes clients du parcours de commande abandonné (suspendre avec motif / réactiver) |
| `/incidents` | SOS, litiges (filtre « Ouvert » par défaut) : prise en charge, résolution avec note, appel du déclarant |
| `/caisse` | cash détenu, livreurs au plafond, enregistrement d'un versement, grand livre par livreur ; **à reverser aux entreprises** (`GET /controller/cash/businesses`, lecture seule : pas encore de reversement dans l'API) |
| `/tarifs` | grille par véhicule (prise en charge, prix/km, minimum, commission, actif) avec aperçu `computeDeliveryPrice` |
| `/audit` | journal d'audit filtrable (action, objet, n° d'objet ; filtres repris de l'URL, libellés français) |
| `/equipe` | (ADMIN) création de comptes contrôleur/administrateur |

La recherche du bandeau ouvre `/courses?q=…` (une plaque d'immatriculation ouvre `/livreurs?q=…`, et la liste des livraisons propose « chercher parmi les livreurs »). Les filtres lus dans l'URL sont validés : une valeur inconnue est ignorée. Les pastilles du menu viennent de `GET /controller/dashboard`
(livraisons en attente, dossiers KYC, incidents ouverts, livreurs au plafond) et de `GET /controller/stores?approvalStatus=PENDING` (entreprises à valider).

## Apparence (Cobalt)

La console est la version bureau, dense, du tableau de bord entreprise de la planche Cobalt : barre latérale blanche de
248 px (mot-symbole « Yaar » à point cobalt, menu en pilules à pictogrammes, pastilles cobalt ou corail, utilisateur en
bas), barre du haut (titre 30/800, date et état de l'actualisation, recherche en pilule, badge « Démo »), tuiles
blanches de rayon 24 à ombre douce sur le fond `canvas`, sans bordure.

- **Jetons** : un seul bloc `:root` en tête de `src/styles.css` (noms proches de `apps/mobile/src/theme.ts` : `--canvas`,
  `--card`, `--raised`, `--ink`, `--ink-muted`, `--cobalt`, `--cobalt-tint`, `--cobalt-text`, `--sun`, `--mint`,
  `--coral-fill`…, rayons `--r-*`, ombres `--sh-*`). Aucune couleur écrite en dur ailleurs ; contrastes ≥ 4,5:1 pour
  le petit texte (valeurs mesurées en commentaire).
- **Règles** : au plus une tuile cobalt pleine par écran (livraisons en cours sur la carte, livraison en cours sur sa
  fiche, panneau de l'écran de connexion) ; le soleil pour les espèces (cash détenu, à encaisser, à reverser) ; menthe
  = livrée / réussite ; corail = problème (points, pictogrammes ; boutons destructifs en `--coral-fill`) ; aucun émoji.
- **Pictogrammes** : `src/components/Icon.tsx` + `iconPaths.ts`, la famille de l'application mobile (grille 24, trait
  2,2 arrondi), plus pièce d'identité, étiquette, export… Toujours décoratifs (`aria-hidden`) : le bouton porte le
  libellé (`aria-label` pour un bouton sans texte).
- **Composants** (`src/components/ui.tsx`) : `Badge` (puces 24 px : `green` livrée, `blue` en livraison, `sun` livreur
  vers le retrait, `search` recherche d'un livreur, `orange` à valider, `red` annulée / problème, `coral` SOS, `grey`),
  `Banner` (info, avertissement, erreur, réussite), `Avatar` (cobalt pâle dans les listes ; soleil pour le livreur mis
  en avant), `BizMark` (entreprise : carré encre aux mêmes initiales que sur les cartes, `markerInitials`), `Rating` (étoile dessinée), `DateTimeCell`, `FilterSelect`, `Empty`,
  `Loading`, `Pagination`, `Modal` (portail, fond inerte, focus piégé puis rendu à l'ouvreur, Échap), `TableWrap`. `PageTitle` (`src/components/PageTitle.tsx`) : chaque écran déclare son titre, que
  la coque affiche dans la barre du haut. `KpiTile` (`KpiCards.tsx`), `DeliveryHero` (tuile héros de la fiche de
  livraison : heure d'arrivée, étapes, livreur, destinataire, pilule soleil des espèces).
- **Tableaux** : dans une tuile blanche, filets fins, en-tête collant, chiffres tabulaires, montants alignés à droite.
  `TableWrap` mesure le tableau : trop large pour sa carte, il défile dans la carte (jamais la page) ; sinon il garde
  son en-tête collant.
- **Barre latérale** : 248 px dès 1280 px ; barre étroite de pictogrammes (nom en info-bulle) de 821 à 1279 px ; menu
  escamotable sous 821 px (voile, Échap).
- **Boutons** : une seule action cobalt pleine par écran ; les déclencheurs destructifs (annuler, refuser, suspendre)
  sont en `btn-danger-soft`, le corail plein est réservé au bouton qui confirme dans la fenêtre.
- **Accessibilité** : anneau de focus cobalt de 2 px (`:focus-visible`), vrais boutons et liens, boutons-pictogrammes
  libellés, cibles de 48 px sur écran tactile (`pointer: coarse`), « / » place le curseur dans la recherche.

### Police

**Plus Jakarta Sans**, auto-hébergée (paquet `@fontsource-variable/plus-jakarta-sans` : un fichier variable woff2 par
alphabet, ≈ 27 Ko pour le latin, toutes les graisses 500 à 800, servi par la console). Un seul fichier la connaît :
**`src/fonts.css`** (l'`@import` du paquet et la variable `--font-sans`, avec `--font-mono` pour les identifiants du
journal d'audit) ; tout le reste écrit `var(--font-sans)` ou hérite. Chiffres tabulaires (`font-variant-numeric:
tabular-nums`, classes `.tnum` / `.num`) pour les heures, montants, compteurs et plaques.

Changer de police :

1. `npm install @fontsource-variable/<police> -w apps/console` (ou `@fontsource/<police>` pour des fichiers par
   graisse), puis `npm uninstall @fontsource-variable/plus-jakarta-sans -w apps/console` ;
2. dans `src/fonts.css` seulement : l'`@import` (ex. `@fontsource-variable/inter/wght.css`) et le premier nom de
   `--font-sans` (ex. `'Inter Variable'`) ;
3. vérifier `npm run build -w apps/console` et regarder les écrans : une autre police a d'autres largeurs (tuiles
   d'indicateurs, menu de 248 px, chiffres tabulaires).

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
rechargée que quand sa pastille change, et « à reverser aux entreprises » quand le cash détenu change (ou « Actualiser »).
Les indicateurs sont aussi rechargés dès que la carte rafraîchie montre un changement qu'ils comptent (course livrée ou
annulée qui disparaît, nouvelle course, changement de statut, livreur en ligne ou en course : `kpiFingerprint`,
`src/lib/mapState.ts`) : « Livrées aujourd'hui » suit la carte à 10 s près au lieu de 30 s, sans requête de plus quand
rien ne change. Une console inactive sur la carte coûte ≈ 0,32 requête/s (quota Vercel Hobby : 1 M
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
  fonts.css              LA police (seul fichier qui la nomme) : variable --font-sans
  styles.css             jetons Cobalt (un bloc :root) et styles de la console
  components/            Layout (coque), PageTitle, Icon + iconPaths, ui (puces, bandeaux, tableaux…), KPI,
                         DeliveryHero, LiveMap et DeliveryMap (MapLibre), panneaux, dialogues, visionneuse
  pages/                 un fichier par écran
test/                    vitest + Testing Library (fetch simulé, bus temps réel en mémoire, MapLibre simulé)
```

Les tests n'ont besoin ni de l'API ni du réseau : `fetch` est simulé (`test/helpers.tsx`) ; la carte en direct est
remplacée par un composant de substitution dans les tests de pages (jsdom n'a pas WebGL), la logique des cartes est
testée sans navigateur (`test/map.test.ts` : scènes, itinéraires, marqueurs, contrôleur avec un MapLibre simulé ;
`test/motion.test.ts` : glissement des livreurs avec des minuteries simulées).
