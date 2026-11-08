# Yaar Livraison : application mobile (Expo)

Yaar Livraison est un service de livraison **pour les entreprises** (comme Uber Direct / DoorDash Drive) : une
entreprise demande une livraison vers un client ou une autre entreprise ; le destinataire **n’a pas de compte** : il
reçoit un lien, suit le livreur sur une carte en direct et lui donne le code de livraison à la réception.

Une seule application React Native (Expo SDK 58, TypeScript strict, Expo Router) avec deux espaces, choisis selon le
rôle du compte après la connexion par code, et une page publique :

| Espace | Rôle API | Couleur | Fonctions |
|---|---|---|---|
| **Entreprise** | `SELLER` (profil d’entreprise = boutique validée par Yaar) | orange `#F28C1B` | onglet **Livraisons** : carte d’ensemble des livraisons en cours avec les livreurs en direct + liste ; onglet **Nouvelle** : demande en 3 étapes (destination sur une carte à épingle centrale avec bulle du quartier, adresse, repère, destinataire, « destinataire entreprise », suggestions de quartiers ; colis, véhicule avec prix du devis, qui paie la livraison, montant à encaisser ; récapitulatif → « Demander un livreur ») ; **suivi** façon Uber (carte plein écran, heure d’arrivée, étapes, livreur à appeler, destinataire, montants, « Envoyer le lien de suivi au destinataire », annulation avant le retrait ; jamais le code) ; **Historique** ; **Profil** (entreprise, adresse de retrait, bandeau de validation, compte) |
| **Livreur** | `DRIVER` | bleu `#2D6CDF` | inscription KYC (véhicule, immatriculation, photos des pièces), écran d’attente de validation, en ligne / hors ligne avec l’indicateur « En ligne : suivi GPS actif », offres avec compte à rebours de 30 s (entreprise, zones, véhicule, montants), course sur carte (itinéraire vers l’entreprise puis le destinataire, position animée, carte « Récupérer chez … · 1,2 km · 4 min »), montants à encaisser (au retrait / à la livraison), code du destinataire + photo facultative, cash détenu / plafond, gains, bouton SOS |
| **Suivi public** | aucun (lien `/suivi/<jeton>`, sans connexion) | vert `#0B7A4B` | carte plein écran, « Arrivée vers 14:32 · dans 12 min », 4 étapes (Commande confirmée → Livreur en route vers l’expéditeur → En route vers vous → Livrée), entreprise expéditrice, livreur (prénom, véhicule, plaque, note, « Appeler »), code à donner au livreur, montant à payer, adresse et repère ; états recherche, livrée (merci), annulée, lien expiré |

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
| `npm run export:web` | version web (Vercel) dans `dist/` ; MapLibre est un bloc JS séparé, chargé seulement sur les écrans avec carte |

## Cartes (suivi façon Uber / DoorDash)

Un seul moteur de carte (`src/components/map/`) sert au suivi de l’entreprise, à la page publique, à la course du
livreur, à la carte d’ensemble et au choix d’adresse :

- **Web** : MapLibre GL JS (`maplibre-gl` 5.x, construction UMD qui embarque son worker ; la 6.x, ESM seulement, charge
  son worker par `import.meta.url`, que le bundle web de Metro ne sait pas servir), chargé à la demande
  (`import('maplibre-gl')`), densité de pixels plafonnée à 2, rotation et inclinaison désactivées sauf pour le
  livreur. Style vectoriel gratuit OpenFreeMap « positron » (`https://tiles.openfreemap.org/styles/positron`, sans
  clé), remplaçable par `EXPO_PUBLIC_MAP_STYLE_URL` ; si le style échoue ou n’est pas chargé après 6 s, style de
  secours embarqué (fond clair, sans tuiles) : marqueurs et itinéraires restent affichés. Mention
  « © OpenFreeMap © OpenMapTiles © OpenStreetMap contributors » toujours visible au-dessus de la feuille.
- **Android / iOS** : `react-native-maps` ; Google Maps (Android) avec un style « argenté » discret
  (`customMapStyle`), Apple Plans `mutedStandard` (iOS) ; marqueurs en vues personnalisées.
- **Marqueurs** : entreprise (carré orange arrondi, vitrine), destinataire (épingle verte, maison, halo pulsé),
  livreur (rond blanc ombré, véhicule vu du dessus orienté selon le cap `heading` de l’API, ou calculé). Mêmes
  pictogrammes sur le web (SVG) et en natif (vues) : `markerArt.ts`.
- **Itinéraire** : `route` de l’API (`OrderDto` / `TrackingDto`) en vert `#0B7A4B` avec liseré blanc ; ligne droite en
  pointillés sans itinéraire (ou `source: "straight"`) ; la partie parcourue est rognée au point de la ligne le plus
  proche du livreur (fonctions de `packages/shared/src/map.ts`).
- **Livreur animé** entre deux positions pendant ~l’intervalle de rafraîchissement (requestAnimationFrame sur le web,
  `AnimatedRegion` en natif), tourné vers son cap.
- **Caméra** : cadre livreur + cible (entreprise tant que le colis n’est pas récupéré, puis destinataire) en tenant
  compte de la feuille du bas ; suit le livreur jusqu’au premier geste de l’utilisateur, puis « Recentrer ». Avant
  l’affectation : entreprise + destinataire en pointillés et radar « Recherche d’un livreur… ».

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

## Code partagé

Les types, énumérations, schémas zod, tarifs et libellés viennent de `packages/shared` (`@yaar/shared`),
importé **depuis les sources** :

- `tsconfig.json` : `paths` → `../../packages/shared/src/index.ts` (et `zod` → la copie de l’application) ;
- `metro.config.js` : `watchFolders` sur `packages/shared` et résolution forcée de `@yaar/shared` et `zod`
  (une seule copie de zod, celle de `apps/mobile/node_modules`, même si la racine du monorepo n’est pas installée) ;
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
src/lib/map/             style de carte (OpenFreeMap / secours / Google), chargement de MapLibre, tracés rognés
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
