import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Easing, Platform, StyleSheet, View } from 'react-native';
import MapView, { AnimatedRegion, Marker, MarkerAnimated, Polyline, PROVIDER_GOOGLE, type MapMarkerProps } from 'react-native-maps';
import { bearingDeg, boundsOf, distanceM, OUAGADOUGOU_CENTER, padBounds, regionForBounds } from '@yaar/shared';
import { withDefaultPadding } from '../../lib/mapCamera';
import { pointsKey, resolveLines } from '../../lib/map/lines';
import { ANDROID_MAP_STYLE, MAP_COLORS } from '../../lib/map/style';
import { DriverMarkerView, DropoffMarkerView, PickupMarkerView } from './MarkerViews';
import type { LiveMapProps, MapPoint, SceneMarker } from './types';

const JUMP_M = 2500;
/** Fréquence de mise à jour du tracé rogné pendant l'animation d'un livreur. */
const TRIM_REFRESH_MS = 250;

const ll = (p: MapPoint) => ({ latitude: p.lat, longitude: p.lng });

/** Marker.Animated accepte une AnimatedRegion et des enfants (vue personnalisée) ; ses types ne le disent pas. */
const AnimatedMarker = MarkerAnimated as unknown as ComponentType<
  Omit<MapMarkerProps, 'coordinate'> & { coordinate: AnimatedRegion }
>;

/** Marqueur fixe (entreprise, destinataire) ; capture de la vue limitée aux marqueurs animés (Android). */
function StaticMarker({ marker }: { marker: SceneMarker }) {
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    if (marker.pulse) return setTracks(true);
    setTracks(true);
    const t = setTimeout(() => setTracks(false), 600);
    return () => clearTimeout(t);
  }, [marker.pulse, marker.kind]);
  const isDropoff = marker.kind === 'dropoff';
  return (
    <Marker
      coordinate={ll(marker)}
      anchor={isDropoff ? { x: 0.5, y: 45 / 56 } : { x: 0.5, y: 0.5 }}
      tracksViewChanges={tracks}
      title={marker.title}
      zIndex={isDropoff ? 3 : 2}
    >
      {isDropoff ? <DropoffMarkerView pulse={marker.pulse} /> : <PickupMarkerView searching={marker.pulse} />}
    </Marker>
  );
}

/**
 * Livreur : AnimatedRegion glisse vers chaque nouvelle position en ~l'intervalle de rafraîchissement ; le cap
 * vient de l'API ou du déplacement. La position animée est remontée (4 fois par seconde) pour rogner le tracé.
 */
function DriverMarker({
  marker,
  animationMs,
  onPosition,
}: {
  marker: SceneMarker;
  animationMs: number;
  onPosition: (id: string, p: MapPoint) => void;
}) {
  const region = useRef(
    new AnimatedRegion({ latitude: marker.lat, longitude: marker.lng, latitudeDelta: 0, longitudeDelta: 0 }),
  ).current;
  const last = useRef<MapPoint>({ lat: marker.lat, lng: marker.lng });
  const [heading, setHeading] = useState(marker.heading ?? 0);
  const [tracks, setTracks] = useState(true);
  const onPositionRef = useRef(onPosition);
  onPositionRef.current = onPosition;

  useEffect(() => {
    const next = { lat: marker.lat, lng: marker.lng };
    const moved = distanceM(last.current, next);
    if (marker.heading !== null && marker.heading !== undefined) setHeading(marker.heading);
    else if (moved > 3) setHeading(bearingDeg(last.current, next));
    if (moved > JUMP_M) {
      region.setValue({ ...ll(next), latitudeDelta: 0, longitudeDelta: 0 });
    } else if (moved > 0.3) {
      region
        .timing({
          ...ll(next),
          latitudeDelta: 0,
          longitudeDelta: 0,
          duration: animationMs,
          easing: Easing.linear,
          useNativeDriver: false,
          toValue: 0,
        })
        .start();
    }
    last.current = next;
  }, [marker.lat, marker.lng, marker.heading, animationMs, region]);

  useEffect(() => {
    let at = 0;
    const id = region.addListener((r) => {
      const now = Date.now();
      if (now - at < TRIM_REFRESH_MS) return;
      at = now;
      onPositionRef.current(marker.id, { lat: r.latitude, lng: r.longitude });
    });
    return () => region.removeListener(id);
  }, [region, marker.id]);

  // Android : la vue personnalisée n'est recopiée que si elle change (cap, véhicule).
  useEffect(() => {
    setTracks(true);
    const t = setTimeout(() => setTracks(false), 600);
    return () => clearTimeout(t);
  }, [heading, marker.vehicleType]);

  const android = Platform.OS === 'android';
  return (
    <AnimatedMarker
      coordinate={region}
      anchor={{ x: 0.5, y: 0.5 }}
      flat
      rotation={android ? heading : 0}
      tracksViewChanges={tracks}
      title={marker.title}
      zIndex={5}
    >
      <DriverMarkerView vehicleType={marker.vehicleType ?? 'MOTO'} rotation={android ? 0 : heading} />
    </AnimatedMarker>
  );
}

/**
 * Carte de suivi en direct (Android / iOS) : react-native-maps, Google Maps au style discret sur Android,
 * Apple Plans `mutedStandard` sur iOS, marqueurs personnalisés, itinéraire à liseré blanc rogné au fil de
 * l'avancée du livreur, caméra qui suit jusqu'au premier geste de l'utilisateur.
 */
export function LiveMap({
  markers,
  lines,
  fitPoints,
  follow,
  recenterKey = 0,
  onUserGesture,
  padding,
  animationMs = 4000,
  allowRotate = false,
  style,
  testID,
}: LiveMapProps) {
  const mapRef = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const [positions, setPositions] = useState<Record<string, MapPoint>>({});
  const gestureRef = useRef(onUserGesture);
  gestureRef.current = onUserGesture;

  const [initialRegion] = useState(() => {
    const b = boundsOf(fitPoints.length ? fitPoints : [OUAGADOUGOU_CENTER]);
    return regionForBounds(b!, { paddingRatio: 0.3, minDelta: 0.02 });
  });

  const onPosition = useCallback((id: string, p: MapPoint) => {
    setPositions((prev) => ({ ...prev, [id]: p }));
  }, []);

  const drawn = useMemo(
    () => resolveLines(lines, (id) => positions[id] ?? markers.find((m) => m.id === id) ?? null),
    [lines, markers, positions],
  );

  const pad = withDefaultPadding(padding);
  const padKey = `${pad.top},${pad.right},${pad.bottom},${pad.left}`;
  const fitKey = pointsKey(fitPoints);
  const lastFit = useRef({ fitKey: '', recenterKey: -1, padKey: '' });
  useEffect(() => {
    const map = mapRef.current;
    const bounds = boundsOf(fitPoints);
    if (!ready || !map || !bounds) return;
    const prev = lastFit.current;
    const first = prev.fitKey === '';
    const recenter = recenterKey !== prev.recenterKey;
    const changed = fitKey !== prev.fitKey || padKey !== prev.padKey;
    if (first || recenter || (follow && changed)) {
      // Étendue minimale (~330 m) : deux coins suffisent à cadrer sans zoom excessif.
      const b = padBounds(bounds, 0, 0.003);
      map.fitToCoordinates(
        [
          { latitude: b.south, longitude: b.west },
          { latitude: b.north, longitude: b.east },
        ],
        { edgePadding: pad, animated: !first },
      );
    }
    lastFit.current = { fitKey, recenterKey, padKey };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitKey, recenterKey, follow, padKey]);

  const android = Platform.OS === 'android';
  return (
    <View style={[styles.wrap, style]} testID={testID}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={android ? PROVIDER_GOOGLE : undefined}
        customMapStyle={android ? ANDROID_MAP_STYLE : undefined}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        initialRegion={initialRegion}
        rotateEnabled={allowRotate}
        pitchEnabled={allowRotate}
        showsCompass={allowRotate}
        showsPointsOfInterests={false}
        showsBuildings={false}
        showsTraffic={false}
        toolbarEnabled={false}
        moveOnMarkerPress={false}
        onMapReady={() => setReady(true)}
        onPanDrag={() => gestureRef.current?.()}
        onRegionChangeComplete={(_r, details) => {
          if (details?.isGesture) gestureRef.current?.();
        }}
      >
        {drawn.map((l) =>
          l.kind === 'route' ? (
            [
              <Polyline
                key={`${l.id}-casing`}
                coordinates={l.points.map(ll)}
                strokeColor={MAP_COLORS.casing}
                strokeWidth={10}
                lineCap="round"
                lineJoin="round"
                zIndex={1}
              />,
              <Polyline
                key={l.id}
                coordinates={l.points.map(ll)}
                strokeColor={MAP_COLORS.route}
                strokeWidth={5.5}
                lineCap="round"
                lineJoin="round"
                zIndex={2}
              />,
            ]
          ) : (
            <Polyline
              key={l.id}
              coordinates={l.points.map(ll)}
              strokeColor={MAP_COLORS.dashed}
              strokeWidth={3.5}
              lineDashPattern={[10, 8]}
              zIndex={1}
            />
          ),
        )}
        {markers.map((m) =>
          m.kind === 'driver' ? (
            <DriverMarker key={m.id} marker={m} animationMs={animationMs} onPosition={onPosition} />
          ) : (
            <StaticMarker key={m.id} marker={m} />
          ),
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: MAP_COLORS.background },
});
