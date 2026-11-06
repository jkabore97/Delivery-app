# Yaar Livraison : application mobile (Expo)

Une seule application React Native (Expo SDK 58, TypeScript strict, Expo Router) avec trois espaces,
choisis automatiquement selon le rôle du compte après la connexion par SMS :

| Espace | Rôle API | Couleur | Fonctions |
|---|---|---|---|
| **Client** | `CLIENT` | vert `#0B7A4B` | épingle sur la carte + adresse + point de repère, adresses enregistrées, boutiques et menus, panier, colis A → B, choix du véhicule avec devis, commande (espèces), suivi en temps réel du livreur, appel du livreur, code de livraison, historique, notation, signalement d’un problème |
| **Vendeur** | `SELLER` | orange `#F28C1B` | ouvrir / fermer la boutique, catalogue (ajout, modification, disponibilité, suppression), commandes entrantes (accepter avec temps de préparation ou refuser avec motif), « Prête → appeler un livreur », ventes du jour |
| **Livreur** | `DRIVER` | bleu `#2D6CDF` | inscription KYC (véhicule, immatriculation, photos des pièces), écran d’attente de validation, bascule en ligne / hors ligne avec l’indicateur « En ligne : suivi GPS actif », offres avec compte à rebours de 30 s, itinéraire dans l’application de cartes du téléphone, récupération puis livraison avec code client + photo facultative, cash détenu / plafond, gains, bouton SOS |

Un compte `CONTROLLER` ou `ADMIN` est refusé avec le message « utilisez la console web ».
Toute l’interface est en français, les montants en FCFA (`6 500 FCFA`).
Contrat d’API : [`docs/API.md`](../../docs/API.md). Maquettes : [`docs/mockups/1-apps-mobiles.png`](../../docs/mockups/1-apps-mobiles.png).

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

Comptes de démonstration (seed de l’API, code SMS `123456`) : client `72000001`, vendeur `71000001`,
livreur moto en course `73000001`, livreur vélo libre `73000003`, livreur en attente de validation `73000007`.
La liste complète est dans `docs/API.md` § 12.

## Scripts

| Commande | Rôle |
|---|---|
| `npm start` | serveur de développement Expo (Metro) |
| `npm run typecheck` | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) |
| `npm test` | tests jest (`jest-expo`) : logique, hooks, contextes (livreur, socket) et écrans critiques (offre, livraison, garde de rôle, déconnexion livreur) dans `src/__tests__/` |
| `npm run export:android` | bundle de production Android dans `dist/` (vérifie que tout compile) |

## Cartes (react-native-maps) et clé Google Maps

- **Expo Go** : les cartes fonctionnent sans configuration.
- **Build Android** (development build, APK, AAB) : Google Maps exige une clé « Maps SDK for Android ».
  Mettre `GOOGLE_MAPS_API_KEY=...` dans `.env` (jamais dans git) : `app.config.ts` la passe au plugin
  `react-native-maps` (`androidGoogleMapsApiKey`). Restreindre la clé au package `bf.yaar.livraison` et à
  l’empreinte SHA-1 du certificat de signature dans la console Google Cloud.
- **Coût** : contrairement à la console (Leaflet + OpenStreetMap, sans clé), la carte Android dépend du
  SDK Google Maps, service tiers facturable au-delà du quota gratuit. Une simple couche de tuiles OSM
  (`UrlTile`) ne supprime pas ce besoin : le SDK Google reste chargé sur Android. Passer à MapLibre
  (tuiles OSM) est l’option pour retirer cette dépendance (nouvelle dépendance native, hors Lot 1).
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
src/app/                 écrans (Expo Router) : login, verify, client/, seller/, driver/
src/components/          UI commune (ui.tsx), carte de choix d’adresse, carte de course, offre, SOS...
src/state/               contextes : session (JWT en SecureStore), Socket.IO, panier, vendeur, livreur
src/__tests__/           tests d’écrans et de contextes (fixtures, faux API / socket)
src/hooks/               useAsync, useQuote, useCountdown, useDriverLocationTracking
src/lib/                 client API typé, logique pure testée (panier, cadence GPS, KYC, formats...)
```

## Confidentialité et règles légales appliquées dans l’application

- **GPS du livreur au premier plan uniquement** (pas de tâche de fond, permission `ACCESS_BACKGROUND_LOCATION`
  bloquée) et **seulement en ligne** : le suivi (`watchPositionAsync`) démarre quand le profil passe en ligne
  et s’arrête dès qu’il repasse hors ligne ; aucune position n’est lue ni envoyée hors ligne. Un refus
  `DRIVER_OFFLINE` de l’API arrête aussi le suivi. Indicateur permanent « En ligne : suivi GPS actif ».
- Conséquence assumée : quand Yaar passe en arrière-plan (ex. le livreur ouvre Google Maps / Waze via
  « Itinéraire »), plus aucune position n’est transmise ; le client et la console voient la dernière position
  connue. L’application prévient le livreur avant d’ouvrir l’itinéraire, l’indicateur passe à « suivi GPS en
  pause », et une position est envoyée immédiatement au retour au premier plan. Un suivi en arrière-plan
  (service de premier plan Android avec notification « Yaar : suivi GPS actif (en ligne) ») reste possible
  mais demande `expo-task-manager`, la permission d’arrière-plan et une validation juridique.
- Déconnexion du livreur : l’application le passe d’abord hors ligne (`PATCH /driver/availability`) et refuse
  la déconnexion pendant une course.
- Cadence d’envoi : toutes les 8 s pendant une course, toutes les 45 s au repos (ou plus tôt après 150 m).
- Position du client : lue uniquement quand il touche « Ma position », et transmise seulement dans une commande.
- Le code de livraison n’est affiché qu’au client ; le livreur doit le saisir pour valider la livraison.
- Le livreur ne voit les adresses, repères et téléphones que pour la course qui lui est affectée ; son historique
  ne montre plus que les montants.
- Le jeton de session est stocké dans le stockage chiffré du téléphone (`expo-secure-store`).
- Photos (KYC, preuve) redimensionnées à 1280 px, JPEG 0,6, envoyées en base64 (5 Mo max). Les copies
  temporaires (photo prise, image redimensionnée) sont supprimées du cache aussitôt l’image encodée : l’aperçu
  est gardé en mémoire uniquement. Le selfie KYC utilise la caméra frontale.
- Adresse : une commande n’est pas possible tant que l’épingle est restée sur le centre par défaut de la carte.

## Limites connues (Lot 1)

- Pas de notifications push : les offres arrivent par Socket.IO quand l’application est ouverte
  (au retour au premier plan, l’application relit `GET /driver/offers`, le profil et la course en cours).
- Paiement en espèces uniquement (mobile money prévu au Lot 2).
- L’export web n’est pas visé (`react-native-maps` ne fonctionne pas sur le web) : seules Android et iOS sont prises en charge.
