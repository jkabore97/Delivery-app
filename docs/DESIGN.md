# Système de design « Cobalt » (application mobile et web)

Direction choisie par le fondateur pour tout le produit (entreprise, livreur, page publique de suivi, console) :
**clair, vif, tactile, haut de gamme** (Revolut × Bolt × Apple Plans). De grands chiffres, une seule couleur signature
utilisée avec parcimonie, des cartes blanches à ombre douce sur un fond gris-bleu très clair, tout est arrondi.
**Pas de mode sombre** : les livreurs travaillent en plein soleil, où une interface claire au texte encre se lit le
mieux.

Code : `apps/mobile/src/theme.ts` (jetons), `apps/mobile/src/fonts.ts` (police), `apps/mobile/src/components/Text.tsx`
(textes), `apps/mobile/src/components/design/` (composants), `apps/mobile/src/components/tracking/` (suivi),
`apps/mobile/src/components/ui.tsx` (composants de base). Planche de référence : `boards/cobalt.png` du dossier de
conception.

## 1. Couleurs (`palette` de `theme.ts`)

Contrastes WCAG 2 mesurés (texte normal : 4,5:1 au moins ; c'est vérifié par `src/__tests__/designSystem.test.tsx`).

| Jeton | Valeur | Rôle | Contrastes |
|---|---|---|---|
| `canvas` | `#EEF1F5` | fond de l'application, derrière les cartes | |
| `card` / `white` | `#FFFFFF` | cartes, feuilles, barre d'onglets, pastilles sur la carte | |
| `raised` | `#F4F6F9` | zone remplie dans une carte blanche : champs, boutons secondaires, cartes d'une feuille | |
| `raisedHigh` | `#E9EDF3` | `raised` appuyé, pistes des barres de progression | |
| `line` | `#E6E9EF` | filets (rares : les cartes n'ont pas de bordure) | |
| `handle` | `#D5DBE5` | poignée des feuilles (40 × 5) | |
| `ink` | `#0C1222` | texte principal | 18,7:1 sur blanc, 16,5:1 sur canvas |
| `inkMuted` | `#5B6475` | texte secondaire, indications des champs | 5,96 blanc · 5,26 canvas · 5,50 raised · 5,07 raisedHigh |
| `cobalt` | `#2448FF` | LA couleur : action principale, itinéraire, onglet actif, liens, tuile héros | 6,09:1 en texte sur blanc |
| `onCobalt` | `#FFFFFF` | texte et pictogrammes sur cobalt | 6,09:1 |
| `onCobalt2` | `#E6EBFF` | texte secondaire sur cobalt | 5,13:1 |
| `cobaltTint` | `#E9EDFF` | fond sélectionné / actif, puces | |
| `cobaltText` | `#1F3BD6` | petit texte sur cobaltTint | 6,79:1 |
| `sun` | `#FFC93C` | ESPÈCES seulement (à encaisser, à reverser) et mises en avant ; toujours un FOND, texte encre | encre dessus 12,2:1 |
| `onSun2` | `#4B3B08` | texte secondaire sur sun | 7,1:1 |
| `sunTint` | `#FFF3CC` | fond doux (avertissement, espèces) | |
| `sunText` | `#7A4D00` | texte sur sunTint | 6,56:1 |
| `amberText` | `#8A5A00` | montant en espèces écrit en texte (jamais de texte jaune) | 5,93 blanc · 5,47 raised · 5,35 sunTint |
| `mint` | `#16C47F` | livrée / réussite, en fond ou pictogramme | encre dessus 8,2:1 |
| `mintTint` | `#D7F5E8` | puces de réussite | |
| `mintText` | `#077A4B` | texte de réussite | 4,65 mintTint · 5,39 blanc |
| `coral` | `#FF5A4E` | alertes en point ou pictogramme seulement | blanc dessus 3,08:1 : grand texte seulement |
| `coralFill` | `#D92D20` | boutons destructifs (Refuser, Annuler la livraison, SOS), texte blanc | 4,83:1 |
| `coralTint` | `#FFE4E1` | bandeaux d'erreur | |
| `coralText` | `#B42318` | texte d'erreur | 5,46 coralTint · 6,57 blanc · 6,07 raised |
| `overlay` | `rgba(12,18,34,.45)` | voile derrière une fenêtre | |

**Règles**

- Une seule couleur signature, le cobalt. **Au plus UNE tuile héros cobalt pleine par écran** (ex. l'heure d'arrivée de
  la livraison en cours ; sur la page publique, le code de livraison). Le reste : cartes blanches sur canvas.
- Le soleil est réservé à l'argent à encaisser / à reverser. Le vert (mint) dit « livrée / réussi ». Le corail dit
  « problème ».
- Pas de dégradé (au plus un reflet à peine visible en haut de la tuile héros), pas de liseré coloré sur le côté d'une
  carte, pas d'émoji (pictogrammes dessinés : `Icon`).

### Anciens jetons (écrans pas encore redessinés)

`colors`, `dark`, `radius`, `typeScale` et `roleColor` restent exportés, **marqués `@deprecated`**, avec des valeurs
Cobalt claires : les écrans pas encore redessinés forment déjà une application claire et lisible. Chaque couple
texte / fond de ces jetons a été vérifié (4,5:1 au moins, test `designSystem.test.tsx`).

| Ancien jeton | Devient | Remarque |
|---|---|---|
| `dark.background` | `canvas` | écrans pleins |
| `dark.surface` | `card` (blanc) | feuilles |
| `dark.raised` / `dark.raisedHigh` | `raised` / `raisedHigh` | |
| `dark.border` | `line` | |
| `dark.text` | `ink` | |
| `dark.textMuted`, `dark.textFaint` | `inkMuted` | 5,07:1 au moins sur tous les fonds clairs |
| `dark.green` | `cobalt` | action, gain ; texte 5,23:1 au moins |
| `dark.greenInk` | blanc | texte sur l'action |
| `dark.greenSoft` | `cobaltTint` | |
| `dark.red` | `coralText` `#B42318` | `#D92D20` n'aurait que 4,01:1 sur coralTint |
| `dark.redFill` | `coralFill` | |
| `dark.redSoft` | `coralTint` | |
| `dark.amber` | `amberText` `#8A5A00` (texte) | un FOND d'espèces s'écrit `palette.sun` (`DarkProgress` le fait seul) |
| `dark.amberSoft` | `sunTint` | |
| `dark.overlay` / `dark.chip` | voile encre / blanc | |
| `colors.green`, `colors.orange`, `colors.blue` | `cobalt` | accents des espaces |
| `colors.greenLight`, `colors.orangeLight`, `colors.blueLight` | `cobaltTint` | |
| `colors.red` / `colors.redLight` | `coralText` / `coralTint` | |
| `colors.text` / `textMuted` / `border` / `background` | `ink` / `inkMuted` / `line` / `canvas` | |
| `roleColor.*` | `cobalt` | un seul accent pour tous |
| `radius.sm` / `md` / `lg` | 12 / 16 / 24 | |
| `typeScale.*` | valeurs Cobalt (800 au plus) | `typeScale.hero` = `typography.display` |
| `BUSINESS_ACCENT`, `ORANGE_INK`, `ORANGE_TEXT` (`components/business/accent.ts`) | cobalt, blanc, cobalt | |

## 2. Forme, profondeur, espacement

- **Rayons** (`radii`) : cartes et tuiles 24 (`card`), tuile héros et grandes cartes de feuille 28 (`hero`), feuilles du
  bas 32 en haut (`sheet`, `SHEET_RADIUS`), champs de 56 px et bandeaux 16 (`input`, `banner`), boutons, pastilles,
  puces et barre d'onglets en pilule (`pill`).
- **Ombres** (`shadows`, chaînes `boxShadow` : dessinées par React Native sur iOS, Android 9+ et le web ;
  `elevation` à la place sur Android 8 et moins, jamais les deux) :
  - `tile` : `0 1px 2px rgba(12,18,34,.04), 0 12px 32px rgba(12,18,34,.06)` (cartes) ;
  - `float` : `0 1px 2px rgba(12,18,34,.06), 0 6px 16px rgba(12,18,34,.10)` (pastilles et boutons sur la carte) ;
  - `sheet` : `0 -8px 32px rgba(12,18,34,.10)` (feuille sur la carte) ;
  - `cobalt`, `hero`, `sun` : halo coloré sous un bouton cobalt, la tuile héros, une tuile soleil.
- **Espacement** (`spacing`) : multiples de 4 et 8. Marge intérieure d'une carte 16–20 (téléphone), 20–24 (ordinateur) ;
  12 entre deux cartes (téléphone), 16 (ordinateur).
- **Cibles tactiles** : 48 px au moins, 56 pour les actions principales (`MIN_TOUCH`, `lib/touchTarget.ts`).

## 3. Typographie

**Plus Jakarta Sans**, graisses 500 / 600 / 700 / 800 (900 est dessiné en 800). Un texte sans `fontWeight` est en 500
(texte courant Cobalt). **Chiffres tabulaires** (`fontVariant: ['tabular-nums']`, ou `tabular` de `theme.ts`) pour
toute heure, montant, nombre, plaque et code : la police a des chiffres proportionnels par défaut.

Échelle `typography` (téléphone) :

| Style | Taille / graisse | Usage |
|---|---|---|
| `hero` | 64 / 800, interlettrage −2,4, tabulaire | heure d'arrivée de la tuile héros (« 12:09 ») |
| `display` | 30 / 800, −0,9 | titre d'écran (« Le Verdoyant ») |
| `title` | 20 / 800, −0,3 | titre de section (« En cours ») |
| `subtitle` | 16 / 700 | nom sur une carte |
| `body` | 15 / 500 | texte courant |
| `label` | 13 / 600 | libellés |
| `caption` | 12 / 600 | petites lignes |
| `kicker` | 12 / 700 capitales +0,6 | sur-titre, avec parcimonie (Cobalt préfère les minuscules) |
| `amount` | 28 / 800 tabulaire | montant mis en avant |
| `kpi` | 36 / 800 tabulaire | chiffres d'une tuile KPI |

Ordinateur : même échelle, héros 72–76, display 32.

**Typographie française** : espace insécable avant « : ? ! » et comme séparateur des milliers (`formatFcfa`) ;
guillemets « » ; apostrophe ’ ; heures « 12:09 ». La police n'a pas l'espace fine insécable U+202F : le `Text` de
l'application la dessine en espace insécable U+00A0 (`FONT_MISSING_CHARS` de `fonts.ts`), les données gardent U+202F.
Elle n'a pas « ⌘ » (pictogramme `command`) ; « ★ » et « ≈ » existent mais s'écrivent avec les pictogrammes `star`,
`approx` dans les grands textes.

### Comment la police est appliquée

- `src/fonts.ts` est **le seul fichier qui connaît la police** : table graisse → fichier, graisses chargées
  (`LOADED_WEIGHTS` = 500, 600, 700, 800 ; 400 a un fichier mais n'est pas chargé, aucun écran ne le demande),
  liste des polices à charger (`FONT_ASSETS`), `fontFor(graisse, italique)`, `typeface(graisse)` (style à ajouter à
  un composant tiers, ex. `headerTitleStyle` des en-têtes de navigation), `useAppFonts()`.
- **Tous les textes passent par `Text` / `TextInput` de `src/components/Text.tsx`** (importer
  `import { Text } from '…/components/Text'`, jamais depuis 'react-native' : le test `textImports.test.ts` le
  refuse, sauf dans les dossiers de la carte). L'enveloppe aplatit le style, lit la graisse et l'italique, ajoute la
  famille du fichier de cette graisse (`PlusJakartaSans-800`) sans gras synthétique (Android / iOS : `fontWeight`
  remis à `normal` ; web : chaque @font-face déclare sa vraie graisse, avec la police du système en repli). Un `Text`
  imbriqué sans graisse propre hérite de son parent. Aucun `fontFamily` ailleurs (même test).
- **Chargement** (`src/app/_layout.tsx`) : l'écran de démarrage reste affiché (web : celui du HTML,
  `public/index.html`) jusqu'au chargement, **2,5 s au plus** ; erreur ou délai : police du système (Android / iOS :
  décision figée pour la session ; web : le navigateur substitue la police quand elle arrive, `font-display: swap`).
- **Web** : `scripts/web-postexport.mjs` écrit dans `index.html` la liste des polices chargées au démarrage, que la page
  précharge dès ses premiers octets, en parallèle du JavaScript (4 fichiers, 370 ko, ≈ 172 ko compressés). Page
  publique de suivi sur une connexion très lente (2G, économie de données) : aucune police téléchargée, police du
  système (le suivi d'abord).

### Changer de police

1. Dans `apps/mobile` : `npx expo install @expo-google-fonts/<nouvelle-police>` (sans réseau vers l'API d'Expo :
   `EXPO_OFFLINE=1 npx expo install …`), puis retirer `@expo-google-fonts/plus-jakarta-sans` du `package.json`.
2. Dans `src/fonts.ts`, et nulle part ailleurs : les `import` des fichiers (une graisse par sous-dossier, ex.
   `@expo-google-fonts/inter/600SemiBold`), `FONT_NAME`, `FAMILY_PREFIX`, `FONT_FILES` (une ligne par graisse,
   italique facultatif), `LOADED_WEIGHTS` si les graisses changent, et `FONT_MISSING_CHARS` (caractères que la
   nouvelle police n'a pas : la vider si elle a U+202F).
3. Vérifier : `npx jest src/__tests__/fonts.test.tsx src/__tests__/textImports.test.ts` (adapter les noms de familles
   attendus), `npm run export:web` (le message « N police(s) préchargée(s) » doit lister les graisses), puis regarder
   les écrans : une autre police a d'autres proportions (titres longs, chiffres tabulaires `tnum`, hauteur de ligne).

Les paquets `@expo-google-fonts/*` nomment leurs fichiers « `<Famille>_<graisse><Nom>.ttf` » : le script du web y lit
la graisse. Une police d'une autre source doit garder ce motif de nom (ou adapter `web-postexport.mjs`).

## 4. Composants

| Composant | Où | Quand |
|---|---|---|
| `Text`, `TextInput` | `components/Text.tsx` | tout texte, tout champ |
| `Icon` (+ `ICON_PARTS`) | `design/Icon.tsx`, `design/iconPaths.ts` | pictogrammes dessinés, grille 24, trait 2,2 arrondi : 50 noms (dont `search`, `bell`, `settings`, `chart`, `grid`, `eye`, `shield`, `approx`, `command`, chevrons, `star` / `starOutline`, `moto` / `bike` / `car`, `logout`) |
| `TrackingIcon` | `tracking/TrackingIcon(.web).tsx` | mêmes tracés sans react-native-svg sur le web : à utiliser dans tout ce que charge la page publique (`ui.tsx`, `tracking/*`) |
| `Pill` | `design/Pill.tsx` | pilule 40 px (étiquette) ou bouton (44 / 56 px `lg`) : `cobalt` action principale, `outline` secondaire (blanc, filet fin), `red` destructif, `sun` espèces, `tint` choix actif, `light` + `floating` sur la carte |
| `StatusChip` | `design/Pill.tsx` | puce d'état 28 px 13/700, en minuscules : en livraison `blue` (cobaltTint), vers vous / retrait `amber` (soleil), recherche `grey` + `dot`, livrée `green`, annulée `red` |
| `MapIconButton`, `FloatingButton`, `FloatingChip` | `design/Pill.tsx`, `tracking/LiveTrackingLayout.tsx` | disques et pastilles blancs à ombre flottante posés sur la carte |
| `RoundButton`, `CallRoundButton`, `WhatsAppRoundButton` | `design/` | disques 48 / 64 / 84 : `primary` cobalt (une action évidente), `neutral` blanc à ombre et pictogramme cobalt (contacts), `danger` rouge plein ; libellé 13/600 dessous ; `surface="cobalt"` sur la tuile héros |
| `CountdownRing` | `design/` | anneau cobalt qui se vide (rouge les 10 dernières secondes) autour de « Accepter » |
| `PackageCard` | `design/` | carte de colis blanche (24, ombre `tile`), pastille aux initiales cobaltTint, puce d'état, repère, montant en pilule soleil, contacts à côté (jamais dans) la partie qui ouvre |
| `SheetSurface`, `SurfaceScreen`, `ScreenHeader`, `ProgressTrack`, `AmountRow` | `design/Surfaces.tsx` | feuille blanche 32, écran canvas, barre de titre, barre fine (soleil pour les espèces), ligne de montant (tuile soleil pour les espèces) |
| `FloatingTabBar`, `TabBarInsetProvider`, `tabIcon` | `design/TabBar.tsx` | barre d'onglets en pilule blanche flottante, onglet actif en capsule cobalt ; les mises en page gardent sa place (`useTabBarInset`) |
| `LiveTrackingLayout` | `tracking/` | carte plein écran + feuille blanche (32, poignée, ombre), pastilles blanches, « Recentrer » ; panneau à droite sur ordinateur |
| `ArrivalHeadline`, `StepsProgress`, `DeliveryCodeChip`, `AmountBox`, `DriverCard`, `InfoBlock` / `InfoRow`, `StateDisc` | `tracking/TrackingParts.tsx` | heure d'arrivée en très grand (800 tabulaire) + pastille « dans 12 min », pilules segmentées (faite cobalt, en cours à moitié, à venir grise), code en tuile cobalt (le héros de la page publique), montant en tuile soleil, livreur (pastille soleil aux initiales, note dessinée), blocs d'infos remplis |
| `Button`, `Card`, `Field`, `Chip`, `Badge`, `Banner`, `Stat`, `KeyValue`, `ProgressBar`, `Screen`… | `components/ui.tsx` | base : bouton pilule 56 px (cobalt plein, secondaire blanc à filet, tertiaire texte), carte blanche 24, champ rempli 56 px à anneau cobalt de 2 px au focus, bandeaux teintés à pictogramme (info cobalt, avertissement soleil, erreur corail, réussite mint) |
| `DarkField`, `DarkBanner`, `SectionLabel`, `ChoiceRow` | `business/DarkForm.tsx` | mêmes règles pour le parcours « Nouvelle livraison » (noms d'origine gardés) |
| `CourierIllustration`, `GalleryIcon` | `design/` | illustrations recolorées (cobalt, soleil, encre, blanc) |

## 5. À faire / à ne pas faire

**À faire**

- Une seule action évidente par écran (pilule cobalt 56 px ou disque cobalt) ; les autres en secondaire.
- Des chiffres grands et tabulaires ; le texte en minuscules (titres compris).
- Des cartes blanches sans bordure sur canvas ; dans une feuille blanche, des blocs remplis (`raised`).
- Le soleil pour les espèces, en fond avec du texte encre.
- Des libellés d'accessibilité sur tout bouton icône ; des boutons qui sont de vrais boutons (`accessibilityRole`).
- Vérifier chaque nouveau couple texte / fond (4,5:1).

**À ne pas faire**

- Plus d'une tuile cobalt pleine par écran ; du cobalt partout.
- Du texte jaune ; du texte blanc sur le corail vif ; du gris clair pour un texte.
- Des dégradés, des liserés colorés sur le côté, des émojis, des titres en capitales.
- Un `fontFamily` ou un nom de police ailleurs que dans `src/fonts.ts` ; un `Text` importé de 'react-native'.
- Une carte sombre ou une feuille sombre (les props `sheetTheme`, `theme`, `tone="dark"` sont obsolètes).
