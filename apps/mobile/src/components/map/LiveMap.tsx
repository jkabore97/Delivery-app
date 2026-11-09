import { memo, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Easing, Platform, StyleSheet, View } from 'react-native';
import MapView, {
  AnimatedRegion,
  Circle,
  Marker,
  MarkerAnimated,
  Polyline,
  PROVIDER_GOOGLE,
  type MapMarkerProps,
} from 'react-native-maps';
import { boundsOf, OUAGADOUGOU_CENTER, padBounds, regionForBounds } from '@yaar/shared';
import { clampBasePadding, nativeFitPadding, withDefaultPadding } from '../../lib/mapCamera';
import { activeLegPoints, pointsKey, resolveLines, type DrawnLine } from '../../lib/map/lines';
import { DriverMotion } from '../../lib/map/motion';
import { radarRings, RADAR_PERIOD_MS, RADAR_STEP_MS } from '../../lib/map/radar';
import { ANDROID_MAP_STYLE_DARK } from '../../lib/map/androidDarkStyle';
import { ANDROID_MAP_STYLE, MAP_COLORS, MAP_PALETTES, type MapPalette } from '../../lib/map/style';
import {
  AVATAR_VIEW,
  AvatarPinView,
  CHEVRON_VIEW_SIZE,
  DRIVER_VIEW_SIZE,
  DriverMarkerView,
  DropoffMarkerView,
  HeadingChevronView,
  PickupMarkerView,
} from './MarkerViews';
import {
  DRIVER_NUDGE_PX,
  type LiveMapProps,
  type MapPadding,
  type MapPoint,
  type SceneLine,
  type SceneMarker,
  type SceneZone,
} from './types';

/** Mise à jour du tracé rogné pendant le glissement d'un livreur : au plus une fois par seconde. */
const TRIM_REFRESH_MS = 1000;
/** Vérification périodique du chevron de cap (relevés trop anciens). */
const STALE_CHECK_MS = 5000;
/** Capture de la vue d'un marqueur (Android) : une fois, juste après son premier rendu. */
const CAPTURE_MS = 500;

const ll = (p: MapPoint) => ({ latitude: p.lat, longitude: p.lng });
const CENTER = { x: 0.5, y: 0.5 };
const android = Platform.OS === 'android';

/** Ancre (Android) d'une vue carrée de `size` dp décalée de DRIVER_NUDGE_PX à l'écran. */
function nudgedAnchor(size: number) {
  return { x: 0.5 - DRIVER_NUDGE_PX[0] / size, y: 0.5 - DRIVER_NUDGE_PX[1] / size };
}

/** iOS (Apple Plans) : `anchor` n'existe pas, la vue est décalée par `centerOffset` (y positif = vers le bas). */
const NUDGE_OFFSET = { x: DRIVER_NUDGE_PX[0], y: DRIVER_NUDGE_PX[1] };
const NO_OFFSET = { x: 0, y: 0 };
/** Épingle du destinataire (vue 64 × 56, pointe à 45 px du haut) : pointe sur la position, sur iOS aussi. */
const DROPOFF_CENTER_OFFSET = { x: 0, y: -(45 - 28) };
/** Épingle « avatar » (vue 56 × 60, pointe à 52,3 px du haut). */
const AVATAR_ANCHOR = { x: 0.5, y: AVATAR_VIEW.tipY / AVATAR_VIEW.height };
const AVATAR_CENTER_OFFSET = { x: 0, y: -(AVATAR_VIEW.tipY - AVATAR_VIEW.height / 2) };

/** Marker.Animated accepte une AnimatedRegion et des enfants (vue personnalisée) ; ses types ne le disent pas. */
const AnimatedMarker = MarkerAnimated as unknown as ComponentType<
  Omit<MapMarkerProps, 'coordinate'> & { coordinate: AnimatedRegion }
>;

/** Capture de la vue d'un marqueur : active au montage (et quand `key` change), coupée juste après. */
function useCaptureOnce(key: string): boolean {
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    setTracks(true);
    const t = setTimeout(() => setTracks(false), CAPTURE_MS);
    return () => clearTimeout(t);
  }, [key]);
  return tracks;
}

/** Positions animées des livreurs (rognage des tracés), sans re-rendre la carte entière. */
class PositionStore {
  private positions = new Map<string, MapPoint>();
  private listeners = new Set<() => void>();
  get(id: string): MapPoint | undefined {
    return this.positions.get(id);
  }
  set(id: string, p: MapPoint): void {
    this.positions.set(id, p);
    for (const l of this.listeners) l();
  }
  subscribe(l: () => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

/** Radar « recherche d'un livreur » autour de l'entreprise : cercles natifs (Circle), 5 images par seconde. */
function SearchRadar({ center }: { center: MapPoint }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((v) => (v + RADAR_STEP_MS) % RADAR_PERIOD_MS), RADAR_STEP_MS);
    return () => clearInterval(id);
  }, []);
  return (
    <>
      {radarRings(t).map((r, i) => (
        <Circle
          key={i}
          center={ll(center)}
          radius={r.radiusM}
          fillColor={`rgba(242,140,27,${r.alpha})`}
          strokeColor={`rgba(242,140,27,${Math.min(1, r.alpha * 1.8).toFixed(3)})`}
          strokeWidth={1.5}
          zIndex={0}
        />
      ))}
    </>
  );
}

/** Zones approximatives : cercles natifs doux, contour en pointillés (iOS ; trait plein sur Android). */
function ZoneCircles({ zones, palette }: { zones: SceneZone[]; palette: MapPalette }) {
  return (
    <>
      {zones.map((z) => (
        <Circle
          key={z.id}
          center={ll(z)}
          radius={z.radiusM}
          fillColor={palette.zoneFill[z.kind]}
          strokeColor={palette.zoneStroke[z.kind]}
          strokeWidth={1.5}
          lineDashPattern={[8, 6]}
          zIndex={0}
        />
      ))}
    </>
  );
}

/** Marqueur fixe (entreprise, destinataire, ou épingle « avatar ») : vue statique capturée une seule fois. */
const StaticMarker = memo(function StaticMarker({ marker }: { marker: SceneMarker }) {
  const isDropoff = marker.kind === 'dropoff';
  const avatar = marker.kind !== 'driver' && marker.initials ? marker.initials : null;
  const tracks = useCaptureOnce(`${marker.kind}|${marker.pulse ? 1 : 0}|${avatar ?? ''}`);
  return (
    <Marker
      coordinate={ll(marker)}
      anchor={avatar ? AVATAR_ANCHOR : isDropoff ? { x: 0.5, y: 45 / 56 } : CENTER}
      centerOffset={avatar ? AVATAR_CENTER_OFFSET : isDropoff ? DROPOFF_CENTER_OFFSET : NO_OFFSET}
      tracksViewChanges={tracks}
      title={marker.title}
      zIndex={isDropoff ? 3 : 2}
    >
      {avatar ? (
        <AvatarPinView initials={avatar} color={isDropoff ? MAP_COLORS.dropoff : MAP_COLORS.pickup} pulse={isDropoff && marker.pulse} />
      ) : isDropoff ? (
        <DropoffMarkerView pulse={marker.pulse} />
      ) : (
        <PickupMarkerView searching={marker.pulse} />
      )}
    </Marker>
  );
}, (a, b) =>
  a.marker.id === b.marker.id &&
  a.marker.kind === b.marker.kind &&
  a.marker.lat === b.marker.lat &&
  a.marker.lng === b.marker.lng &&
  a.marker.pulse === b.marker.pulse &&
  a.marker.initials === b.marker.initials &&
  a.marker.title === b.marker.title,
);

/** Chevron de cap (Android : marqueur plat tourné nativement ; iOS / Apple Plans : vue tournée). */
function ChevronMarker({ region, heading, nudge }: { region: AnimatedRegion; heading: number; nudge: boolean }) {
  const tracks = useCaptureOnce('chevron');
  return (
    <AnimatedMarker
      coordinate={region}
      anchor={nudge ? nudgedAnchor(CHEVRON_VIEW_SIZE) : CENTER}
      centerOffset={nudge ? NUDGE_OFFSET : NO_OFFSET}
      flat
      rotation={android ? heading : 0}
      tracksViewChanges={tracks}
      zIndex={4}
    >
      <View style={android ? undefined : { transform: [{ rotate: `${heading}deg` }] }}>
        <HeadingChevronView />
      </View>
    </AnimatedMarker>
  );
}

/**
 * Livreur : la position glisse (AnimatedRegion, vitesse constante) d'un relevé GPS au suivant pendant l'écart
 * réel entre les deux relevés ; pictogramme droit capturé une fois ; chevron de cap séparé, masqué à l'arrêt.
 */
function DriverMarker({ marker, fallbackMs, store }: { marker: SceneMarker; fallbackMs: number; store: PositionStore }) {
  const motion = useRef(new DriverMotion()).current;
  const region = useRef(
    new AnimatedRegion({ latitude: marker.lat, longitude: marker.lng, latitudeDelta: 0, longitudeDelta: 0 }),
  ).current;
  const [heading, setHeading] = useState<number | null>(null);
  const tracks = useCaptureOnce(marker.vehicleType ?? 'MOTO');

  useEffect(() => {
    const now = Date.now();
    const r = motion.update({ lat: marker.lat, lng: marker.lng, heading: marker.heading ?? null, at: marker.fixAt ?? null }, now, fallbackMs);
    const t = motion.target;
    if (t && r === 'glide') {
      region.stopAnimation(() => undefined);
      region
        .timing({
          latitude: t.lat,
          longitude: t.lng,
          latitudeDelta: 0,
          longitudeDelta: 0,
          duration: motion.glideMs,
          easing: Easing.linear,
          useNativeDriver: false,
          toValue: 0,
        })
        .start();
    } else if (t && r !== 'none') {
      region.stopAnimation(() => undefined);
      region.setValue({ latitude: t.lat, longitude: t.lng, latitudeDelta: 0, longitudeDelta: 0 });
      store.set(marker.id, t);
    }
    setHeading(motion.chevronVisible(now) ? motion.heading : null);
  }, [marker.id, marker.lat, marker.lng, marker.heading, marker.fixAt, fallbackMs, motion, region, store]);

  useEffect(() => {
    const id = setInterval(() => {
      const visible = motion.chevronVisible(Date.now());
      setHeading((h) => (visible ? motion.heading : h === null ? h : null));
    }, STALE_CHECK_MS);
    return () => clearInterval(id);
  }, [motion]);

  useEffect(() => {
    let at = 0;
    const id = region.addListener((r) => {
      const now = Date.now();
      if (now - at < TRIM_REFRESH_MS) return;
      at = now;
      store.set(marker.id, { lat: r.latitude, lng: r.longitude });
    });
    return () => region.removeListener(id);
  }, [region, marker.id, store]);

  return (
    <>
      {heading !== null ? <ChevronMarker region={region} heading={Math.round(heading)} nudge={!!marker.nudge} /> : null}
      <AnimatedMarker
        coordinate={region}
        anchor={marker.nudge ? nudgedAnchor(DRIVER_VIEW_SIZE) : CENTER}
        centerOffset={marker.nudge ? NUDGE_OFFSET : NO_OFFSET}
        tracksViewChanges={tracks}
        title={marker.title}
        zIndex={5}
      >
        <DriverMarkerView vehicleType={marker.vehicleType ?? 'MOTO'} />
      </AnimatedMarker>
    </>
  );
}

/** Tracés (itinéraire rogné à la position animée du livreur, pointillés) : seul composant re-rendu pendant un glissement. */
function TrimmedLines({
  lines,
  markers,
  store,
  palette,
}: {
  lines: SceneLine[];
  markers: SceneMarker[];
  store: PositionStore;
  palette: MapPalette;
}) {
  const compute = () => resolveLines(lines, (id) => store.get(id) ?? markers.find((m) => m.id === id) ?? null);
  const [drawn, setDrawn] = useState<DrawnLine[]>(compute);
  const keyOf = (d: DrawnLine[]) => d.map((l) => `${l.id}:${l.kind}:${pointsKey(l.points)}`).join(';');
  const lastKey = useRef(keyOf(drawn));
  const computeRef = useRef(compute);
  computeRef.current = compute;
  useEffect(() => {
    const refresh = () => {
      const next = computeRef.current();
      const k = keyOf(next);
      if (k === lastKey.current) return;
      lastKey.current = k;
      setDrawn(next);
    };
    refresh();
    return store.subscribe(refresh);
  }, [lines, markers, store]);
  return (
    <>
      {drawn.map((l) =>
        l.kind === 'route' ? (
          [
            <Polyline
              key={`${l.id}-casing`}
              coordinates={l.points.map(ll)}
              strokeColor={palette.casing}
              strokeWidth={10}
              lineCap="round"
              lineJoin="round"
              zIndex={1}
            />,
            <Polyline
              key={l.id}
              coordinates={l.points.map(ll)}
              strokeColor={palette.route}
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
            strokeColor={palette.dashed}
            strokeWidth={3.5}
            lineDashPattern={[10, 8]}
            zIndex={1}
          />
        ),
      )}
    </>
  );
}

const NO_ZONES: SceneZone[] = [];

/**
 * Carte de suivi en direct (Android / iOS) : react-native-maps, Google Maps au style discret sur Android,
 * Apple Plans `mutedStandard` sur iOS, marqueurs personnalisés statiques, itinéraire à liseré blanc rogné au fil
 * de l'avancée du livreur, caméra qui suit jusqu'au premier geste de l'utilisateur. Le logo Google et le lien
 * « Mentions légales » d'Apple restent au-dessus de la feuille (`mapPadding`). `theme="dark"` : Google Maps de nuit
 * (Android), Apple Plans sombre (iOS), tracés en vert vif ; zones approximatives en cercles natifs (`zones`).
 */
export function LiveMap({
  markers,
  lines,
  zones = NO_ZONES,
  theme = 'light',
  fitPoints,
  follow,
  recenterKey = 0,
  onUserGesture,
  padding,
  bottomInset = 0,
  animationMs = 4000,
  allowRotate = false,
  style,
  testID,
}: LiveMapProps) {
  const mapRef = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const store = useRef(new PositionStore()).current;
  const gestureRef = useRef(onUserGesture);
  gestureRef.current = onUserGesture;

  const [initialRegion] = useState(() => {
    const b = boundsOf(fitPoints.length ? fitPoints : [OUAGADOUGOU_CENTER]);
    return regionForBounds(b!, { paddingRatio: 0.3, minDelta: 0.02 });
  });

  // Les objets changent à chaque rendu du parent : comparés par valeur pour ne pas relancer le rognage.
  const linesKeyed = useMemo(() => lines, [lines.map((l) => `${l.id}:${l.kind}:${l.trimToMarkerId ?? ''}:${pointsKey(l.points)}`).join(';')]); // eslint-disable-line react-hooks/exhaustive-deps
  const markersKeyed = useMemo(() => markers, [markers.map((m) => `${m.id}:${m.lat.toFixed(6)},${m.lng.toFixed(6)}`).join(';')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Logo Google / « Mentions légales » d'Apple au-dessus de la feuille ; jamais plus que la carte elle-même.
  const wanted: MapPadding = { top: 0, right: 0, bottom: Math.max(0, Math.round(bottomInset)), left: 0 };
  const mapPadding = size ? clampBasePadding(wanted, size.w, size.h) : wanted;
  const pad = withDefaultPadding(padding);
  const padKey = `${pad.top},${pad.right},${pad.bottom},${pad.left}`;
  const fitKey = pointsKey(fitPoints);
  const lastFit = useRef({ fitKey: '', recenterKey: -1, padKey: '' });
  useEffect(() => {
    const map = mapRef.current;
    const bounds = boundsOf(fitPoints);
    if (!ready || !map || !bounds || !size) return;
    const prev = lastFit.current;
    const first = prev.fitKey === '';
    const recenter = recenterKey !== prev.recenterKey;
    const changed = fitKey !== prev.fitKey || padKey !== prev.padKey;
    if (first || recenter || (follow && changed)) {
      // Étendue minimale (~330 m) : deux coins suffisent à cadrer sans zoom excessif. Marges bornées à la taille de
      // la carte (Google Maps refuse un cadrage dont les marges dépassent la vue), moins la marge de base (Android).
      // Livreur en train de glisser : sa position affichée et l'étape dessinée depuis elle restent dans le cadre.
      const all = boundsOf([...fitPoints, ...activeLegPoints(linesKeyed, (id) => store.get(id))]) ?? bounds;
      const b = padBounds(all, 0, 0.003);
      const edgePadding = nativeFitPadding(pad, mapPadding, Platform.OS, size.w, size.h);
      map.fitToCoordinates(
        [
          { latitude: b.south, longitude: b.west },
          { latitude: b.north, longitude: b.east },
        ],
        { edgePadding, animated: !first },
      );
    }
    lastFit.current = { fitKey, recenterKey, padKey };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, size, fitKey, recenterKey, follow, padKey]);

  const radarAt = markers.find((m) => m.kind === 'pickup' && m.pulse) ?? null;
  const dark = theme === 'dark';
  const palette = MAP_PALETTES[theme];
  return (
    <View
      style={[styles.wrap, { backgroundColor: palette.background }, style]}
      testID={testID}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) setSize((s) => (s && s.w === width && s.h === height ? s : { w: width, h: height }));
      }}
    >
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={android ? PROVIDER_GOOGLE : undefined}
        customMapStyle={android ? (dark ? ANDROID_MAP_STYLE_DARK : ANDROID_MAP_STYLE) : undefined}
        // Fond sombre seulement sur demande : les cartes claires gardent exactement leurs réglages d'origine.
        userInterfaceStyle={dark ? 'dark' : undefined}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        initialRegion={initialRegion}
        mapPadding={mapPadding}
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
        {radarAt ? <SearchRadar center={radarAt} /> : null}
        {zones.length ? <ZoneCircles zones={zones} palette={palette} /> : null}
        <TrimmedLines lines={linesKeyed} markers={markersKeyed} store={store} palette={palette} />
        {markers.map((m) =>
          m.kind === 'driver' ? (
            <DriverMarker key={m.id} marker={m} fallbackMs={animationMs} store={store} />
          ) : (
            <StaticMarker key={`${m.id}|${m.pulse ? 1 : 0}|${m.initials ?? ''}`} marker={m} />
          ),
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
});
