# Système de design « Cobalt » (application mobile et web)

Direction choisie par le fondateur pour tout le produit (entreprise, livreur, page publique de suivi, console) :
**clair, vif, tactile, haut de gamme** (Revolut × Bolt × Apple Plans). De grands chiffres, une seule couleur signature
utilisée avec parcimonie, des cartes blanches à ombre douce sur un fond gris-bleu très clair, tout est arrondi.
**Pas de mode sombre** : les livreurs travaillent en plein soleil, où une interface claire au texte encre se lit le
mieux.

Code : `apps/mobile/src/theme.ts` (jetons), `apps/mobile/src/fonts.ts` (police, avec `fontFiles(.web).ts`), `apps/mobile/src/components/Text.tsx`
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
| `backdrop` | `#DCE1E9` | web : fond de la page autour de la colonne « téléphone » | |

**Transparences : `alpha(couleur, opacité)`** (`theme.ts`) donne `rgba(…)` à partir d'un jeton : voile sur un fond
(`alpha(palette.ink, 0.08)` derrière un pictogramme sur soleil), filet ou pastille translucide sur la tuile cobalt
(`alpha(palette.white, 0.16)`), halo d'un point d'état (`alpha(palette.mint, 0.18)`), ombre. Jamais de `rgba(…)` écrit à
la main dans un écran. Les ombres de `shadows` en sont faites (`shadows.hairline` : filet d'ombre d'un bouton blanc sur
une carte blanche). Les cartes ont leur propre palette (`lib/map/palette.ts`, partagée avec la console) et leur
`rgba(hex, a)`.

**Règles**

- Une seule couleur signature, le cobalt. **Au plus UNE tuile héros cobalt pleine par écran** (ex. l'heure d'arrivée de
  la livraison en cours ; sur la page publique, le code de livraison). Le reste : cartes blanches sur canvas.
- Le soleil est réservé à l'argent à encaisser / à reverser. Le vert (mint) dit « livrée / réussi ». Le corail dit
  « problème ».
- Pas de dégradé (au plus un reflet à peine visible en haut de la tuile héros), pas de liseré coloré sur le côté d'une
  carte, pas d'émoji (pictogrammes dessinés : `Icon`).

### Anciens jetons et alias : supprimés

Tous les écrans sont redessinés : les jetons `colors`, `dark`, `roleColor`, `radius`, `typeScale` (theme.ts) et
`BUSINESS_ACCENT` / `ORANGE_INK` / `ORANGE_TEXT` (components/business/accent.ts) n'existent plus, comme les alias et
props sans effet : `DarkScreen`, `DarkHeader`, `DarkProgress`, les tons `green` / `amber` / `dark` de `Pill` (le ton
neutre s'appelle `neutral`, défaut), `Surface 'dark'`, les props `theme` (éléments de suivi, `SheetSurface`, `AmountRow`,
`MapIconButton`, `PackageCard`, `MapAttribution`, `LiveMap`), `surface` de `StatusChip`, `tone` (`RatingCard`,
`DisputeBox`, `StoreApprovalBanner`, `ShareFeedback`, `ShareTrackingCard`), `sheetTheme` / `mapTheme` de
`LiveTrackingLayout`, `TRACKING_PALETTES` / `TrackingTheme` / `RECIPIENT_SHEET_THEME`, `VEHICLE_EMOJI`, `TabIcon`,
`label` de `FloatingButton`, et côté carte `MapTheme`, `MAP_PALETTES`, `FALLBACK_STYLE_DARK`, `MAP_STYLE_DARK_URL`,
`DEFAULT_MAP_STYLE_DARK_URL`, `ANDROID_MAP_STYLE_DARK`, `BaseMap.setTheme`. Le compilateur refuse leur retour.

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

**Typographie française** : espace fine insécable (U+202F) avant « : ; ? ! », à l'intérieur des guillemets « » et
comme séparateur des milliers (`formatFcfa`) ; apostrophe ’ ; heures « 12:09 ». Le test
`src/__tests__/frenchTypography.test.ts` refuse une espace ordinaire à ces places dans les textes de `apps/mobile/src`
(sauf `lib/share.ts` : un SMS avec U+202F passerait en UCS-2). La police n'a pas l'espace fine insécable U+202F : le `Text` de
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
- **Fichiers** : Android / iOS, les TTF complets du paquet (`src/fontFiles.ts`, ≈ 95 ko par graisse, dans
  l'application) ; **web, des sous-ensembles WOFF2 « latins »** (`assets/fonts/PlusJakartaSans_<graisse><Nom>.latin.woff2`,
  listés par `src/fontFiles.web.ts`, que Metro choisit pour le web) : ≈ 11 ko par graisse, **44 ko pour les 4 graisses**
  au lieu de 175 ko compressés. Ils couvrent U+0000–00FF, Œ œ Ÿ, U+2000–206F (’ « » … – — espaces), €, →, −, ≈ : tout
  le texte français de l'application (et de l'API). Un caractère absent (nom dans une autre écriture) est dessiné par la
  police du système, qui suit dans chaque famille.
- **Web** : `scripts/web-postexport.mjs` écrit dans `index.html` la liste des polices chargées au démarrage, que la page
  précharge dès ses premiers octets, en parallèle du JavaScript (4 fichiers WOFF2, 44 ko).
- **Page publique de suivi** (`/suivi/…`, ouverte depuis un SMS, souvent en 3G) : le suivi d'abord. Les polices n'y
  sont pas préchargées, la mise en page racine les demande au démarrage (44 ko : elles arrivent peu après le JavaScript,
  sans retarder la carte) et les attend 0,2 s au plus (`FONT_PUBLIC_TIMEOUT_MS`) : première visite en police du système,
  remplacée à l'arrivée des polices (décalage mesuré : 0,003) ; visites suivantes en cache (`vercel.json` : fichiers
  hachés `/_expo/static/…` et `/assets/…` en cache un an, `immutable` ; `index.html` et `/map/cobalt-style.json` non).
  Connexion très lente (2G, économie de données) : aucune police téléchargée. Aucun écran ne charge de police lui-même.

### Changer de police

1. Dans `apps/mobile` : `npx expo install @expo-google-fonts/<nouvelle-police>` (sans réseau vers l'API d'Expo :
   `EXPO_OFFLINE=1 npx expo install …`), puis retirer `@expo-google-fonts/plus-jakarta-sans` du `package.json`.
2. Android / iOS : dans `src/fontFiles.ts`, les `import` des fichiers (une graisse par sous-dossier, ex.
   `@expo-google-fonts/inter/600SemiBold`), une ligne par graisse (italique facultatif).
3. Web : refaire les sous-ensembles WOFF2 dans `assets/fonts/` (fontTools : `pip install fonttools brotli`), une
   commande par graisse, puis les lister dans `src/fontFiles.web.ts` :

   ```sh
   cd apps/mobile
   for w in 400Regular 500Medium 600SemiBold 700Bold 800ExtraBold; do
     pyftsubset node_modules/@expo-google-fonts/<police>/$w/<Police>_$w.ttf \
       --unicodes="U+0000-00FF,U+0152-0153,U+0178,U+2000-206F,U+20AC,U+2192,U+2212,U+2248" \
       --layout-features+=tnum,case --flavor=woff2 \
       --output-file=assets/fonts/<Police>_$w.latin.woff2
   done
   ```

   `tnum` est indispensable (chiffres tabulaires de toutes les heures et de tous les montants). Garder
   « `_<graisse><Nom>.` » dans le nom : le script du web y lit la graisse. Un nouveau caractère dans un texte (hors de
   ces plages) : l'ajouter à `--unicodes`.
4. Dans `src/fonts.ts` : `FONT_NAME`, `FAMILY_PREFIX`, `LOADED_WEIGHTS` si les graisses changent,
   `FONT_MISSING_CHARS` (caractères que la nouvelle police n'a pas : la vider si elle a U+202F) et `GLYPH_EM` (avances
   des chiffres, de l'espace, des lettres : elles règlent `FitAmount` et la taille des heures ; à mesurer sur les
   fichiers).
5. Vérifier : `npx jest src/__tests__/fonts.test.tsx src/__tests__/textImports.test.ts` (adapter les noms de familles
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
| `Pill` | `design/Pill.tsx` | pilule 40 px (étiquette) ou bouton (44 / 56 px `lg`) : `neutral` étiquette (défaut, raised), `cobalt` action principale, `outline` secondaire (blanc, filet fin), `red` destructif, `sun` espèces, `tint` choix actif, `light` + `floating` sur la carte |
| `StatusChip` | `design/Pill.tsx` | puce d'état 28 px 13/700, en minuscules : en livraison `blue` (cobaltTint), vers vous / retrait `amber` (soleil), recherche `grey` + `dot`, livrée `green`, annulée `red` |
| `MapIconButton`, `FloatingButton`, `FloatingChip` | `design/Pill.tsx`, `tracking/LiveTrackingLayout.tsx` | disques et pastilles blancs à ombre flottante posés sur la carte |
| `RoundButton`, `CallRoundButton`, `WhatsAppRoundButton` | `design/` | disques 48 / 64 / 84 : `primary` cobalt (une action évidente), `neutral` blanc à ombre et pictogramme cobalt (contacts), `danger` rouge plein ; libellé 13/600 dessous ; `surface="cobalt"` sur la tuile héros |
| `CountdownRing` | `design/` | anneau cobalt qui se vide (rouge les 10 dernières secondes) autour de « Accepter » |
| `PackageCard` | `design/` | carte de colis blanche (24, ombre `tile`), pastille aux initiales cobaltTint, puce d'état, repère, montant en pilule soleil, contacts à côté (jamais dans) la partie qui ouvre |
| `SheetSurface`, `SurfaceScreen`, `ScreenHeader`, `ProgressTrack`, `AmountRow` | `design/Surfaces.tsx` | feuille blanche 32, écran canvas, barre de titre, barre fine (soleil pour les espèces), ligne de montant (tuile soleil pour les espèces ; montant `FitAmount`, 60 % de la ligne au plus, « FCFA » à 0,6 ; `hero` : 40 px sur toute la largeur) |
| `FitAmount`, `fitAmountSize`, `fitFontSize`, `useFitFontSize` | `design/FitAmount.tsx` (sans react-native-svg) | **un montant n'est jamais coupé ni terminé par « … »** : la plus grande taille qui tient sur une ligne (de `size` à `minSize`, 18 par défaut), puis « FCFA » à la ligne ; chiffres 800 tabulaires, « FCFA » à `unitScale` (0,5), `sign` « + » / « − », `align`, `width` connue ou mesurée (la place doit alors s'étirer : colonne, ou `flex: 1` dans une ligne). Le texte de l'élément `testID` est `formatFcfa` à l'identique. Pour un autre texte en grands chiffres (heure, KPI) : `useFitFontSize(texte, max, min)` |
| `FloatingTabBar`, `TabBarInsetProvider`, `tabIcon` | `design/TabBar.tsx` | barre d'onglets en pilule blanche flottante, onglet actif en capsule cobalt ; les mises en page gardent sa place (`useTabBarInset`) |
| `LiveTrackingLayout` | `tracking/` | carte plein écran + feuille blanche (32, poignée, ombre), pastilles blanches, « Recentrer » ; panneau à droite sur ordinateur. Options : `fadeBottom` (fondu blanc au bas du contenu, au-dessus du pied ou de la barre d'onglets : `true` = 24 px ou une hauteur ; testID `sheet-fade`), `recenterControl="always"` (disque « Recentrer » toujours visible en haut à droite, sous `topRight`, testID `recenter-button`), barre du haut : sans `topCenter`, `topLeft` est **large** (pastille alignée à gauche jusqu'au bouton de droite) ; `TOP_SIDE_WIDTH` (52) exporté. Le cadrage garde les épingles sous la barre du haut (hauteur mesurée + 56 px) |
| `ArrivalHeadline`, `StepsProgress`, `DeliveryCodeChip`, `AmountBox`, `DriverCard`, `InfoBlock` / `InfoRow`, `StateDisc` | `tracking/TrackingParts.tsx` | heure d'arrivée en très grand (800 tabulaire) + pastille « dans 12 min » (`size="hero"` : 64 px, 48 sur écran court, pastille 16/800, état 16/800 ; la phrase du livreur cède sa place sur écran court ; `widthGuess`), pilules segmentées (faite cobalt, en cours à moitié, à venir grise), code en tuile cobalt (le héros de la page publique), montant en tuile soleil (`AmountBox` : `icon` pastille à gauche, `compact` d'une ligne, 60 px, par défaut sur écran court ; montant `FitAmount`), livreur (pastille soleil aux initiales, note dessinée), blocs d'infos remplis |
| `LiveMap` (`zoomRef`) | `map/LiveMap(.web).tsx` | `const zoom = useRef<LiveMapHandle>(null)` ; `<LiveMap zoomRef={zoom} …/>` ; `zoom.current?.zoomBy(1)` / `(-1)` : zoom en douceur (web MapLibre, Google Maps, Apple Plans), compté comme un geste (la caméra cesse de suivre) |
| `Button`, `Card`, `Field`, `Chip`, `Badge`, `Banner`, `Stat`, `KeyValue`, `ProgressBar`, `Screen`… | `components/ui.tsx` | base : bouton pilule 56 px (cobalt plein, secondaire blanc à filet, tertiaire texte), carte blanche 24, champ rempli 56 px à anneau cobalt de 2 px au focus, bandeaux teintés à pictogramme (info cobalt, avertissement soleil, erreur corail, réussite mint) |
| `DarkField`, `DarkBanner`, `SectionLabel`, `ChoiceRow` | `business/DarkForm.tsx` | mêmes règles pour le parcours « Nouvelle livraison » (noms d'origine gardés) |
| `CourierIllustration`, `GalleryIcon` | `design/` | illustrations recolorées (cobalt, soleil, encre, blanc) |

## 5. Anneau de focus du clavier (web)

`public/index.html` dessine UN anneau pour toute l'application : `:where(:focus-visible)` → **2 px cobalt détachés de
2 px**, qui suivent les coins de l'élément (contraste 6,1:1 sur blanc, 5,4:1 sur canvas). `:where()` ne compte pas : un
composant qui dessine son propre anneau l'emporte (`Field` : bordure cobalt de 2 px et `outlineStyle: 'none'` ; le
contour « auto » noir de Chrome ne passe plus).

Marqueurs (`theme.ts`, attributs `data-*` du web, rien en natif) :
- `FOCUS_RING_INNER` sur l'élément focalisable dont la forme visible est un enfant, `FOCUS_SHAPE` sur cette forme :
  l'anneau entoure le disque d'un bouton rond (et non la colonne disque + libellé, qui rognait le libellé) ou la
  pastille d'un `Pressable` élargi. Déjà posés par `RoundButton`, `Pill` (bouton), `MapIconButton`,
  `TrackingRoundButton`.
- `ON_COBALT_SURFACE` sur un conteneur cobalt plein (tuile héros) : l'anneau de ses éléments devient **blanc à halo
  cobalt** (6,1:1 sur cobalt, visible aussi là où il déborde sur du blanc). `RoundButton surface="cobalt"` le pose
  lui-même (`FOCUS_RING_INNER_ON_COBALT`).

## 6. Ordinateur : espace entreprise (≥ 1024 px)

- **Coquille** : la mise en page racine donne toute la fenêtre aux adresses `/business…` dès 1024 px
  (`isWideAppPath(pathname, largeur)` de `lib/webShell.ts`, `WIDE_APP_MIN_WIDTH`) ; en dessous, colonne « téléphone » de
  440 px. La page publique a sa propre règle (`isFullWidthPath`, qui décide aussi de sa politique de polices).
- **Barre latérale** blanche de 240 px : mot-symbole « Yaar » 800 + point cobalt, liens en pilule (actif cobaltTint /
  cobaltText avec pictogramme ; « Vue d'ensemble » avec le nombre de livraisons en cours), carte de l'entreprise en bas
  (changement d'établissement s'il y en a plusieurs, sinon le profil).
- **Tableau de bord** : titre 30/800 + ligne de date en direct ; recherche en pilule (numéro ou destinataire, sans
  accents ; ⌘K / Ctrl K, Échap ; la console utilise « / ») ; « Nouvelle livraison » en pilule cobalt en haut à droite ;
  grille de tuiles espacées de 16 : carte pleine hauteur (pastille « 3 en cours | 1 en recherche », zoom « + » / « − »
  par `zoomRef`, « Recentrer »), tuiles KPI (la tuile des espèces en soleil avec la ligne des frais), LA tuile héros
  cobalt (heure géante, code, livreur et contacts, montant en soleil), listes « En cours » et « Dernières livraisons ».
- **Détail, assistant, historique, profil** : en-tête de page + tuile carte + colonne de tuiles ; tableau pour
  l'historique ; page « Établissements » pour le profil.
- Mesures : `components/business/desktop/layout.ts` (`DESKTOP_MIN_WIDTH` = 1024, `SIDEBAR_WIDTH` 240, `PAGE_PADDING`
  32, `TILE_GAP` 16).

### Compléments (largeurs intermédiaires et états)

- **1024–1250 px** : le tableau de bord s'empile dans cet ordre : indicateurs, tuile héros, listes, puis la carte (360 px).
- **Historique sous 1280 px** : colonnes compactes. « Destinataire » fait au moins 200 px, les frais passent en seconde ligne sous « Encaissé », la date est sur deux lignes.
- **« En cours »** : quand des lignes sont masquées, une dernière ligne « + N autres livraisons en cours » fait défiler la liste.
- **Tuile d'argent (Sun)** : « Encaissé pour vous aujourd’hui ». C'est le chiffre du jour : le reversement par Yaar n'est pas encore suivi, donc on ne dit jamais « à reverser ».
- **Liens** (`NavLink`, `Link asChild` d'expo-router) : l'enfant reçoit un style aplati, jamais une fonction de style. Sinon la page web devient blanche (« Failed to set an indexed property on CSSStyleDeclaration »).

## 7. À faire / à ne pas faire

**À faire**

- Une seule action évidente par écran (pilule cobalt 56 px ou disque cobalt) ; les autres en secondaire.
- Des chiffres grands et tabulaires ; le texte en minuscules (titres compris).
- Des cartes blanches sans bordure sur canvas ; dans une feuille blanche, des blocs remplis (`raised`).
- Le soleil pour les espèces, en fond avec du texte encre.
- Des libellés d'accessibilité sur tout bouton icône ; des boutons qui sont de vrais boutons (`accessibilityRole`).
- Vérifier chaque nouveau couple texte / fond (4,5:1).
- Les montants en grand avec `FitAmount` (jamais `numberOfLines={1}` sur un montant : « 12 360 F… »).
- Les transparences avec `alpha()` ; le fondu au-dessus d'un pied avec `fadeBottom`.

**À ne pas faire**

- Plus d'une tuile cobalt pleine par écran ; du cobalt partout.
- Du texte jaune ; du texte blanc sur le corail vif ; du gris clair pour un texte.
- Des dégradés, des liserés colorés sur le côté, des émojis, des titres en capitales.
- Un `fontFamily` ou un nom de police ailleurs que dans `src/fonts.ts` ; un `Text` importé de 'react-native'.
- Une carte sombre ou une feuille sombre.
- Un `rgba(…)` ou une couleur `#…` écrits dans un écran ; un `loadAsync` de police dans un écran.
