import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFollowCamera } from '../../hooks/useFollowCamera';
import { trackingPadding } from '../../lib/mapCamera';
import { MAP_PALETTES } from '../../lib/map/style';
import { colors, dark, radius, SHEET_RADIUS, spacing } from '../../theme';
import { LiveMap } from '../map/LiveMap';
import type { MapPoint, MapTheme, SceneLine, SceneMarker, SceneZone } from '../map/types';

/** Au-delà de cette largeur (ordinateur, tablette en paysage), la feuille passe à droite de la carte. */
export const WIDE_LAYOUT_MIN_WIDTH = 900;
const SIDE_SHEET_WIDTH = 420;

/**
 * Écran de suivi façon Uber / DoorDash : carte plein écran, boutons flottants en haut, feuille blanche en bas
 * (repliable en touchant la poignée), bouton « Recentrer » dès que l'utilisateur déplace la carte. La caméra
 * cadre ce qui reste visible au-dessus de la feuille (marges : feuille + 90 px en bas, 60 px au moins sur les
 * côtés). Sur un grand écran (≥ 900 px), la carte occupe la gauche et la feuille devient un panneau à droite.
 *
 * Options (toutes facultatives, sans elles l'écran est exactement celui d'origine) : `sheetTheme="dark"` (feuille
 * sombre, coins de 24 px, contenu à styler en clair sur sombre), `mapTheme="dark"` (fond de carte sombre), `zones`
 * (cercles approximatifs), `aboveSheet` (élément centré posé sur la carte juste au-dessus de la feuille, ex. grand
 * bouton rond ; la caméra le garde dégagé), `insetBottom={false}` (écran au-dessus d'une barre d'onglets : pas de
 * marge de zone sûre sous la feuille), `mapVisible={false}` (carte démontée, ex. écran masqué : une seule carte
 * WebGL à la fois), `sheetHeader` (bloc fixé en haut de la feuille, au-dessus du contenu qui défile : titre et
 * action principale d'une liste), `sheetMaxRatio` (hauteur maximale de la feuille repliée, 0,56 de l'écran par défaut :
 * plus basse pour laisser plus de carte à une vue d'ensemble).
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
  sheetTheme = 'light',
  mapTheme = 'light',
  insetBottom = true,
  mapVisible = true,
  sheetMaxRatio = 0.56,
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
  /** Feuille claire (défaut) ou sombre. */
  sheetTheme?: 'light' | 'dark';
  /** Fond de carte clair (défaut) ou sombre. */
  mapTheme?: MapTheme;
  /** false : pas de marge de zone sûre sous la feuille (l'écran est au-dessus d'une barre d'onglets). */
  insetBottom?: boolean;
  /** false : carte démontée (fond uni à la place), le reste de l'écran reste affiché. */
  mapVisible?: boolean;
  /** Hauteur maximale de la feuille repliée (part de l'écran, 0,56 par défaut) ; dépliée : 0,86. */
  sheetMaxRatio?: number;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const { height, width: windowWidth } = useWindowDimensions();
  const [width, setWidth] = useState(windowWidth);
  const [expanded, setExpanded] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(Math.round(height * 0.45));
  const [aboveHeight, setAboveHeight] = useState(0);
  const camera = useFollowCamera(stageKey, fitPoints.length);
  const maxSheet = Math.round(height * (expanded ? 0.86 : sheetMaxRatio));
  const wide = allowWide && width >= WIDE_LAYOUT_MIN_WIDTH;
  const mapWidth = wide ? width - SIDE_SHEET_WIDTH : width;
  const above = aboveSheet && !wide ? aboveHeight + ABOVE_SHEET_GAP : 0;
  const padding = wide
    ? { top: insets.top + 104, right: 80, bottom: 80, left: 80 }
    : trackingPadding(sheetHeight + above, insets.top, mapWidth);
  const covered = wide ? 0 : sheetHeight;
  const darkSheet = sheetTheme === 'dark';
  const darkMap = mapTheme === 'dark';
  const bottomPad = insetBottom ? Math.max(insets.bottom, spacing.sm) : spacing.sm;

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
            {...(darkMap ? { theme: 'dark' as const } : {})}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: MAP_PALETTES[mapTheme].background }]} />
        )}
      </View>
      <View style={[styles.topBar, { top: insets.top + spacing.sm }, wide && { right: SIDE_SHEET_WIDTH + spacing.md }]} pointerEvents="box-none">
        <View style={styles.topSide} pointerEvents="box-none">
          {topLeft}
        </View>
        <View style={styles.topMiddle} pointerEvents="box-none">
          {topCenter}
        </View>
        <View style={[styles.topSide, { alignItems: 'flex-end' }]} pointerEvents="box-none">
          {topRight}
        </View>
      </View>
      {camera.showRecenter && mapVisible ? (
        <Pressable
          accessibilityRole="button"
          onPress={camera.recenter}
          style={[
            styles.recenter,
            darkMap && styles.recenterDark,
            { bottom: covered + 26 },
            wide && { right: SIDE_SHEET_WIDTH + spacing.md },
          ]}
          testID="recenter-button"
        >
          <Text style={[styles.recenterIcon, darkMap && { color: dark.green }]}>◎</Text>
          <Text style={[styles.recenterText, darkMap && { color: dark.text }]}>Recentrer</Text>
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
            ? [styles.sideSheet, darkSheet && styles.sideSheetDark, { paddingTop: insets.top + spacing.md, paddingBottom: bottomPad }]
            : [styles.sheet, darkSheet && styles.sheetDark, { maxHeight: maxSheet, paddingBottom: bottomPad }]
        }
        onLayout={(e) => {
          if (!wide) setSheetHeight(Math.round(e.nativeEvent.layout.height));
        }}
        testID="tracking-sheet"
      >
        {wide ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Réduire le détail' : 'Afficher tout le détail'}
            onPress={() => setExpanded((v) => !v)}
            style={styles.handleZone}
          >
            <View style={[styles.handle, darkSheet && styles.handleDark]} />
          </Pressable>
        )}
        {sheetHeader ? <View style={styles.sheetHeader}>{sheetHeader}</View> : null}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </View>
  );
}

/** Bouton rond flottant (retour, fermer). */
export function FloatingButton({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={styles.fab}>
      <Text style={styles.fabText}>{label}</Text>
    </Pressable>
  );
}

/** Pastille flottante (marque, numéro de course). */
export function FloatingChip({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <View style={styles.chip} testID={testID}>
      {typeof children === 'string' ? <Text style={styles.chipText}>{children}</Text> : children}
    </View>
  );
}

const shadow = {
  shadowColor: '#0F2E22',
  shadowOpacity: 0.2,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 6,
} as const;

/** Écart entre le haut de la feuille et l'élément `aboveSheet` (la mention des données de la carte reste visible dessous). */
const ABOVE_SHEET_GAP = 30;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  rootWide: { flexDirection: 'row' },
  mapWide: { flex: 1, position: 'relative' },
  sideSheet: {
    width: SIDE_SHEET_WIDTH,
    backgroundColor: colors.white,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
    shadowColor: '#0F2E22',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: -4, height: 0 },
    elevation: 6,
  },
  topBar: { position: 'absolute', left: spacing.md, right: spacing.md, flexDirection: 'row', alignItems: 'center' },
  topSide: { width: 52 },
  topMiddle: { flex: 1, alignItems: 'center' },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  fabText: { fontSize: 20, fontWeight: '800', color: colors.text },
  chip: {
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    ...shadow,
  },
  chipText: { fontWeight: '800', color: colors.text, fontSize: 14 },
  recenter: {
    position: 'absolute',
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    ...shadow,
  },
  recenterDark: { backgroundColor: dark.chip },
  recenterIcon: { fontSize: 16, color: colors.green, fontWeight: '900' },
  recenterText: { fontWeight: '800', color: colors.text },
  aboveSheet: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    ...shadow,
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: -4 },
  },
  sheetDark: {
    backgroundColor: dark.surface,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    shadowColor: '#000000',
    shadowOpacity: 0.35,
  },
  sideSheetDark: { backgroundColor: dark.surface, borderLeftColor: dark.border },
  handleZone: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#D5DBE1' },
  handleDark: { backgroundColor: dark.border },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  sheetHeader: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
});
