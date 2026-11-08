import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Marker as MlMarker } from 'maplibre-gl';
import {
  bearingDeg,
  boundsOf,
  distanceM,
  interpolateBearing,
  interpolateLatLng,
  OUAGADOUGOU_CENTER,
  padBounds,
} from '@yaar/shared';
import { clampPadding, withDefaultPadding } from '../../lib/mapCamera';
import { pointsKey, resolveLines } from '../../lib/map/lines';
import {
  createBaseMap,
  ensureLineLayers,
  LINES_SOURCE,
  loadMaplibre,
  setLineFeatures,
  webglSupported,
  type BaseMap,
  type Maplibre,
} from '../../lib/map/maplibre.web';
import { MAP_COLORS } from '../../lib/map/style';
import { MapAttribution } from './MapAttribution';
import { driverElement, dropoffElement, pickupElement } from './markerDom.web';
import type { LiveMapProps, MapPadding, MapPoint, SceneLine, SceneMarker } from './types';

/** Au-delà, le livreur « saute » sans animation (première position, données anciennes). */
const JUMP_M = 2500;
const ROTATE_MS = 700;
/** Rafraîchissement du tracé rogné pendant l'animation (~11 images/s suffisent). */
const LINE_REFRESH_MS = 90;

interface Entry {
  kind: SceneMarker['kind'];
  /** Apparence (type, pulsation, véhicule) : l'élément est recréé si elle change. */
  look: string;
  marker: MlMarker;
  /** Position affichée (animée). */
  pos: MapPoint;
  from: MapPoint;
  to: MapPoint;
  start: number;
  duration: number;
  heading: number;
  headingFrom: number;
  headingTo: number;
  /** Dernière position reçue. */
  target: MapPoint;
}

/** Pilote impératif de la carte MapLibre : marqueurs DOM, animation requestAnimationFrame, tracés, caméra. */
class LiveMapController {
  private entries = new Map<string, Entry>();
  private lines: SceneLine[] = [];
  private raf = 0;
  private lastLineFlush = 0;

  constructor(
    private readonly ml: Maplibre,
    private readonly base: BaseMap,
  ) {}

  private get map() {
    return this.base.map;
  }

  setScene(markers: SceneMarker[], lines: SceneLine[], animationMs: number): void {
    const now = performance.now();
    const seen = new Set<string>();
    for (const m of markers) {
      seen.add(m.id);
      const look = `${m.kind}|${m.pulse ? 1 : 0}|${m.vehicleType ?? ''}`;
      const target = { lat: m.lat, lng: m.lng };
      let e = this.entries.get(m.id);
      if (e && e.look !== look) {
        e.marker.remove();
        this.entries.delete(m.id);
        e = undefined;
      }
      if (!e) {
        const el =
          m.kind === 'driver'
            ? driverElement(m.vehicleType ?? 'MOTO', m.title)
            : m.kind === 'pickup'
              ? pickupElement(!!m.pulse, m.title)
              : dropoffElement(!!m.pulse, m.title);
        const heading = m.heading ?? 0;
        const marker = new this.ml.Marker({
          element: el,
          anchor: m.kind === 'dropoff' ? 'bottom' : 'center',
          rotationAlignment: m.kind === 'driver' ? 'map' : 'viewport',
          pitchAlignment: 'viewport',
          rotation: m.kind === 'driver' ? heading : 0,
        })
          .setLngLat([m.lng, m.lat])
          .addTo(this.map);
        this.entries.set(m.id, {
          kind: m.kind,
          look,
          marker,
          pos: target,
          from: target,
          to: target,
          start: now,
          duration: 0,
          heading,
          headingFrom: heading,
          headingTo: heading,
          target,
        });
        continue;
      }
      if (e.kind !== 'driver') {
        if (distanceM(e.pos, target) > 0.3) {
          e.pos = target;
          e.marker.setLngLat([target.lng, target.lat]);
        }
        e.target = target;
        continue;
      }
      // Livreur : glisse de la position affichée vers la nouvelle position pendant ~l'intervalle de rafraîchissement.
      const moved = distanceM(e.target, target);
      const headingTo = m.heading ?? (moved > 3 ? bearingDeg(e.target, target) : e.headingTo);
      if (moved < 0.3 && Math.abs(headingTo - e.headingTo) < 0.5) continue;
      const jump = distanceM(e.pos, target) > JUMP_M;
      e.headingFrom = e.heading;
      e.headingTo = headingTo;
      e.from = jump ? target : e.pos;
      e.to = target;
      e.start = now;
      e.duration = jump ? 0 : Math.max(0, animationMs);
      e.target = target;
      if (jump) {
        e.pos = target;
        e.marker.setLngLat([target.lng, target.lat]);
      }
    }
    for (const [id, e] of this.entries) {
      if (!seen.has(id)) {
        e.marker.remove();
        this.entries.delete(id);
      }
    }
    this.lines = lines;
    this.flushLines(now);
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    this.raf = 0;
    let animating = false;
    for (const e of this.entries.values()) {
      if (e.kind !== 'driver') continue;
      const elapsed = now - e.start;
      const tMove = e.duration > 0 ? Math.min(1, elapsed / e.duration) : 1;
      const tRot = Math.min(1, elapsed / Math.max(1, Math.min(ROTATE_MS, e.duration || ROTATE_MS)));
      if (tMove < 1 || e.pos.lat !== e.to.lat || e.pos.lng !== e.to.lng) {
        // Vitesse constante entre deux positions, comme un véhicule qui roule.
        e.pos = interpolateLatLng(e.from, e.to, tMove);
        e.marker.setLngLat([e.pos.lng, e.pos.lat]);
      }
      if (tRot < 1 || e.heading !== e.headingTo) {
        e.heading = interpolateBearing(e.headingFrom, e.headingTo, tRot);
        e.marker.setRotation(e.heading);
      }
      if (tMove < 1 || tRot < 1) animating = true;
    }
    if (!animating || now - this.lastLineFlush >= LINE_REFRESH_MS) this.flushLines(now);
    if (animating) this.raf = requestAnimationFrame(this.tick);
  };

  flushLines(now: number = performance.now()): void {
    this.lastLineFlush = now;
    if (!this.map.getSource(LINES_SOURCE)) return; // style en cours de chargement : repris dans onStyleReady
    const drawn = resolveLines(this.lines, (id) => this.entries.get(id)?.pos);
    setLineFeatures(
      this.map,
      drawn.map((l) => ({
        type: 'Feature' as const,
        properties: { kind: l.kind },
        geometry: { type: 'LineString' as const, coordinates: l.points.map((p) => [p.lng, p.lat] as [number, number]) },
      })),
    );
  }

  onStyleReady(): void {
    ensureLineLayers(this.map);
    this.flushLines();
  }

  fit(points: MapPoint[], padding: MapPadding, maxZoom: number, animate: boolean): void {
    const container = this.map.getContainer();
    const w = container.clientWidth;
    const h = container.clientHeight;
    const bounds = boundsOf(points);
    if (!w || !h || !bounds) return;
    // Étendue minimale (~330 m) : un point seul ne zoome pas à l'extrême.
    const b = padBounds(bounds, 0, 0.003);
    this.map.fitBounds(
      [
        [b.west, b.south],
        [b.east, b.north],
      ],
      { padding: clampPadding(padding, w, h), maxZoom, duration: animate ? 900 : 0 },
    );
  }

  destroy(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const e of this.entries.values()) e.marker.remove();
    this.entries.clear();
    this.base.destroy();
  }
}

function markersKey(markers: SceneMarker[]): string {
  return markers
    .map((m) => `${m.id}:${m.kind}:${m.lat.toFixed(6)},${m.lng.toFixed(6)}:${m.heading ?? ''}:${m.pulse ? 1 : 0}:${m.vehicleType ?? ''}`)
    .join(';');
}

function linesKey(lines: SceneLine[]): string {
  return lines.map((l) => `${l.id}:${l.kind}:${l.trimToMarkerId ?? ''}:${pointsKey(l.points)}`).join(';');
}

/**
 * Carte de suivi en direct (web) : MapLibre GL JS chargé à la demande, style OpenFreeMap (ou secours),
 * marqueurs entreprise / destinataire / livreur, itinéraire vert à liseré blanc rogné au fil de l'avancée,
 * livreur animé entre deux positions, caméra qui suit jusqu'au premier geste de l'utilisateur.
 */
export function LiveMap({
  markers,
  lines,
  fitPoints,
  follow,
  recenterKey = 0,
  onUserGesture,
  padding,
  bottomInset = 0,
  animationMs = 4000,
  allowRotate = false,
  maxZoom = 16.5,
  style,
  testID,
}: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ctrlRef = useRef<LiveMapController | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unsupported'>('loading');
  const gestureRef = useRef(onUserGesture);
  gestureRef.current = onUserGesture;
  const initialCenter = useRef<MapPoint>(fitPoints[0] ?? markers[0] ?? OUAGADOUGOU_CENTER);
  const allowRotateRef = useRef(allowRotate);

  useEffect(() => {
    let cancelled = false;
    if (!webglSupported()) {
      setStatus('unsupported');
      return;
    }
    loadMaplibre()
      .then((ml) => {
        const el = containerRef.current;
        if (cancelled || !el) return;
        let ctrl: LiveMapController | null = null;
        const base = createBaseMap(ml, el, {
          center: initialCenter.current,
          zoom: 13,
          allowRotate: allowRotateRef.current,
          onStyleReady: () => ctrl?.onStyleReady(),
        });
        ctrl = new LiveMapController(ml, base);
        const userGesture = (e: { originalEvent?: unknown }) => {
          if (e.originalEvent) gestureRef.current?.();
        };
        base.map.on('dragstart', userGesture);
        base.map.on('zoomstart', userGesture);
        base.map.on('rotatestart', userGesture);
        base.map.on('pitchstart', userGesture);
        ctrlRef.current = ctrl;
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('unsupported');
      });
    return () => {
      cancelled = true;
      ctrlRef.current?.destroy();
      ctrlRef.current = null;
    };
  }, []);

  const sceneKey = `${markersKey(markers)}#${linesKey(lines)}`;
  useEffect(() => {
    if (status === 'ready') ctrlRef.current?.setScene(markers, lines, animationMs);
    // La scène est comparée par valeur (sceneKey), pas par référence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, sceneKey, animationMs]);

  const pad = withDefaultPadding(padding);
  const padKey = `${pad.top},${pad.right},${pad.bottom},${pad.left}`;
  const fitKey = pointsKey(fitPoints);
  const lastFit = useRef({ fitKey: '', recenterKey: -1, padKey: '' });
  useEffect(() => {
    const ctrl = ctrlRef.current;
    if (status !== 'ready' || !ctrl || fitPoints.length === 0) return;
    const prev = lastFit.current;
    const first = prev.fitKey === '';
    const recenter = recenterKey !== prev.recenterKey;
    const changed = fitKey !== prev.fitKey || padKey !== prev.padKey;
    if (first || recenter || (follow && changed)) ctrl.fit(fitPoints, pad, maxZoom, !first);
    lastFit.current = { fitKey, recenterKey, padKey };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, fitKey, recenterKey, follow, padKey, maxZoom]);

  return (
    <View style={[styles.wrap, style]} testID={testID}>
      {/* zIndex 0 : contexte d'empilement propre sous les boutons posés sur la carte. */}
      <div ref={containerRef} data-testid="live-map" style={{ position: 'absolute', inset: 0, zIndex: 0 }} />
      {status !== 'ready' ? (
        <View style={styles.overlay} pointerEvents="none">
          <Text style={styles.overlayText}>
            {status === 'loading' ? 'Chargement de la carte…' : 'Carte indisponible sur cet appareil.'}
          </Text>
        </View>
      ) : null}
      <MapAttribution bottom={bottomInset + 4} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: MAP_COLORS.background },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  overlayText: { color: '#7A8691', fontSize: 13, fontWeight: '600' },
});
