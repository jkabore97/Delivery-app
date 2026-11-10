import { useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '../Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFollowCamera } from '../../hooks/useFollowCamera';
import { trackingPadding } from '../../lib/mapCamera';
import { MAP_PALETTE } from '../../lib/map/style';
import { alpha, palette, radii, SHEET_RADIUS, shadows, spacing } from '../../theme';
import { useTabBarInset } from '../design/tabBarInset';
import { LiveMap } from '../map/LiveMap';
import type { MapPoint, SceneLine, SceneMarker, SceneZone } from '../map/types';
import { TrackingIcon, type IconName } from './TrackingIcon';

/** Au-delà de cette largeur (ordinateur, tablette en paysage), la feuille passe à droite de la carte. */
export const WIDE_LAYOUT_MIN_WIDTH = 900;
const SIDE_SHEET_WIDTH = 420;

/**
 * Écran de suivi façon Uber / DoorDash, au dessin Cobalt : carte plein écran, pastilles et boutons blancs flottants en
 * haut, feuille blanche en bas (coins de 32 px, ombre de feuille, poignée 40 × 5, repliable en touchant la poignée),
 * pastille blanche « Recentrer » dès que l'utilisateur déplace la carte. La caméra cadre ce qui reste visible au-dessus
 * de la feuille (marges : feuille + 90 px en bas, 60 px au moins sur les côtés). Sur un grand écran (≥ 900 px), la
 * carte occupe la gauche et la feuille devient un panneau blanc à droite. Sous des onglets, la feuille garde la place de
 * la barre d'onglets flottante (son contenu n'est jamais dessous).
 *
 * Options (toutes facultatives) : `zones` (cercles approximatifs), `aboveSheet` (élément centré posé sur la carte juste au-dessus de la feuille, ex. grand
 * bouton rond ; la caméra le garde dégagé), `insetBottom={false}` (écran au-dessus d'une barre d'onglets : pas de
 * marge de zone sûre sous la feuille), `mapVisible={false}` (carte démontée, ex. écran masqué : une seule carte
 * WebGL à la fois), `sheetHeader` (bloc fixé en haut de la feuille, au-dessus du contenu qui défile : titre et
 * action principale d'une liste), `sheetMaxRatio` (hauteur maximale de la feuille repliée, 0,56 de l'écran par défaut :
 * plus basse pour laisser plus de carte à une vue d'ensemble), `fitBottomMargin` (marge du cadrage au-dessus de la
 * feuille, 90 px par défaut), `fadeBottom` (fondu blanc au bas du contenu qui défile, au-dessus du pied `footer` ou
 * de la barre d'onglets : rien n'y paraît coupé net ; `true` = 24 px, ou une hauteur ; la place du fondu est ajoutée
 * sous le contenu), `recenterControl` ('auto' par défaut : pastille « Recentrer » dès que l'utilisateur déplace la
 * carte ; 'always' : disque blanc « Recentrer » toujours visible en haut à droite, sous `topRight`).
 *
 * Barre du haut : `topLeft` / `topCenter` / `topRight`. Avec `topCenter`, les deux côtés ont la même largeur (52 px)
 * pour que le milieu reste centré ; sans bouton à gauche ni à droite, `topCenter` dispose de toute la largeur. SANS
 * `topCenter`, `topLeft` est large : il prend toute la place jusqu'au bouton de droite (ex. pastille « 3 en cours »
 * alignée à gauche). La caméra garde les épingles sous la barre du haut (hauteur mesurée). La poignée de la feuille se
 * touche sur 28 px de haut (32 sur le web) sans changer la place du contenu.
 */
export function LiveTrackingLayout({
  markers,
  lines,
  zones,
  fitPoints,
  stageKey,
  animationMs,
  allowRotate,
  topLeft,
  topCenter,
  topRight,
  children,
  sheetHeader,
  footer,
  aboveSheet,
  allowWide = false,
  insetBottom = true,
  mapVisible = true,
  sheetMaxRatio = 0.56,
  fitBottomMargin,
  fadeBottom = false,
  recenterControl = 'auto',
  testID,
}: {
  markers: SceneMarker[];
  lines: SceneLine[];
  /** Zones approximatives (cercles) dessinées sous les tracés. */
  zones?: SceneZone[];
  fitPoints: MapPoint[];
  /** Change à chaque nouvelle étape : recadrage et reprise du suivi. */
  stageKey: string;
  animationMs: number;
  allowRotate?: boolean;
  topLeft?: ReactNode;
  topCenter?: ReactNode;
  topRight?: ReactNode;
  children: ReactNode;
  /** Bloc fixé en haut de la feuille, au-dessus du contenu qui défile (titre, action principale). */
  sheetHeader?: ReactNode;
  /** Bloc fixé en bas de la feuille (bouton d'action). */
  footer?: ReactNode;
  /** Élément centré posé sur la carte, juste au-dessus de la feuille (ex. grand bouton rond « Passer en ligne »). */
  aboveSheet?: ReactNode;
  /** Page affichée sur toute la largeur de la fenêtre (page publique) : panneau latéral sur grand écran. */
  allowWide?: boolean;
  /** false : pas de marge de zone sûre sous la feuille (l'écran est au-dessus d'une barre d'onglets). */
  insetBottom?: boolean;
  /** false : carte démontée (fond uni à la place), le reste de l'écran reste affiché. */
  mapVisible?: boolean;
  /** Hauteur maximale de la feuille repliée (part de l'écran, 0,56 par défaut) ; dépliée : 0,86. */
  sheetMaxRatio?: number;
  /**
   * Marge du cadrage au-dessus de la feuille (90 px par défaut, voir `trackingPadding`) : plus petite pour une carte
   * courte au-dessus d'une feuille haute (vue d'ensemble), où les épingles ont besoin de toute la place.
   */
  fitBottomMargin?: number;
  /** Fondu blanc au bas du contenu qui défile (au-dessus du pied fixé) : true = 24 px, ou sa hauteur en px. */
  fadeBottom?: boolean | number;
  /** « Recentrer » : 'auto' (pastille après un geste sur la carte) ou 'always' (disque toujours visible en haut à droite). */
  recenterControl?: 'auto' | 'always';
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const { height, width: windowWidth } = useWindowDimensions();
  const [width, setWidth] = useState(windowWidth);
  const [expanded, setExpanded] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(Math.round(height * 0.45));
  const [aboveHeight, setAboveHeight] = useState(0);
  const [topBarHeight, setTopBarHeight] = useState(0);
  const camera = useFollowCamera(stageKey, fitPoints.length);
  const maxSheet = Math.round(height * (expanded ? 0.86 : sheetMaxRatio));
  const wide = allowWide && width >= WIDE_LAYOUT_MIN_WIDTH;
  const mapWidth = wide ? width - SIDE_SHEET_WIDTH : width;
  const above = aboveSheet && !wide ? aboveHeight + ABOVE_SHEET_GAP : 0;
  const basePadding = trackingPadding(sheetHeight + above, insets.top, mapWidth);
  // Haut du cadrage : sous la barre du haut (pastilles, boutons : hauteur mesurée), plus la hauteur d'une épingle
  // (posée par sa pointe, son corps monte de ≈ 50 px) : une épingle en haut du cadre n'est jamais cachée.
  const topPad = Math.max(basePadding.top, insets.top + spacing.sm + topBarHeight + PIN_CLEARANCE);
  const padding = wide
    ? { top: Math.max(insets.top + 104, topPad), right: 80, bottom: 80, left: 80 }
    : fitBottomMargin === undefined
      ? { ...basePadding, top: topPad }
      : { ...basePadding, top: topPad, bottom: sheetHeight + above + fitBottomMargin };
  const covered = wide ? 0 : sheetHeight;
  // Sous la barre d'onglets flottante : la feuille va jusqu'en bas de l'écran (la pilule flotte sur elle), son contenu
  // s'arrête au-dessus de la barre.
  const tabInset = useTabBarInset();
  const bottomPad = tabInset > 0 ? tabInset : insetBottom ? Math.max(insets.bottom, spacing.sm) : spacing.sm;
  const recenterAlways = recenterControl === 'always' && mapVisible;
  const hasRight = !!topRight || recenterAlways;
  // Sans bouton à gauche ni à droite, la pastille du milieu dispose de toute la largeur (même centre). Sans pastille
  // du milieu, la place de gauche est large (jusqu'au bouton de droite).
  const sideWidth = topLeft || hasRight ? TOP_SIDE_WIDTH : 0;
  const wideLeft = !topCenter && !!topLeft;
  const fade = fadeBottom === true ? SHEET_FADE : typeof fadeBottom === 'number' && fadeBottom > 0 ? fadeBottom : 0;
  const recenterDisc = recenterAlways ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Recentrer la carte"
      onPress={camera.recenter}
      style={({ pressed }) => [styles.recenterDisc, shadows.float, pressed && styles.pressed]}
      testID="recenter-button"
    >
      <TrackingIcon name="recenter" size={22} color={palette.cobalt} strokeWidth={2.3} />
    </Pressable>
  ) : null;

  return (
    <View
      style={[styles.root, wide && styles.rootWide]}
      testID={testID}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w > 0 && w !== width) setWidth(w);
      }}
    >
      <View style={wide ? styles.mapWide : StyleSheet.absoluteFill}>
        {mapVisible ? (
          <LiveMap
            style={StyleSheet.absoluteFill}
            markers={markers}
            lines={lines}
            fitPoints={fitPoints}
            follow={camera.follow}
            recenterKey={camera.recenterKey}
            onUserGesture={camera.onUserGesture}
            padding={padding}
            bottomInset={covered}
            animationMs={animationMs}
            allowRotate={allowRotate}
            {...(zones ? { zones } : {})}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: MAP_PALETTE.background }]} />
        )}
      </View>
      <View
        style={[styles.topBar, { top: insets.top + spacing.sm }, wide && { right: SIDE_SHEET_WIDTH + spacing.md }]}
        pointerEvents="box-none"
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          if (h !== topBarHeight) setTopBarHeight(h);
        }}
      >
        {wideLeft ? (
          <View style={styles.topLeftWide} pointerEvents="box-none">
            {topLeft}
          </View>
        ) : (
          <>
            <View style={{ width: sideWidth }} pointerEvents="box-none">
              {topLeft}
            </View>
            <View style={styles.topMiddle} pointerEvents="box-none">
              {topCenter}
            </View>
          </>
        )}
        <View style={[styles.topRight, { width: sideWidth }]} pointerEvents="box-none">
          {topRight}
          {recenterDisc}
        </View>
      </View>
      {camera.showRecenter && mapVisible && !recenterAlways ? (
        <Pressable
          accessibilityRole="button"
          onPress={camera.recenter}
          style={({ pressed }) => [styles.recenter, shadows.float, { bottom: covered + 26 }, wide && { right: SIDE_SHEET_WIDTH + spacing.md }, pressed && styles.pressed]}
          testID="recenter-button"
        >
          <TrackingIcon name="recenter" size={20} color={palette.cobalt} strokeWidth={2.4} />
          <Text style={styles.recenterText}>Recentrer</Text>
        </Pressable>
      ) : null}
      {aboveSheet && !wide ? (
        <View
          style={[styles.aboveSheet, { bottom: covered + ABOVE_SHEET_GAP }]}
          pointerEvents="box-none"
          onLayout={(e) => setAboveHeight(Math.round(e.nativeEvent.layout.height))}
        >
          {aboveSheet}
        </View>
      ) : null}
      <View
        style={
          wide
            ? [styles.sideSheet, { paddingTop: insets.top + spacing.md, paddingBottom: bottomPad }]
            : [styles.sheet, shadows.sheet, { maxHeight: maxSheet, paddingBottom: bottomPad }]
        }
        onLayout={(e) => {
          if (!wide) setSheetHeight(Math.round(e.nativeEvent.layout.height));
        }}
        testID="tracking-sheet"
      >
        {wide ? null : (
          <>
            {/*
              Poignée : sa place dans la feuille ne change pas (HANDLE_SPACE), mais la zone à toucher, posée par-dessus
              le haut de la feuille (zIndex), est plus haute (HANDLE_TOUCH, et 4 px au-dessus du bord sur le web).
            */}
            <View style={styles.handleSpace} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={expanded ? 'Réduire le détail' : 'Afficher tout le détail'}
              onPress={() => setExpanded((v) => !v)}
              style={[styles.handleZone, Platform.OS === 'web' && styles.handleZoneWeb]}
              testID="sheet-handle"
            >
              <View style={styles.handle} />
            </Pressable>
          </>
        )}
        {sheetHeader ? <View style={styles.sheetHeader}>{sheetHeader}</View> : null}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, fade ? { paddingBottom: spacing.md + fade - spacing.sm } : null]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
        {footer || fade ? (
          <View style={footer ? styles.footer : styles.footerEmpty}>
            {fade ? <View pointerEvents="none" style={[styles.fade, { top: -fade, height: fade }]} testID="sheet-fade" /> : null}
            {footer}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Bouton rond flottant (retour, fermer) : disque blanc de 44 px à ombre flottante, pictogramme encre. */
export function FloatingButton({ icon, onPress, accessibilityLabel }: { icon: IconName; onPress: () => void; accessibilityLabel: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.fab, shadows.float, pressed && styles.pressed]}
    >
      <TrackingIcon name={icon} size={22} color={palette.ink} strokeWidth={2.3} />
    </Pressable>
  );
}

/** Pastille flottante (marque, numéro de course) : pilule blanche à ombre flottante, texte 14/700. */
export function FloatingChip({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <View style={[styles.chip, shadows.float]} testID={testID}>
      {typeof children === 'string' ? <Text style={styles.chipText}>{children}</Text> : children}
    </View>
  );
}

/** Écart entre le haut de la feuille et l'élément `aboveSheet` (la mention des données de la carte reste visible dessous). */
const ABOVE_SHEET_GAP = 30;
/** Largeur des emplacements des boutons flottants à gauche et à droite (quand il y en a). */
export const TOP_SIDE_WIDTH = 52;
/** Hauteur d'une épingle au-dessus de sa pointe (+ marge) : place gardée sous la barre du haut par le cadrage. */
const PIN_CLEARANCE = 56;
/** Hauteur par défaut du fondu au bas de la feuille (`fadeBottom`). */
export const SHEET_FADE = 24;
/** Place de la poignée en haut de la feuille (8 + 5 + 4 px). */
const HANDLE_SPACE = 17;
/** Hauteur de la zone à toucher de la poignée (déborde de 11 px sur le haut du contenu, qui n'y est jamais actif). */
const HANDLE_TOUCH = 28;
/** Web : la zone commence 4 px au-dessus du bord de la feuille (juste sous la mention des données de la carte). */
const HANDLE_ABOVE_WEB = 4;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.canvas },
  rootWide: { flexDirection: 'row' },
  mapWide: { flex: 1, position: 'relative' },
  sideSheet: {
    width: SIDE_SHEET_WIDTH,
    backgroundColor: palette.card,
    boxShadow: `-8px 0 32px ${alpha(palette.ink, 0.08)}`,
  },
  topBar: { position: 'absolute', left: spacing.md, right: spacing.md, flexDirection: 'row', alignItems: 'center' },
  topMiddle: { flex: 1, alignItems: 'center' },
  topLeftWide: { flex: 1, minWidth: 0, alignItems: 'flex-start', paddingRight: spacing.sm },
  topRight: { alignItems: 'flex-end', gap: spacing.sm },
  recenterDisc: { width: 48, height: 48, borderRadius: 24, backgroundColor: palette.card, alignItems: 'center', justifyContent: 'center' },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    backgroundColor: palette.card,
    borderRadius: radii.pill,
    minHeight: 40,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipText: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: palette.ink, fontVariant: ['tabular-nums'] },
  recenter: {
    position: 'absolute',
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    backgroundColor: palette.card,
    borderRadius: radii.pill,
    paddingLeft: 12,
    paddingRight: 16,
  },
  recenterText: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: palette.ink },
  pressed: { opacity: 0.9 },
  aboveSheet: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.card,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
  },
  handleSpace: { height: HANDLE_SPACE },
  // Coins de la feuille : l'anneau de focus du clavier (web) suit le haut arrondi de la feuille.
  handleZone: { position: 'absolute', top: 0, left: 0, right: 0, height: HANDLE_TOUCH, zIndex: 2, alignItems: 'center', paddingTop: 8, borderTopLeftRadius: SHEET_RADIUS, borderTopRightRadius: SHEET_RADIUS },
  handleZoneWeb: { top: -HANDLE_ABOVE_WEB, height: HANDLE_TOUCH + HANDLE_ABOVE_WEB, paddingTop: 8 + HANDLE_ABOVE_WEB },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: palette.handle },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  footerEmpty: { height: 0 },
  // Fondu blanc (web et nouvelle architecture, Android 9+ : backgroundImage) au-dessus du pied.
  fade: { position: 'absolute', left: 0, right: 0, backgroundImage: `linear-gradient(to bottom, ${alpha(palette.card, 0)}, ${palette.card})` },
  sheetHeader: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
});
