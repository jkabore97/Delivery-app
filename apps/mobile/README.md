# Yaar Livraison : application mobile (Expo)

Yaar Livraison est un service de livraison **pour les entreprises** (comme Uber Direct / DoorDash Drive) : une
entreprise demande une livraison vers un client ou une autre entreprise ; le destinataire **n’a pas de compte** : il
reçoit un lien, suit le livreur sur une carte en direct et lui donne le code de livraison à la réception.

Une seule application React Native (Expo SDK 58, TypeScript strict, Expo Router) avec deux espaces, choisis selon le
rôle du compte après la connexion par code, et une page publique :

| Espace | Rôle API | Accent | Fonctions |
|---|---|---|---|
| **Entreprise** | `SELLER` (profil d’entreprise = boutique validée par Yaar) | cobalt `#2448FF` | onglet **Livraisons** : carte d’ensemble des livraisons en cours avec les livreurs en direct + liste ; onglet **Nouvelle** : demande en 3 étapes (destination sur une carte à épingle centrale avec bulle du quartier, adresse, repère, destinataire, « destinataire entreprise », suggestions de quartiers ; colis, véhicule avec prix du devis, qui paie la livraison, montant à encaisser ; récapitulatif → « Demander un livreur ») ; **suivi** façon Uber (carte plein écran, heure d’arrivée, étapes, livreur à appeler, destinataire, montants, « Envoyer le lien de suivi au destinataire », annulation avant le retrait ; jamais le code) ; **Historique** ; **Profil** (entreprise, adresse de retrait, bandeau de validation, compte) |
| **Livreur** | `DRIVER` | cobalt `#2448FF` (une action évidente par écran) ; soleil `#FFC93C` pour les espèces | inscription KYC (étapes, véhicule, immatriculation), pièces (cartes blanches, état « Manquante / Expirée / Reçue » à pictogramme), écran d’attente de validation, « Vous êtes prêt ! » (une fois, dossier validé et jamais passé en ligne : illustration, « Passer en ligne » / « Plus tard ») ; **accueil** : carte Cobalt plein écran, indicateur légal « En ligne : suivi GPS actif », SOS, grand bouton rond cobalt « Passer en ligne » (pilule blanche « Passer hors ligne » une fois en ligne), feuille blanche : gains du jour en grand chiffre cobalt, espèces détenues / plafond en jauge soleil (rouge au plafond), course en cours ; **offre plein écran** (carte Cobalt : livreur, entreprise, zone de livraison en cercle doux ; « ≈ N min · X km » ; grand bouton rond « Accepter » dans l’anneau du compte à rebours de 30 s, rouge les 10 dernières secondes ; « Refuser » en pilule rouge ; gain en tuile cobalt douce, espèces en tuile soleil) ; **course** : carte + feuille blanche, étape en titre fort (« Récupérer » / « Livrer ») avec distance et temps, adresse, repère, colis, instructions, espèces de l’étape en barre soleil et boutons ronds Récupéré / Livré, Itinéraire, WhatsApp, Appeler fixés en bas (le détail s’efface sous un fondu, jamais coupé net) ; **livraison** : montant à encaisser en tuile soleil, code à 4 chiffres en grandes cases (collage accepté), photo facultative, puis gain en tuile héros cobalt, gains du jour et note ; gains (tuile héros, tuile soleil des espèces, mouvements de caisse), historique, profil |
| **Suivi public** | aucun (lien `/suivi/<jeton>`, sans connexion) | cobalt `#2448FF` (le code), soleil (le montant) | carte Cobalt plein écran (panneau à droite sur ordinateur, ≥ 900 px), heure d’arrivée en chiffres héros « 14:32 » + « dans 12 min », 4 étapes en pilules (Confirmée → Retrait → En route → Livrée), code à donner au livreur (tuile cobalt), montant à payer (tuile soleil), livreur (prénom, véhicule, plaque, note, « Appeler », « WhatsApp »), expéditeur, adresse et repère ; sur 360 × 640, heure, code et montant visibles sans défiler ; états recherche, livrée (merci), annulée, lien expiré, erreur réseau ; page légère en 3G (ni react-native-svg ni zod, requête du suivi lancée dès le démarrage, carte téléchargée après le code de l’application) |

Pas d’inscription client : l’écran de connexion ne propose que **Entreprise** et **Livreur**. Un ancien compte
`CLIENT` est déconnecté avec un message d’accueil (« Yaar Livraison est réservé aux entreprises et aux livreurs…
ouvrez le lien de suivi reçu »). Un compte `CONTROLLER` ou `ADMIN` est refusé avec « utilisez la console web ».
Toute l’interface est en français, les montants en FCFA (`6 500 FCFA`).
Contrat d’API : [`docs/API.md`](../../docs/API.md) (§ « Livraisons d’entreprise », « Suivi public du destinataire »,
« Itinéraires »).

## Démarrage

Prérequis : Node 22, l’API lancée (voir [`apps/api/README.md`](../api/README.md)) avec `OTP_DEV_BYPASS=true`,
et l’application **Expo Go** sur un téléphone Android (ou un émulateur).

```bash
cd apps/mobile
npm install            # paquet autonome : il a son propre package-lock.json (pas un workspace npm)
cp .env.example .env   # puis ajuster EXPO_PUBLIC_API_URL
npm start              # QR code à scanner avec Expo Go ; touche « a » pour l’émulateur Android
```

`EXPO_PUBLIC_API_URL` :

- émulateur Android : `http://10.0.2.2:3000` (valeur par défaut sur Android) ;
- téléphone réel : `http://<IP-du-PC-sur-le-Wi-Fi>:3000` (l’API écoute sur `0.0.0.0`) ;
- simulateur iOS : `http://localhost:3000`.

Comptes de démonstration (seed de l’API, code `123456`) : entreprises `71000001` (Le Verdoyant), `71000002`
(Pharmacie du Progrès), `71000003` (Faso Mode Boutique), `71000004`, `71000005` ; entreprise en attente de validation
`71000009` ; livreurs `73000002` (moto, libre), `73000003` (vélo), `73000001` (moto, en course), livreur en attente de
validation `73000007`. Le seed affiche aussi les liens de suivi des destinataires (`/suivi/<jeton>`). La liste complète
est dans `docs/API.md` § 12. En mode démo (`GET /config` → `demoMode`), l’écran de connexion affiche le code `123456`,
les comptes de démonstration et l’avertissement « Démonstration publique : n’utilisez pas de vraies pièces d’identité
ni de vraies données personnelles. », repris sur l’écran des pièces KYC du livreur.

## Scripts

| Commande | Rôle |
|---|---|
| `npm start` | serveur de développement Expo (Metro) |
| `npm run typecheck` | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) |
| `npm test` | tests jest (`jest-expo`) : logique (cartes, montants, partage du lien, étapes), hooks, contextes (livreur, socket) et écrans (suivi public, nouvelle livraison, suivi entreprise, course et livraison du livreur, offre, connexion) dans `src/__tests__/` |
| `npm run export:android` | bundle de production Android dans `dist/` (vérifie que tout compile) |
| `npm run export:web` | version web (Vercel) dans `dist/` : découpage « granular » par écran (`experiments.chunking`), MapLibre dans un bloc séparé ; `scripts/web-postexport.mjs` écrit dans `index.html` la liste des blocs que la page publique `/suivi/…` précharge dès le HTML |

## Cartes (suivi façon Uber / DoorDash)

Un seul moteur de carte (`src/components/map/`) sert au suivi de l’entreprise, à la page publique, à la course du
livreur, à la carte d’ensemble et au choix d’adresse :

- **Fond « Cobalt » partout** (système de design Cobalt, aucune carte sombre, offre du livreur comprise) :
  OpenFreeMap « positron » recoloré — terre `#F3F5F8`, eau `#A9C9FF`, parcs `#D6EEDC`, rues blanches, grands axes
  jaunes `#FFE38A` (bord `#F0C85A`), noms des quartiers seulement (Noto Sans Bold `#7B8597`, majuscules). C’est un
  style MapLibre statique servi par la version web elle-même : `public/map/cobalt-style.json` → `/map/cobalt-style.json`
  (copié dans `dist/` par `expo export`, gardé par `scripts/web-postexport.mjs`). Ses tuiles, polices et noms viennent
  de `tiles.openfreemap.org` (gratuit, sans clé) ; il n’a pas de sprite (aucune icône : deux requêtes de moins en 3G).
  Pour retoucher une couleur, modifier ce fichier (et sa copie `apps/console/public/map/cobalt-style.json`).
  Palette des cartes : `src/lib/map/palette.ts` (valeurs du système de design, sans dépendre de `theme.ts`).
- **Web** : MapLibre GL JS (`maplibre-gl` 5.x, construction UMD qui embarque son worker ; la 6.x, ESM seulement, charge
  son worker par `import.meta.url`, que le bundle web de Metro ne sait pas servir), chargé à la demande
  (`import('maplibre-gl')`), densité de pixels plafonnée à 2, rotation et inclinaison désactivées sauf pour le
  livreur. La carte s’affiche aussitôt avec un style de secours embarqué (terre Cobalt unie, sans tuiles, marqueurs et
  itinéraires), puis passe au style Cobalt (`/map/cobalt-style.json`, remplaçable par `EXPO_PUBLIC_MAP_STYLE_URL` :
  URL absolue, ou relative à la page) dès qu’il arrive : il est redemandé avec un délai croissant (2 s, 4 s… 60 s) tant
  qu’il n’est pas chargé, et aussitôt au retour du réseau (`online`) — jamais abandonné (`src/lib/map/styleLoader.ts`).
  Un style que MapLibre refuse ramène au style de secours ; des tuiles indisponibles laissent la terre Cobalt sous les
  marqueurs. Le style reçu est gardé pendant la session, par URL : une carte rouverte l’affiche aussitôt. `theme="dark"`
  (`<LiveMap>`) et `mapTheme` (`LiveTrackingLayout`) sont encore acceptés mais dépréciés : même carte Cobalt
  (`EXPO_PUBLIC_MAP_STYLE_DARK_URL` n’est plus lue). Seules les règles utiles de `maplibre-gl.css` sont injectées avec
  la carte (la feuille complète bloquait le premier affichage). Mention « © OpenFreeMap © OpenMapTiles © OpenStreetMap
  contributors » toujours visible au-dessus de la feuille, dans la marge de cadrage (jamais sur un marqueur cadré).
- **Android / iOS** : `react-native-maps` ; Google Maps (Android) avec le style Cobalt (`ANDROID_MAP_STYLE` :
  terre, eau, parcs, rues blanches, grands axes jaunes, ni points d’intérêt ni transports, noms des quartiers
  seulement), Apple Plans clair (iOS, `userInterfaceStyle="light"` même quand le téléphone est en mode sombre) ;
  marqueurs en vues personnalisées STATIQUES, capturées une seule fois (`tracksViewChanges` coupé après le premier
  rendu : aucune image redessinée à chaque image) ; radar cobalt « recherche d’un livreur » en cercles natifs
  (5 images/s) ; `mapPadding` garde le logo Google et le lien « Mentions légales » d’Apple au-dessus de la feuille ;
  marges de cadrage bornées à la taille de la carte.
- **Marqueurs** (mêmes formes en web — éléments HTML, `markerDom.web.ts` — en natif — vues, `MarkerViews.tsx` — et
  dans la console) : entreprise = carré encre `#0C1222` arrondi cerclé de blanc, initiales blanches (`initials`) ou
  boutique, radar cobalt doux pendant la recherche d’un livreur (`pulse`) ; destinataire = goutte cobalt `#2448FF`
  cerclée de blanc, initiales blanches ou maison, halo pulsé sous la pointe ; livreur = disque blanc (38 px), véhicule
  cobalt au trait (moto / vélo / voiture DE PROFIL, toujours droit) et petite encoche de cap cobalt sur le bord, qui
  suit le cap (`heading` de l’API, ou déduit du déplacement), masquée quand le cap est inconnu, le livreur arrêté ou
  sa position ancienne ; seule l’encoche tourne (web : élément enfant, corrigé de l’orientation de la carte ; natif :
  marqueur plat séparé avec `rotation`). Variante `tone: 'sun'` (disque Sun `#FFC93C`, véhicule encre) pour un livreur
  en route vers l’entreprise vu par l’entreprise. Livreur arrivé chez l’entreprise : marqueur décalé de quelques
  pixels pour ne pas la cacher. Pictogrammes au trait (anneaux et traits ronds), identiques sur le web (SVG) et en
  natif (vues) : `markerArt.ts`. Zones approximatives (`zones`) : cercles cobalt translucides à bord en tirets
  (livraison ; encre pour un retrait approximatif), jamais l’adresse avant acceptation.
- **Itinéraire et lignes** (`SceneLine.kind`) : `route` = `route` de l’API (`OrderDto` / `TrackingDto`) devant le
  livreur, cobalt 6 px sur un liseré blanc de 2 px avec une ombre douce et de petits chevrons blancs tous les 64 px
  dans le sens de la marche (web : calque `symbol` et image `addImage` calculée, `src/lib/map/chevron.ts` ; pas de
  chevrons en natif) ; la partie parcourue est rognée au point de la ligne le plus proche du livreur (fonctions de
  `packages/shared/src/map.ts`). `dashed` = ligne droite en tirets cobalt de 2,5 px (recherche d’un livreur, pas
  d’itinéraire, `source: "straight"`, aperçu de l’offre). `pending` = étape à venir (retrait → destinataire pendant
  le retrait) en pointillés encre à 30 %.
- **Livreur qui roule en continu** : chaque nouvelle position est atteinte à vitesse constante pendant l’écart RÉEL
  entre deux relevés GPS (`lastLocation.at`, borné à 2–12 s ; `src/lib/map/motion.ts`), quel que soit le rythme des
  rafraîchissements (requestAnimationFrame sur le web, `AnimatedRegion` en natif) ; tracé rogné au plus une fois par
  seconde en natif.
- **Rafraîchissements** : page publique toutes les `trackingPollIntervalMs` de `/config` (8 s par défaut) pendant la
  course, deux fois moins souvent pendant la recherche d’un livreur ; carte d’ensemble de l’entreprise toutes les
  10 s, démontée quand une livraison est ouverte par-dessus (une seule carte WebGL à la fois). Ses itinéraires (la
  liste n’en porte que la date de calcul, `routeComputedAt`) sont relus sur `GET /orders/:id` seulement à un
  changement d’étape, ou quand cette date change alors que le livreur a quitté le tracé en cache (nouveau chemin),
  plus une relecture de sécurité toutes les 5 min (`src/lib/liveRoutes.ts`).
- **Caméra** : cadre livreur + cible (entreprise tant que le colis n’est pas récupéré, puis destinataire ; la page du
  destinataire garde aussi sa propre épingle pendant le retrait) avec des marges de feuille + 90 px en bas et 60 px
  au moins sur les côtés ; suit le livreur jusqu’au premier geste de l’utilisateur, puis « Recentrer ». Avant
  l’affectation : entreprise + destinataire en pointillés et radar « Recherche d’un livreur… ». Carte d’ensemble de
  l’entreprise : cadrée sur l’entreprise et les livraisons en route (livreur et cible de son étape), les destinataires
  en attente d’un livreur seulement s’il n’y a rien en route. Page publique sur ordinateur (≥ 900 px) : carte à
  gauche, feuille en panneau à droite ; sur un petit téléphone (hauteur < 700 px), feuille à 0,6 de l’écran et code
  compact : heure d’arrivée, code et montant à payer visibles sans défiler.
- **Heure d’arrivée** : le destinataire voit l’heure de livraison ; l’entreprise voit, pendant le retrait, l’arrivée
  du livreur CHEZ ELLE (durée restante de l’itinéraire vers le retrait), l’heure de livraison étant rappelée dessous.
- **Page publique en 3G** : écran de démarrage écrit dans `public/index.html` (visible avant le JavaScript), blocs
  de la page et de MapLibre préchargés dès le HTML (MapLibre seulement après le suivi lui-même sur une connexion
  très lente : `navigator.connection` 2G ou économie de données), aucun module livreur / entreprise (Socket.IO,
  localisation, appareil photo) ni zod téléchargé par la page publique.

Clé Google Maps (build Android) :

- **Expo Go** : les cartes fonctionnent sans configuration.
- **Build Android** (development build, APK, AAB) : Google Maps exige une clé « Maps SDK for Android ».
  Mettre `GOOGLE_MAPS_API_KEY=...` dans `.env` (jamais dans git) : `app.config.ts` la passe au plugin
  `react-native-maps` (`androidGoogleMapsApiKey`). Restreindre la clé au package `bf.yaar.livraison` et à
  l’empreinte SHA-1 du certificat de signature dans la console Google Cloud.
- **Coût** : la carte Android dépend du SDK Google Maps, service tiers facturable au-delà du quota gratuit. Passer à
  MapLibre Native (tuiles OpenFreeMap) est l’option pour retirer cette dépendance (nouvelle dépendance native).
- Build de production : `npx eas-cli build -p android` (la clé peut aussi être fournie comme secret EAS).
  Si l’API de test est en `http://` (non chiffré), un build de production Android la bloque : utiliser une URL `https://`.

## Système de design « Cobalt » (`docs/DESIGN.md`)

Tout le produit suit la direction **Cobalt** choisie par le fondateur : clair et vif, cartes blanches à ombre douce sur
fond `canvas`, une seule couleur signature (cobalt `#2448FF`), le soleil (`#FFC93C`) réservé aux espèces, grands
chiffres tabulaires, tout est arrondi ; pas de mode sombre. Référence complète (jetons et contrastes, échelle
typographique, composants, à faire / à ne pas faire, « changer de police ») : [`docs/DESIGN.md`](../../docs/DESIGN.md).

- **Jetons** : `palette`, `radii`, `shadows` (chaînes `boxShadow`), `spacing`, `typography` de `src/theme.ts` ; les
  anciens `colors` / `dark` / `typeScale` restent (marqués `@deprecated`) avec des valeurs Cobalt claires, pour les
  écrans pas encore redessinés.
- **Police** : Plus Jakarta Sans (500 / 600 / 700 / 800), définie dans **un seul fichier**, `src/fonts.ts`, chargée par
  `src/app/_layout.tsx` (2,5 s d'attente au plus, puis police du système ; 0,4 s sur la page publique). Tous les
  textes passent par `Text` / `TextInput` de `src/components/Text.tsx` (un test refuse ceux de 'react-native').
- **Composants** : `src/components/design/` (pictogrammes `Icon`, `RoundButton`, `Pill`, `StatusChip`,
  `PackageCard`, `CountdownRing`, surfaces, `AmountRow`, barre d'onglets flottante `FloatingTabBar`…),
  `src/components/tracking/` (feuille de suivi sur la carte, heure d'arrivée, étapes, code, montants, livreur ; sans
  react-native-svg pour la page publique) et `src/components/ui.tsx` (bouton, carte, champ, bandeau…).

## Code partagé

Les types, énumérations, schémas zod, tarifs et libellés viennent de `packages/shared` (`@yaar/shared`),
importé **depuis les sources** :

- `@yaar/shared` → `shims/yaar-shared.ts` : tout le code partagé SAUF les valeurs des schémas zod (leurs types
  restent disponibles) ; les écrans qui valident des données importent schémas et `normalizePhone` depuis
  `@yaar/shared/schemas`. Ainsi la page publique de suivi ne télécharge jamais zod, et TypeScript refuse un schéma
  importé de `@yaar/shared` comme valeur ;
- `tsconfig.json` : `paths` (`@yaar/shared`, `@yaar/shared/schemas`, et `zod` → la copie de l’application) ;
- `metro.config.js` : `watchFolders` sur `packages/shared`, mêmes alias, une seule copie de zod (celle de
  `apps/mobile/node_modules`), et ses langues réduites au français et à l’anglais (`shims/zod-locales.js`) ;
- jest : `moduleNameMapper` équivalent (dans `package.json`).

## Organisation

```
app.config.ts            configuration Expo (permissions, plugins, clé Google Maps via .env)
metro.config.js          résolution du code partagé
src/app/                 écrans (Expo Router) : login, verify, business/ (Entreprise), driver/ (Livreur),
                         suivi/[token] (page publique du destinataire, hors connexion)
src/components/map/      moteur de carte : LiveMap (natif / .web MapLibre), PickerMap + CenterPin (épingle centrale),
                         marqueurs (markerArt, MarkerViews, markerDom.web), mention des données
src/components/tracking/ écran de suivi (carte plein écran + feuille), heure d’arrivée, étapes, livreur, code, montants
src/components/          UI commune (ui.tsx), lien de suivi à partager, offre, SOS, consentement GPS...
src/state/               contextes : session (JWT en SecureStore), Socket.IO / polling, entreprise, livreur
src/hooks/               useAsync, useDeliveryQuote, usePublicTracking, useFollowCamera, useDriverLocationTracking...
src/lib/                 client API typé, logique pure testée (scène de carte, caméra, montants, partage, étapes...)
src/lib/map/             fond Cobalt (style, secours, Google, palette), chargement de MapLibre, tracés rognés, chevrons
src/__tests__/           tests d’écrans et de contextes (fixtures, API simulée)
```

## Confidentialité et règles légales appliquées dans l’application

- **GPS du livreur au premier plan uniquement** (pas de tâche de fond, permission `ACCESS_BACKGROUND_LOCATION`
  bloquée) et **seulement en ligne** : le suivi (`watchPositionAsync`) démarre quand le profil passe en ligne
  et s’arrête dès qu’il repasse hors ligne ; aucune position n’est lue ni envoyée hors ligne. Un refus
  `DRIVER_OFFLINE` de l’API arrête aussi le suivi. Indicateur permanent « En ligne : suivi GPS actif ».
- Conséquence assumée : quand Yaar passe en arrière-plan (ex. le livreur ouvre Google Maps / Waze via
  « Itinéraire »), plus aucune position n’est transmise ; le destinataire, l’entreprise et la console voient la dernière position
  connue. L’application prévient le livreur avant d’ouvrir l’itinéraire, l’indicateur passe à « suivi GPS en
  pause », et une position est envoyée immédiatement au retour au premier plan. Un suivi en arrière-plan
  (service de premier plan Android avec notification « Yaar : suivi GPS actif (en ligne) ») reste possible
  mais demande `expo-task-manager`, la permission d’arrière-plan et une validation juridique.
- Déconnexion du livreur : l’application le passe d’abord hors ligne (`PATCH /driver/availability`) et refuse
  la déconnexion pendant une course.
- Cadence d’envoi : toutes les 8 s pendant une course, toutes les 45 s au repos (ou plus tôt après 150 m).
- Position de l’entreprise : lue uniquement quand elle touche « Ma position » dans son profil (adresse de retrait).
- Le code de livraison n’est affiché qu’au destinataire, sur sa page de suivi (jamais à l’entreprise ni au livreur) ;
  le livreur doit le saisir pour valider la livraison.
- Page publique de suivi : aucune connexion ni jeton de session envoyé (client API sans session), `no-referrer` pour
  que le jeton du lien ne parte jamais vers les serveurs de tuiles ; le lien expire 24 h après la livraison.
- Le livreur ne voit les adresses, repères et téléphones que pour la course qui lui est affectée (l’offre ne montre que
  l’entreprise et des zones) ; son historique ne montre plus que les montants.
- Le jeton de session est stocké dans le stockage chiffré du téléphone (`expo-secure-store`).
- Photos (KYC, preuve) redimensionnées à 1280 px, JPEG 0,6, envoyées en base64 : 3 Mo maximum une fois décodées
  (taille encodée vérifiée avant l’envoi, message en français ; limite de 4,5 Mo des requêtes sur Vercel). Les copies
  temporaires (photo prise, image redimensionnée) sont supprimées du cache aussitôt l’image encodée : l’aperçu
  est gardé en mémoire uniquement. Le selfie KYC utilise la caméra frontale.
- Adresse : une livraison n’est pas possible tant que l’épingle n’a pas été placée (centre par défaut ou adresse de
  l’entreprise).

## Limites connues (Lot 1)

- Annulation par l’entreprise seulement avant le retrait ; ensuite, la console Yaar.
- Pas de notifications push : les offres arrivent par Socket.IO quand l’application est ouverte
  (au retour au premier plan, l’application relit `GET /driver/offers`, le profil et la course en cours).
- Paiement en espèces uniquement (mobile money prévu au Lot 2).
- Version web (`npm run export:web`, projet Vercel `apps/mobile`, https://yaar-livraison.vercel.app) : cartes
  MapLibre au lieu de `react-native-maps` (WebGL requis ; sinon « Carte indisponible » et le reste de l’écran
  fonctionne), API en mode poll (aucun socket ; rafraîchissements suspendus quand
  l’onglet est masqué, offres du livreur en ligne interrogées toutes les `pollIntervalMs`, jamais suspendues pour
  inactivité). Sur le web, la position du livreur n’est pas envoyée quand l’onglet est masqué.
