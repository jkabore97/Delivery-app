import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFollowCamera } from '../../hooks/useFollowCamera';
import { colors, radius, spacing } from '../../theme';
import { LiveMap } from '../map/LiveMap';
import type { MapPoint, SceneLine, SceneMarker } from '../map/types';

/**
 * Écran de suivi façon Uber / DoorDash : carte plein écran, boutons flottants en haut, feuille blanche en bas
 * (repliable en touchant la poignée), bouton « Recentrer » dès que l'utilisateur déplace la carte. La caméra
 * cadre ce qui reste visible au-dessus de la feuille.
 */
export function LiveTrackingLayout({
  markers,
  lines,
  fitPoints,
  stageKey,
  animationMs,
  allowRotate,
  topLeft,
  topCenter,
  topRight,
  children,
  footer,
  testID,
}: {
  markers: SceneMarker[];
  lines: SceneLine[];
  fitPoints: MapPoint[];
  /** Change à chaque nouvelle étape : recadrage et reprise du suivi. */
  stageKey: string;
  animationMs: number;
  allowRotate?: boolean;
  topLeft?: ReactNode;
  topCenter?: ReactNode;
  topRight?: ReactNode;
  children: ReactNode;
  /** Bloc fixé en bas de la feuille (bouton d'action). */
  footer?: ReactNode;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(Math.round(height * 0.45));
  const camera = useFollowCamera(stageKey, fitPoints.length);
  const maxSheet = Math.round(height * (expanded ? 0.86 : 0.56));

  return (
    <View style={styles.root} testID={testID}>
      <LiveMap
        style={StyleSheet.absoluteFill}
        markers={markers}
        lines={lines}
        fitPoints={fitPoints}
        follow={camera.follow}
        recenterKey={camera.recenterKey}
        onUserGesture={camera.onUserGesture}
        padding={{ top: insets.top + 100, bottom: sheetHeight + 28, left: 44, right: 44 }}
        bottomInset={sheetHeight}
        animationMs={animationMs}
        allowRotate={allowRotate}
      />
      <View style={[styles.topBar, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
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
      {camera.showRecenter ? (
        <Pressable
          accessibilityRole="button"
          onPress={camera.recenter}
          style={[styles.recenter, { bottom: sheetHeight + 26 }]}
          testID="recenter-button"
        >
          <Text style={styles.recenterIcon}>◎</Text>
          <Text style={styles.recenterText}>Recentrer</Text>
        </Pressable>
      ) : null}
      <View
        style={[styles.sheet, { maxHeight: maxSheet, paddingBottom: Math.max(insets.bottom, spacing.sm) }]}
        onLayout={(e) => setSheetHeight(Math.round(e.nativeEvent.layout.height))}
        testID="tracking-sheet"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Réduire le détail' : 'Afficher tout le détail'}
          onPress={() => setExpanded((v) => !v)}
          style={styles.handleZone}
        >
          <View style={styles.handle} />
        </Pressable>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
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
  recenterIcon: { fontSize: 16, color: colors.green, fontWeight: '900' },
  recenterText: { fontWeight: '800', color: colors.text },
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
  handleZone: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#D5DBE1' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
});
