import { useRef, type ComponentRef, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '../../design/Icon';
import { LiveMap } from '../../map/LiveMap';
import type { MapPoint, SceneLine, SceneMarker } from '../../map/types';
import { useFollowCamera } from '../../../hooks/useFollowCamera';
import { palette, shadows } from '../../../theme';
import { POINTER, type WebPressState } from '../parts';

/**
 * Zoom de la carte web : la carte MapLibre a son raccourci clavier « + » / « − » (un niveau, en douceur) sur son
 * conteneur ; les boutons le lui envoient. Le déplacement compte comme un geste de l'utilisateur (la caméra cesse de
 * suivre, « Recentrer » la remet). Sans effet hors du web.
 */
export function zoomWebMap(root: unknown, direction: 1 | -1): boolean {
  if (Platform.OS !== 'web' || typeof KeyboardEvent === 'undefined') return false;
  const el = (root as { querySelector?: (s: string) => Element | null } | null)?.querySelector?.('.maplibregl-canvas-container');
  if (!el) return false;
  const event = new KeyboardEvent('keydown', { key: direction > 0 ? '+' : '-', code: direction > 0 ? 'Equal' : 'Minus', bubbles: true, cancelable: true });
  Object.defineProperty(event, 'keyCode', { get: () => (direction > 0 ? 187 : 189) });
  el.dispatchEvent(event);
  return true;
}

/**
 * Bouton de la carte (48 px). Ses coins sont les siens (`shape`) : le groupe qui le porte ne rogne rien, l'anneau de
 * focus du clavier reste visible.
 */
function MapButton({
  icon,
  label,
  onPress,
  color = palette.ink,
  shape = 'round',
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  shape?: 'round' | 'top' | 'bottom';
  testID?: string;
}) {
  const corners = shape === 'top' ? styles.btnTop : shape === 'bottom' ? styles.btnBottom : styles.btnRound;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[POINTER, corners]} testID={testID}>
      {(s: WebPressState) => (
        <View style={[styles.btn, corners, (s.hovered || s.pressed) && styles.btnHover]}>
          <Icon name={icon} size={18} color={color} strokeWidth={2.4} />
        </View>
      )}
    </Pressable>
  );
}

/**
 * Tuile carte de l'ordinateur (tableau de bord, détail d'une livraison) : carte en direct (entreprise, livreurs,
 * destinataires, itinéraires), pastille posée en haut à gauche (`overlay`, ex. « 3 en cours | 1 en recherche »), zoom
 * (web) et « Recentrer ». La caméra cadre `fitPoints` et recadre à chaque nouveau `cameraKey`.
 */
export function MapTile({
  markers,
  lines,
  fitPoints,
  cameraKey,
  overlay,
  animationMs,
  onRecenter,
  recenterLabel = 'Recentrer la carte',
  visible = true,
  style,
  testID = 'dashboard-map',
}: {
  markers: SceneMarker[];
  lines: SceneLine[];
  fitPoints: MapPoint[];
  cameraKey: string;
  /** Pastille posée en haut à gauche de la carte. */
  overlay?: ReactNode;
  animationMs: number;
  /** « Recentrer » (en plus du recadrage de la caméra). */
  onRecenter?: () => void;
  recenterLabel?: string;
  visible?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const camera = useFollowCamera(cameraKey, fitPoints.length);
  const root = useRef<ComponentRef<typeof View>>(null);
  const web = Platform.OS === 'web';
  return (
    <View ref={root} style={[styles.tile, shadows.tile, style]} testID={testID}>
      {visible ? (
        <LiveMap
          style={StyleSheet.absoluteFill}
          markers={markers}
          lines={lines}
          fitPoints={fitPoints}
          follow={camera.follow}
          recenterKey={camera.recenterKey}
          onUserGesture={camera.onUserGesture}
          padding={{ top: 80, right: 84, bottom: 56, left: 56 }}
          animationMs={animationMs}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.blank]} />
      )}
      {overlay ? (
        <View style={styles.pill} pointerEvents="box-none">
          {overlay}
        </View>
      ) : null}
      <View style={styles.controls} pointerEvents="box-none">
        {web ? (
          <View style={[styles.zoom, shadows.float]}>
            <MapButton icon="plus" label="Zoomer" shape="top" onPress={() => zoomWebMap(root.current, 1)} testID="map-zoom-in" />
            <View style={styles.zoomSep} />
            <MapButton icon="minus" label="Dézoomer" shape="bottom" onPress={() => zoomWebMap(root.current, -1)} testID="map-zoom-out" />
          </View>
        ) : null}
        <View style={[styles.round, shadows.float]}>
          <MapButton
            icon="recenter"
            label={recenterLabel}
            color={palette.cobalt}
            onPress={() => {
              onRecenter?.();
              camera.recenter();
            }}
            testID="map-recenter"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: 24, overflow: 'hidden', backgroundColor: '#F3F5F8' },
  blank: { backgroundColor: '#F3F5F8' },
  pill: { position: 'absolute', left: 16, top: 16, right: 76, alignItems: 'flex-start' },
  controls: { position: 'absolute', right: 16, top: 16, alignItems: 'center', gap: 8 },
  zoom: { borderRadius: 24, backgroundColor: palette.card },
  zoomSep: { height: 1, backgroundColor: palette.line },
  round: { borderRadius: 24, backgroundColor: palette.card },
  btn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.card },
  btnRound: { borderRadius: 24 },
  btnTop: { borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  btnBottom: { borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  btnHover: { backgroundColor: palette.raised },
});
